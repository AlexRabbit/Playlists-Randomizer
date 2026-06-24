import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Workspace } from '../models/workspace';
import { WORKSPACE_VERSION, createEmptyWorkspace, defaultCardSettings } from '../models/workspace';
import { normalizeWorkspace } from '../models/normalize';
import { log } from '@/logs/logger';

const QUERY_KEY = 'ws';
const HASH_KEY = 'ws';
const LEGACY_KEY = 'pid';
/** Stay under ~2000 chars total URL for IE/old proxies; use hash when longer */
const MAX_QUERY_URL_LENGTH = 2000;

/** Legacy compat: PLxxx~:-PLyyy */
export function parseLegacyPid(search: string): string[] {
  const params = new URLSearchParams(search);
  const raw = params.get(LEGACY_KEY);
  if (!raw) return [];
  return raw
    .split('~:-')
    .map((s) => s.replace(/^:/, '').trim())
    .filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
}

export function encodeWorkspace(ws: Workspace): string {
  const payload = JSON.stringify({ v: WORKSPACE_VERSION, ...ws });
  const compressed = compressToEncodedURIComponent(payload);
  log.debug('url-state', 'Encoded workspace', { lists: ws.lists.length, bytes: compressed.length });
  return compressed;
}

export function decodeWorkspace(encoded: string): Workspace | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as Workspace & { v?: number };
    if (!parsed || !Array.isArray(parsed.lists)) return null;
    return normalizeWorkspace({
      version: parsed.version ?? parsed.v ?? WORKSPACE_VERSION,
      lists: parsed.lists,
      activeListId: parsed.activeListId ?? null,
      youtubeApiKey: parsed.youtubeApiKey,
    });
  } catch (e) {
    log.error('url-state', 'Decode failed', { error: String(e) });
    return null;
  }
}

function readEncodedFromUrl(url: URL): string | null {
  const fromQuery = url.searchParams.get(QUERY_KEY);
  if (fromQuery) return fromQuery;

  const hash = url.hash.replace(/^#/, '');
  if (!hash) return null;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get(HASH_KEY);
}

/** Canonical app URL for bookmarks (GitHub Pages base path aware) */
export function buildAppUrl(): URL {
  const base = import.meta.env.BASE_URL || '/';
  const path = base.endsWith('/') ? base : `${base}/`;
  return new URL(path, window.location.origin);
}

export function buildBookmarkUrl(ws: Workspace): string {
  const url = buildAppUrl();
  url.search = '';
  url.hash = '';

  if (!ws.lists.length) return url.toString();

  const encoded = encodeWorkspace(ws);
  url.searchParams.set(QUERY_KEY, encoded);
  let href = url.toString();

  if (href.length > MAX_QUERY_URL_LENGTH) {
    url.search = '';
    url.hash = `${HASH_KEY}=${encoded}`;
    href = url.toString();
    log.info('url-state', 'Using hash storage (URL too long for query)', { length: href.length });
  }

  return href;
}

export function readWorkspaceFromUrl(href = window.location.href): Workspace {
  const url = new URL(href);
  const encoded = readEncodedFromUrl(url);

  if (encoded) {
    const decoded = decodeWorkspace(encoded);
    if (decoded) {
      log.info('url-state', 'Restored workspace from URL', {
        lists: decoded.lists.length,
        activeListId: decoded.activeListId,
        via: url.searchParams.has(QUERY_KEY) ? 'query' : 'hash',
      });
      return decoded;
    }
  }

  if (import.meta.env.VITE_LEGACY_PID_COMPAT !== 'false') {
    const legacyIds = parseLegacyPid(url.search);
    if (legacyIds.length) {
      log.info('url-state', 'Imported legacy pid format', { count: legacyIds.length });
      return normalizeWorkspace({
        version: WORKSPACE_VERSION,
        lists: [
          {
            id: 'legacy',
            name: 'Imported',
            cards: [
              {
                id: 'legacy-card',
                name: 'Playlists',
                playlistIds: legacyIds,
                settings: defaultCardSettings(),
                currentVideoIndex: 0,
              },
            ],
          },
        ],
        activeListId: 'legacy',
      });
    }
  }

  return createEmptyWorkspace();
}

export function writeWorkspaceToUrl(ws: Workspace, replace = true): void {
  const next = buildBookmarkUrl(ws);
  if (replace) {
    window.history.replaceState({ ws: true }, '', next);
  } else {
    window.history.pushState({ ws: true }, '', next);
  }
  log.debug('url-state', 'URL updated — bookmark this page to restore everything', {
    length: next.length,
    lists: ws.lists.length,
  });
}

export function copyBookmarkUrl(ws: Workspace): string {
  return buildBookmarkUrl(ws);
}
