import type { VideoEntry } from '../models/workspace';
import { log } from '@/logs/logger';
import { getInnertube, resetInnertubeSession } from './innertube-session';

export { resetInnertubeSession };

export function parsePlaylistTotalItems(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const m = String(raw).replace(/,/g, '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function extractVideoId(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  if (typeof o.id === 'string' && o.id.trim()) return o.id.trim();
  if (typeof o.content_id === 'string' && o.content_id.trim()) return o.content_id.trim();
  return null;
}

function titleFromItem(item: unknown): { title: string; unavailable: boolean } {
  if (!item || typeof item !== 'object') return { title: 'Unknown', unavailable: false };
  const o = item as Record<string, unknown>;
  const raw =
    o.title && typeof o.title === 'object' && 'toString' in o.title
      ? (o.title as { toString(): string }).toString()
      : o.metadata && typeof o.metadata === 'object'
        ? String((o.metadata as { title?: { toString(): string } }).title ?? 'Unknown')
        : 'Unknown';

  const playable = o.is_playable;
  if (playable === false) {
    if (/private/i.test(raw)) return { title: 'Private video', unavailable: true };
    if (/deleted/i.test(raw)) return { title: 'Deleted video', unavailable: true };
    return { title: raw || 'Unavailable video', unavailable: true };
  }
  if (/^deleted video$/i.test(raw)) return { title: 'Deleted video', unavailable: true };
  if (/^private video$/i.test(raw)) return { title: 'Private video', unavailable: true };
  return { title: raw || 'Unknown', unavailable: false };
}

export interface InnertubePlaylistResult {
  videos: VideoEntry[];
  totalReported?: number;
  title?: string;
}

/** Full playlist via YouTube InnerTube with continuation pages (typically 100–200+ without API key). */
export async function fetchPlaylistVideosInnertube(
  playlistId: string,
  maxVideos = 15_000
): Promise<InnertubePlaylistResult> {
  const yt = await getInnertube();
  let page = await yt.getPlaylist(playlistId);
  const totalReported = parsePlaylistTotalItems(page.info?.total_items as string | undefined);
  const rawTitle = page.info?.title;
  const title =
    typeof rawTitle === 'string'
      ? rawTitle
      : rawTitle && typeof rawTitle === 'object' && 'toString' in rawTitle
        ? String(rawTitle)
        : undefined;

  const videos: VideoEntry[] = [];
  const seen = new Set<string>();
  let batch = 0;

  const collect = () => {
    for (const item of page.videos) {
      const id = extractVideoId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const { title: vTitle, unavailable } = titleFromItem(item);
      videos.push({ videoId: id, title: vTitle, playlistId, unavailable });
      if (videos.length >= maxVideos) return;
    }
  };

  collect();
  batch++;

  while (page.has_continuation && videos.length < maxVideos) {
    log.info('youtube', 'Innertube playlist continuation', {
      playlistId,
      batch: batch + 1,
      loaded: videos.length,
    });
    page = await page.getContinuation();
    collect();
    batch++;
    if (batch > 500) break;
  }

  if (!videos.length) {
    throw new Error(`Playlist ${playlistId}: no videos (private or invalid?)`);
  }

  log.info('youtube', 'Innertube playlist complete', {
    playlistId,
    total: videos.length,
    totalReported,
    batches: batch,
  });

  return { videos, totalReported, title };
}
