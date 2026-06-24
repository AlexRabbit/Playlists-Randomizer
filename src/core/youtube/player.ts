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
  setVolume(volume: number): void;
  getVolume(): number;
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
const PAUSED = 2;

export type SeekCallback = (current: number, duration: number) => void;
export type PlayerErrorCallback = (code: number) => void;
export type PlayStateCallback = (playing: boolean) => void;

/** UI volume slider max; YouTube iframe API accepts 0–100 only. */
export const VOLUME_SLIDER_MAX = 135;

export function volumeToYoutubeApi(sliderValue: number): number {
  return Math.round(Math.max(0, Math.min(100, sliderValue)));
}

/** YT iframe error codes that mean skip to next */
export const SKIPPABLE_ERROR_CODES = new Set([2, 5, 100, 101, 150]);

export class YouTubePlayerController {
  private player: YTPlayer | null = null;
  private container: HTMLElement;
  private settings: CardSettings;
  private onEnded?: () => void;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private onSeek?: SeekCallback;
  private onPlayError?: PlayerErrorCallback;
  private onPlayStateChange?: PlayStateCallback;
  private mounted = false;
  private currentVideoId: string | null = null;
  private volume = 100;

  constructor(
    container: HTMLElement,
    settings: CardSettings,
    onEnded?: () => void,
    onSeek?: SeekCallback,
    onPlayError?: PlayerErrorCallback,
    onPlayStateChange?: PlayStateCallback
  ) {
    this.container = container;
    this.settings = settings;
    this.onEnded = onEnded;
    this.onSeek = onSeek;
    this.onPlayError = onPlayError;
    this.onPlayStateChange = onPlayStateChange;
  }

  private setPlayingState(playing: boolean): void {
    this.onPlayStateChange?.(playing);
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
        /* not ready */
      }
    }, 500);
  }

  private stopTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private bindEvents(p: YTPlayer): void {
    /* events set at construction */
  }

  async load(videoId: string, autoplay = true): Promise<void> {
    await loadYouTubeApi();
    const YT = window.YT!;

    if (!this.mounted) {
      const h = this.settings.showVideo ? 360 : 1;
      const w = this.settings.showVideo ? 640 : 1;
      this.player = new YT.Player(this.container, {
        height: h,
        width: w,
        videoId,
        playerVars: { ...buildPlayerVars(this.settings), autoplay: autoplay ? 1 : 0 },
        events: {
          onStateChange: (e) => {
            if (e.data === ENDED) {
              this.setPlayingState(false);
              this.onEnded?.();
            }
            if (e.data === PLAYING) {
              this.startTick();
              this.setPlayingState(true);
            }
            if (e.data === PAUSED) {
              this.stopTick();
              this.setPlayingState(false);
            }
          },
          onError: (e) => {
            if (SKIPPABLE_ERROR_CODES.has(e.data)) this.onPlayError?.(e.data);
          },
          onReady: (e) => {
            e.target.setVolume(this.volume);
            if (autoplay) this.startTick();
          },
        },
      });
      this.mounted = true;
      this.currentVideoId = videoId;
      return;
    }

    if (this.currentVideoId !== videoId) {
      this.player!.loadVideoById(videoId);
      this.currentVideoId = videoId;
      if (autoplay) this.startTick();
    } else if (autoplay) {
      this.player!.playVideo();
      this.startTick();
    }
  }

  /** @deprecated use load() */
  async init(videoId: string): Promise<void> {
    return this.load(videoId, true);
  }

  play(videoId: string): void {
    void this.load(videoId, true);
  }

  pause(): void {
    this.player?.pauseVideo();
    this.stopTick();
    this.setPlayingState(false);
  }

  resume(): void {
    if (!this.player) return;
    this.player.playVideo();
    this.startTick();
    this.setPlayingState(true);
  }

  seek(seconds: number): void {
    this.player?.seekTo(seconds, true);
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(VOLUME_SLIDER_MAX, vol));
    try {
      this.player?.setVolume(volumeToYoutubeApi(this.volume));
    } catch {
      /* not ready */
    }
  }

  getVolume(): number {
    return this.volume;
  }

  isPlaying(): boolean {
    try {
      return this.player?.getPlayerState() === PLAYING;
    } catch {
      return false;
    }
  }

  isPaused(): boolean {
    try {
      const s = this.player?.getPlayerState();
      return s === PAUSED || s === 5; // CUED
    } catch {
      return false;
    }
  }

  hasPlayer(): boolean {
    return this.mounted;
  }

  destroy(): void {
    this.stopTick();
    try {
      this.player?.destroy();
    } catch {
      /* noop */
    }
    this.player = null;
    this.mounted = false;
    this.currentVideoId = null;
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
