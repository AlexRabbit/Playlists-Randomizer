import type { VideoEntry } from '../models/workspace';
import { log } from '@/logs/logger';

const API_BASE = 'https://www.googleapis.com/youtube/v3/playlistItems';

export function getApiKey(override?: string | null): string | null {
  const key = override?.trim() || import.meta.env.VITE_YOUTUBE_API_KEY?.trim();
  return key || null;
}

interface ApiItem {
  snippet?: { title?: string; resourceId?: { videoId?: string } };
  contentDetails?: { videoId?: string };
}

export async function fetchPlaylistVideosApi(
  playlistId: string,
  apiKey: string
): Promise<VideoEntry[]> {
  const videos: VideoEntry[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      key: apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const url = `${API_BASE}?${params}`;
    log.info('youtube-api', 'Fetching page', { playlistId, pageToken });
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YouTube API ${res.status}: ${body.slice(0, 120)}`);
    }
    const data = (await res.json()) as {
      items?: ApiItem[];
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      const videoId =
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (videoId) {
        videos.push({
          videoId,
          title: item.snippet?.title ?? 'Unknown',
          playlistId,
        });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  log.info('youtube-api', 'Playlist loaded via API', { playlistId, count: videos.length });
  return videos;
}
