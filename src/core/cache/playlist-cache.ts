import { log } from '@/logs/logger';

const DB_NAME = 'prr-cache-v5';
const STORE = 'playlists';
const TTL_MS = 1000 * 60 * 60 * 24; // 24h client-side cache

interface CacheRow {
  playlistId: string;
  videos: { videoId: string; title: string; playlistId: string }[];
  fetchedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'playlistId' });
      }
    };
  });
}

export async function getCachedPlaylist(
  playlistId: string
): Promise<CacheRow['videos'] | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const row = tx.objectStore(STORE).get(playlistId);
      row.onsuccess = () => {
        const data = row.result as CacheRow | undefined;
        if (!data || Date.now() - data.fetchedAt > TTL_MS) {
          resolve(null);
          return;
        }
        log.debug('cache', 'IndexedDB hit', { playlistId, count: data.videos.length });
        resolve(data.videos);
      };
      row.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedPlaylist(
  playlistId: string,
  videos: CacheRow['videos']
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      playlistId,
      videos,
      fetchedAt: Date.now(),
    } satisfies CacheRow);
    log.debug('cache', 'IndexedDB stored', { playlistId, count: videos.length });
  } catch (e) {
    log.warn('cache', 'IndexedDB write failed', { error: String(e) });
  }
}

export async function clearPlaylistCache(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
  } catch {
    /* noop */
  }
}
