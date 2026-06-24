import type { VideoEntry } from '../models/workspace';
import { log } from '@/logs/logger';

const RSS_URL = 'https://www.youtube.com/feeds/videos.xml?playlist_id=';

/** Extract playlist ID from URL or raw ID */
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

export async function fetchPlaylistVideos(playlistId: string): Promise<VideoEntry[]> {
  const url = RSS_URL + encodeURIComponent(playlistId);
  log.info('youtube', 'Fetching playlist RSS', { playlistId });
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) {
    log.error('youtube', 'RSS fetch failed', { playlistId, status: res.status });
    throw new Error(`Playlist ${playlistId}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const videos = parseRssEntries(xml, playlistId);
  log.info('youtube', 'Playlist loaded', { playlistId, count: videos.length });
  return videos;
}

export async function fetchAllPlaylistVideos(playlistIds: string[]): Promise<VideoEntry[]> {
  const unique = [...new Set(playlistIds)];
  const results = await Promise.allSettled(unique.map(fetchPlaylistVideos));
  const merged: VideoEntry[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const v of r.value) {
        if (!seen.has(v.videoId)) {
          seen.add(v.videoId);
          merged.push(v);
        }
      }
    } else {
      log.warn('youtube', 'Playlist partial failure', { reason: String(r.reason) });
    }
  }
  return merged;
}

/** Seeded Fisher-Yates shuffle for reproducible order per card */
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
