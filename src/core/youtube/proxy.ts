import type { VideoEntry } from '../models/workspace';
import { log } from '@/logs/logger';
import { getPlaylistProxyUrl } from './proxy-config';

/** ytplr-compatible proxy: GET ?playlistId= → { status, response: [{id, title}] } */
export async function fetchPlaylistVideosProxy(playlistId: string): Promise<VideoEntry[]> {
  const base = getPlaylistProxyUrl();
  if (!base) throw new Error('Playlist proxy not configured');

  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}playlistId=${encodeURIComponent(playlistId)}`;
  log.info('youtube', 'Fetching playlist via proxy', { playlistId, url: base });

  const res = await fetch(url);
  const text = await res.text();
  let data: {
    status: number;
    response?: { id: string; title: string }[];
    title?: string;
  };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Playlist proxy returned invalid JSON (HTTP ${res.status})`);
  }

  if (data.status !== 200 || !data.response?.length) {
    throw new Error(data.title ?? `Playlist proxy error (${data.status})`);
  }

  const videos = data.response.map((v) => ({
    videoId: v.id,
    title: v.title || 'Unknown',
    playlistId: playlistId.includes('~:-') ? parsePrimaryPlaylistId(playlistId) : playlistId,
  }));

  log.info('youtube', 'Proxy playlist loaded', { playlistId, count: videos.length });
  return videos;
}

export function hasPlaylistProxy(): boolean {
  return Boolean(getPlaylistProxyUrl());
}

function parsePrimaryPlaylistId(raw: string): string {
  const first = raw.split('~:-')[0]?.trim() ?? raw;
  const m = first.match(/^(PL[\w-]+)/);
  return m?.[1] ?? first;
}
