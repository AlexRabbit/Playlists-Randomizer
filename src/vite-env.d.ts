/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_BASE_PATH: string;
  readonly VITE_DEV_PORT: string;
  readonly VITE_DEFAULT_RANDOM: string;
  readonly VITE_DEFAULT_SHOW_VIDEO: string;
  readonly VITE_DEFAULT_NO_ADS: string;
  readonly VITE_DEFAULT_AUTOPLAY_NEXT: string;
  readonly VITE_YOUTUBE_API_KEY: string;
  readonly VITE_YOUTUBE_PLAYER_VARS: string;
  readonly VITE_LOG_LEVEL: string;
  readonly VITE_LOG_MAX_ENTRIES: string;
  readonly VITE_URL_STATE_VERSION: string;
  readonly VITE_LEGACY_PID_COMPAT: string;
  readonly VITE_PLAYLIST_PROXY_URL?: string;
  readonly VITE_PLAYLIST_PROXY_B64?: string;
  readonly VITE_CORS_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
