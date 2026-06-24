import type { VideoEntry } from '../models/workspace';
import { log } from '@/logs/logger';
import { getCachedPlaylist, setCachedPlaylist } from '../cache/playlist-cache';
import { fetchPlaylistVideosApi, getApiKey } from './api';
import { fetchPlaylistVideosProxy, hasPlaylistProxy } from './proxy';
import { fetchPlaylistVideosInnertube, resetInnertubeSession } from './innertube-playlist';

const RSS_URL = 'https://www.youtube.com/feeds/videos.xml?playlist_id=';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** YouTube RSS no longer exposes rel=next — always ~15 videos. */
const RSS_MAX_VIDEOS = 15;
const CACHE_STALE_MAX = 20;
const MIN_CACHE_COUNT = 50;

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      log.warn('youtube', `Retry ${i + 1}/${attempts}`, { error: String(e) });
      if (i < attempts - 1) await sleep(400 * (i + 1));
    }
  }
  throw last;
}

async function fetchTextWithCorsFallback(url: string): Promise<string> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) return await res.text();
    log.warn('youtube', 'Direct RSS HTTP error', { status: res.status });
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

/** RSS fallback — capped at ~15 (YouTube removed feed pagination). */
async function fetchPlaylistVideosRss(playlistId: string): Promise<VideoEntry[]> {
  log.warn('youtube', 'Using RSS fallback (max ~15 videos)', { playlistId });
  const xml = await withRetry(() => fetchTextWithCorsFallback(RSS_URL + encodeURIComponent(playlistId)));
  const videos = parseRssEntries(xml, playlistId);
  if (!videos.length) {
    throw new Error(`Playlist ${playlistId}: no videos (private or invalid?)`);
  }
  return videos;
}

export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const patterns = [
    /[?&]list=([A-Za-z0-9_-]+)/,
    /\/show\/([A-Za-z0-9_-]+)/,
    /\/podcast\/([A-Za-z0-9_-]+)/,
    /playlist\/([A-Za-z0-9_-]+)/,
    /^((?:UU|PL|VLPL|OLAK5uy|RD)[A-Za-z0-9_-]+)$/,
    /^([A-Za-z0-9_-]{10,})$/,
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

export interface PlaylistTruncation {
  playlistId: string;
  loaded: number;
  total?: number;
}

export interface FetchPlaylistsResult {
  videos: VideoEntry[];
  truncated: PlaylistTruncation[];
}

async function tryInnertube(playlistId: string) {
  return withRetry(() => fetchPlaylistVideosInnertube(playlistId), 2);
}

async function tryInnertubeWithReset(playlistId: string) {
  try {
    return await tryInnertube(playlistId);
  } catch (e) {
    log.warn('youtube', 'Innertube failed, resetting session and retrying', {
      playlistId,
      error: String(e),
    });
    resetInnertubeSession();
    return tryInnertube(playlistId);
  }
}

function pushTruncation(
  truncated: PlaylistTruncation[],
  playlistId: string,
  loaded: number,
  total?: number
): void {
  if (total != null && loaded < total * 0.95) {
    truncated.push({ playlistId, loaded, total });
  } else if (!total && loaded <= RSS_MAX_VIDEOS) {
    truncated.push({ playlistId, loaded, total: undefined });
  }
}

async function cacheIfWorthwhile(playlistId: string, videos: VideoEntry[]): Promise<void> {
  if (videos.length >= MIN_CACHE_COUNT || videos.length > RSS_MAX_VIDEOS) {
    await setCachedPlaylist(playlistId, videos);
  } else {
    log.info('youtube', 'Skipping cache for small/partial playlist', {
      playlistId,
      count: videos.length,
    });
  }
}

export async function fetchPlaylistVideos(
  playlistId: string,
  apiKeyOverride?: string | null,
  skipCache = false
): Promise<FetchPlaylistsResult> {
  if (!skipCache) {
    const cached = await getCachedPlaylist(playlistId);
    if (cached?.length && cached.length > CACHE_STALE_MAX) {
      return { videos: cached as VideoEntry[], truncated: [] };
    }
    if (cached?.length) {
      log.info('youtube', 'Stale/small cache ignored, refetching', {
        playlistId,
        cached: cached.length,
      });
    }
  }

  const apiKey = getApiKey(apiKeyOverride);
  const truncated: PlaylistTruncation[] = [];
  let videos: VideoEntry[] = [];

  // 1) User API key → full official API
  if (apiKey) {
    try {
      videos = await withRetry(() => fetchPlaylistVideosApi(playlistId, apiKey));
      await cacheIfWorthwhile(playlistId, videos);
      log.info('youtube', 'Playlist loaded via user API', { playlistId, count: videos.length });
      return { videos, truncated };
    } catch (e) {
      log.warn('youtube', 'User API failed, trying other sources', { error: String(e) });
    }
  }

  // 2) Hosted proxy (your VPS) → full lists for everyone
  if (hasPlaylistProxy()) {
    try {
      videos = await withRetry(() => fetchPlaylistVideosProxy(playlistId));
      await cacheIfWorthwhile(playlistId, videos);
      log.info('youtube', 'Playlist loaded via proxy', { playlistId, count: videos.length });
      return { videos, truncated };
    } catch (e) {
      log.warn('youtube', 'Proxy failed, trying Innertube', { error: String(e) });
    }
  }

  // 3) Innertube in browser (~100–200 per playlist without API)
  try {
    const innertube = await tryInnertubeWithReset(playlistId);
    videos = innertube.videos;
    pushTruncation(truncated, playlistId, videos.length, innertube.totalReported);
    await cacheIfWorthwhile(playlistId, videos);
    log.info('youtube', 'Playlist loaded via Innertube', {
      playlistId,
      count: videos.length,
      totalReported: innertube.totalReported,
    });
    return { videos, truncated };
  } catch (e) {
    log.warn('youtube', 'Innertube failed', { playlistId, error: String(e) });
  }

  // 4) Last resort RSS — only ~15 videos
  videos = await fetchPlaylistVideosRss(playlistId);
  pushTruncation(truncated, playlistId, videos.length);
  log.info('youtube', 'Playlist loaded via RSS (truncated)', { playlistId, count: videos.length });
  return { videos, truncated };
}

export async function fetchAllPlaylistVideos(
  playlistIds: string[],
  apiKeyOverride?: string | null,
  skipCache = false
): Promise<FetchPlaylistsResult> {
  const unique = [...new Set(playlistIds)];
  const results = await Promise.allSettled(
    unique.map((id) => fetchPlaylistVideos(id, apiKeyOverride, skipCache))
  );
  const merged: VideoEntry[] = [];
  const truncated: PlaylistTruncation[] = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      truncated.push(...r.value.truncated);
      for (const v of r.value.videos) {
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
  return { videos: merged, truncated };
}

/** Fetch more videos for playlists already partially loaded (bypasses cache) */
export async function refreshPlaylistVideos(
  playlistIds: string[],
  apiKeyOverride?: string | null
): Promise<VideoEntry[]> {
  const unique = [...new Set(playlistIds)];
  const results = await Promise.allSettled(
    unique.map((id) => fetchPlaylistVideos(id, apiKeyOverride, true))
  );
  const merged: VideoEntry[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const v of r.value.videos) {
        if (!seen.has(v.videoId)) {
          seen.add(v.videoId);
          merged.push(v);
        }
      }
    }
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

export function mergeVideoLists(existing: VideoEntry[], incoming: VideoEntry[]): VideoEntry[] {
  const seen = new Set(existing.map((v) => v.videoId));
  const out = [...existing];
  for (const v of incoming) {
    if (!seen.has(v.videoId)) {
      seen.add(v.videoId);
      out.push(v);
    }
  }
  return out;
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
