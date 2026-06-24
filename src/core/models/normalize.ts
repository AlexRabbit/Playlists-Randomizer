import type { Workspace, PlaylistList, Card, CardSettings } from './workspace';
import { WORKSPACE_VERSION, defaultCardSettings } from './workspace';

function normalizeSettings(raw?: Partial<CardSettings>): CardSettings {
  const defaults = defaultCardSettings();
  return {
    random: raw?.random ?? defaults.random,
    showVideo: raw?.showVideo ?? defaults.showVideo,
    noAds: raw?.noAds ?? defaults.noAds,
    autoplayNext: raw?.autoplayNext ?? defaults.autoplayNext,
  };
}

function normalizeCard(raw: Card): Card {
  return {
    id: raw.id,
    name: raw.name || 'Untitled',
    playlistIds: Array.isArray(raw.playlistIds) ? [...raw.playlistIds] : [],
    settings: normalizeSettings(raw.settings),
    shuffleSeed: raw.shuffleSeed,
    currentVideoIndex: typeof raw.currentVideoIndex === 'number' ? raw.currentVideoIndex : 0,
  };
}

function normalizeList(raw: PlaylistList): PlaylistList {
  return {
    id: raw.id,
    name: raw.name || 'Untitled',
    cards: Array.isArray(raw.cards) ? raw.cards.map(normalizeCard) : [],
  };
}

/** Ensure decoded URL/backup data has every field — safe restore after bookmark */
export function normalizeWorkspace(raw: Workspace): Workspace {
  const lists = Array.isArray(raw.lists) ? raw.lists.map(normalizeList) : [];
  let activeListId = raw.activeListId ?? null;
  if (activeListId && !lists.some((l) => l.id === activeListId)) {
    activeListId = lists[0]?.id ?? null;
  }
  if (!activeListId && lists.length) activeListId = lists[0].id;
  return {
    version: raw.version ?? WORKSPACE_VERSION,
    lists,
    activeListId,
    youtubeApiKey: raw.youtubeApiKey,
  };
}
