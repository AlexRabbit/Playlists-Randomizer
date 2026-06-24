/** Workspace schema version — bump when breaking URL/import format */
export const WORKSPACE_VERSION = 2;

export interface CardSettings {
  random: boolean;
  showVideo: boolean;
  noAds: boolean;
  autoplayNext: boolean;
}

export interface Card {
  id: string;
  name: string;
  playlistIds: string[];
  settings: CardSettings;
  shuffleSeed?: number;
  currentVideoIndex?: number;
}

export interface PlaylistList {
  id: string;
  name: string;
  cards: Card[];
}

export interface Workspace {
  version: number;
  lists: PlaylistList[];
  activeListId: string | null;
  /** Optional YouTube Data API key (client-side; stored in bookmark URL) */
  youtubeApiKey?: string;
}

export interface VideoEntry {
  videoId: string;
  title: string;
  playlistId: string;
  /** Deleted, private, or otherwise not playable */
  unavailable?: boolean;
}

export function defaultCardSettings(): CardSettings {
  return {
    random: import.meta.env.VITE_DEFAULT_RANDOM !== 'false',
    showVideo: import.meta.env.VITE_DEFAULT_SHOW_VIDEO === 'true',
    noAds: import.meta.env.VITE_DEFAULT_NO_ADS !== 'false',
    autoplayNext: import.meta.env.VITE_DEFAULT_AUTOPLAY_NEXT !== 'false',
  };
}

export function createId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyWorkspace(): Workspace {
  return { version: WORKSPACE_VERSION, lists: [], activeListId: null };
}

export function createList(name: string): PlaylistList {
  return { id: createId(), name: name.trim() || 'Untitled', cards: [] };
}

export function createCard(name: string): Card {
  return {
    id: createId(),
    name: name.trim() || 'Untitled',
    playlistIds: [],
    settings: defaultCardSettings(),
    currentVideoIndex: 0,
  };
}

export function youtubeThumbUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}
