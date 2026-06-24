import type { CardSettings } from '../models/workspace';

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
  setSize(width: number, height: number): void;
}

export interface YTPlayerOptions {
  height?: string | number;
  width?: string | number;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number }) => void;
  };
}

export interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

export function buildPlayerVars(settings: CardSettings): Record<string, string | number> {
  const vars: Record<string, string | number> = {
    autoplay: 0,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    iv_load_policy: 3,
  };
  if (settings.noAds) vars.fs = 0;
  const extra = import.meta.env.VITE_YOUTUBE_PLAYER_VARS;
  if (extra) {
    for (const part of extra.split('&')) {
      const [k, v] = part.split('=');
      if (k) vars[k] = v ?? '1';
    }
  }
  return vars;
}

const ENDED = 0;
const PLAYING = 1;

export type SeekCallback = (current: number, duration: number) => void;

export class YouTubePlayerController {
  private player: YTPlayer | null = null;
  private container: HTMLElement;
  private settings: CardSettings;
  private onEnded?: () => void;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private onSeek?: SeekCallback;

  constructor(
    container: HTMLElement,
    settings: CardSettings,
    onEnded?: () => void,
    onSeek?: SeekCallback
  ) {
    this.container = container;
    this.settings = settings;
    this.onEnded = onEnded;
    this.onSeek = onSeek;
  }

  private startTick(): void {
    this.stopTick();
    this.tickTimer = setInterval(() => {
      if (!this.player || !this.onSeek) return;
      try {
        const cur = this.player.getCurrentTime();
        const dur = this.player.getDuration();
        if (dur > 0) this.onSeek(cur, dur);
      } catch {
        /* player not ready */
      }
    }, 500);
  }

  private stopTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  async init(videoId: string): Promise<void> {
    await loadYouTubeApi();
    this.destroy();
    const YT = window.YT!;
    const h = this.settings.showVideo ? 360 : 1;
    const w = this.settings.showVideo ? 640 : 1;
    this.player = new YT.Player(this.container, {
      height: h,
      width: w,
      videoId,
      playerVars: buildPlayerVars(this.settings),
      events: {
        onStateChange: (e) => {
          if (e.data === ENDED) this.onEnded?.();
          if (e.data === PLAYING) this.startTick();
          if (e.data === ENDED || e.data === 2) this.stopTick();
        },
        onReady: () => this.startTick(),
      },
    });
  }

  play(videoId: string): void {
    if (!this.player) return;
    this.player.loadVideoById(videoId);
    this.startTick();
  }

  pause(): void {
    this.player?.pauseVideo();
    this.stopTick();
  }

  resume(): void {
    this.player?.playVideo();
    this.startTick();
  }

  seek(seconds: number): void {
    this.player?.seekTo(seconds, true);
  }

  isPlaying(): boolean {
    try {
      return this.player?.getPlayerState() === PLAYING;
    } catch {
      return false;
    }
  }

  destroy(): void {
    this.stopTick();
    try {
      this.player?.destroy();
    } catch {
      /* noop */
    }
    this.player = null;
    this.container.innerHTML = '';
  }

  updateSettings(settings: CardSettings): void {
    this.settings = settings;
    const el = this.container.querySelector('iframe') as HTMLIFrameElement | null;
    if (el) {
      const show = settings.showVideo;
      el.style.display = show ? '' : 'none';
      el.style.position = show ? '' : 'absolute';
      el.style.width = show ? '100%' : '1px';
      el.style.height = show ? '100%' : '1px';
      el.style.opacity = show ? '1' : '0';
      el.style.pointerEvents = show ? '' : 'none';
    }
  }
}
