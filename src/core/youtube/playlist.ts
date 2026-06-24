import type { VideoEntry } from '../models/workspace';
import { log } from '@/logs/logger';
import { getCachedPlaylist, setCachedPlaylist } from '../cache/playlist-cache';
import { fetchPlaylistVideosApi, getApiKey } from './api';

const RSS_URL = 'https://www.youtube.com/feeds/videos.xml?playlist_id=';

/** CORS fallback when browser blocks direct YouTube RSS fetch */
async function fetchTextWithCorsFallback(url: string): Promise<string> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) return await res.text();
    log.warn('youtube', 'Direct RSS HTTP error', { url, status: res.status });
  } catch (e) {
    log.debug('youtube', 'Direct RSS blocked, using proxy', { error: String(e) });
  }

  const proxyBase =
    import.meta.env.VITE_CORS_PROXY_URL || 'https://api.allorigins.win/raw?url=';
  const proxyUrl = `${proxyBase}${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Playlist fetch failed (HTTP ${res.status})`);
  return await res.text();
}

export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const patterns = [
    /[?&]list=([A-Za-z0-9_-]+)/,
    /^([A-Za-z0-9_-]{10,})$/,
    /playlist\/([A-Za-z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function parsePlaylistIdsFromText(text: string): string[] {
  const lines = text.split(/[\n,;]+/);
  const ids = new Set<string>();
  for (const line of lines) {
    const id = parsePlaylistId(line);
    if (id) ids.add(id);
  }
  return [...ids];
}

function parseRssEntries(xml: string, playlistId: string): VideoEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const entries = doc.querySelectorAll('entry');
  const videos: VideoEntry[] = [];
  entries.forEach((entry) => {
    const idEl = entry.querySelector('yt\\:videoId, videoId');
    const titleEl = entry.querySelector('title');
    const videoId = idEl?.textContent?.trim();
    const title = titleEl?.textContent?.trim() ?? 'Unknown';
    if (videoId) videos.push({ videoId, title, playlistId });
  });
  return videos;
}

async function fetchPlaylistVideosRss(playlistId: string): Promise<VideoEntry[]> {
  const url = RSS_URL + encodeURIComponent(playlistId);
  log.info('youtube', 'Fetching playlist RSS', { playlistId });
  const xml = await fetchTextWithCorsFallback(url);
  const videos = parseRssEntries(xml, playlistId);
  if (!videos.length) {
    throw new Error(`Playlist ${playlistId}: no videos in feed (private or invalid?)`);
  }
  return videos;
}

export async function fetchPlaylistVideos(
  playlistId: string,
  apiKeyOverride?: string | null
): Promise<VideoEntry[]> {
  const cached = await getCachedPlaylist(playlistId);
  if (cached?.length) return cached as VideoEntry[];

  const apiKey = getApiKey(apiKeyOverride);
  let videos: VideoEntry[];
  if (apiKey) {
    try {
      videos = await fetchPlaylistVideosApi(playlistId, apiKey);
    } catch (e) {
      log.warn('youtube', 'API failed, falling back to RSS', { error: String(e) });
      videos = await fetchPlaylistVideosRss(playlistId);
    }
  } else {
    videos = await fetchPlaylistVideosRss(playlistId);
  }

  await setCachedPlaylist(playlistId, videos);
  log.info('youtube', 'Playlist loaded', { playlistId, count: videos.length });
  return videos;
}

export async function fetchAllPlaylistVideos(
  playlistIds: string[],
  apiKeyOverride?: string | null
): Promise<VideoEntry[]> {
  const unique = [...new Set(playlistIds)];
  const results = await Promise.allSettled(
    unique.map((id) => fetchPlaylistVideos(id, apiKeyOverride))
  );
  const merged: VideoEntry[] = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      for (const v of r.value) {
        if (!seen.has(v.videoId)) {
          seen.add(v.videoId);
          merged.push(v);
        }
      }
    } else {
      failures.push(`${unique[i]}: ${String(r.reason)}`);
      log.warn('youtube', 'Playlist partial failure', { playlistId: unique[i], reason: String(r.reason) });
    }
  }
  if (!merged.length && failures.length) {
    throw new Error(failures.join('; '));
  }
  return merged;
}

export function shuffleVideos<T>(items: T[], seed?: number): T[] {
  const arr = [...items];
  let s = seed ?? Date.now();
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function orderVideos(videos: VideoEntry[], random: boolean, seed?: number): VideoEntry[] {
  return random ? shuffleVideos(videos, seed) : [...videos];
}

export function searchVideos(videos: VideoEntry[], query: string): VideoEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return videos.filter((v) => {
    const title = v.title.toLowerCase();
    return words.every((w) => title.includes(w));
  });
}
