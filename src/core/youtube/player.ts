import type { CardSettings } from '../models/workspace';
import { VolumeBoostAudio } from './volume-boost';
import { VOLUME_SLIDER_MAX, sliderToYoutubeApi } from './volume';

export { VOLUME_SLIDER_MAX } from './volume';

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

/** YT iframe error codes that mean skip to next */
export const SKIPPABLE_ERROR_CODES = new Set([2, 5, 100, 101, 150]);

export class YouTubePlayerController {
  private player: YTPlayer | null = null;
  private boost: VolumeBoostAudio | null = null;
  private useBoost = true;
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

  private ensureBoost(): VolumeBoostAudio {
    if (!this.boost) {
      this.boost = new VolumeBoostAudio();
      this.boost.onEnded(() => {
        this.setPlayingState(false);
        this.stopTick();
        this.onEnded?.();
      });
      this.boost.onError(() => this.onPlayError?.(5));
      this.boost.onTimeUpdate(() => {
        if (!this.onSeek || !this.useBoost) return;
        const dur = this.boost!.getDuration();
        if (dur > 0) this.onSeek(this.boost!.getCurrentTime(), dur);
      });
      this.boost.setVolume(this.volume);
    }
    return this.boost;
  }

  private startTick(): void {
    this.stopTick();
    this.tickTimer = setInterval(() => {
      if (!this.onSeek) return;
      try {
        if (this.useBoost && this.boost) {
          const dur = this.boost.getDuration();
          if (dur > 0) this.onSeek(this.boost.getCurrentTime(), dur);
          return;
        }
        if (!this.player) return;
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

  private async loadBoostAudio(videoId: string): Promise<void> {
    const boost = this.ensureBoost();
    try {
      await boost.load(videoId);
      this.useBoost = true;
      boost.setVolume(this.volume);
      if (this.player) this.player.setVolume(0);
    } catch {
      this.useBoost = false;
      try {
        this.player?.setVolume(sliderToYoutubeApi(this.volume));
      } catch {
        /* not ready */
      }
    }
  }

  private async ensureIframe(videoId: string, autoplay: boolean): Promise<void> {
    if (!this.settings.showVideo) return;
    await loadYouTubeApi();
    const YT = window.YT!;

    if (!this.mounted) {
      this.player = new YT.Player(this.container, {
        height: 360,
        width: 640,
        videoId,
        playerVars: {
          ...buildPlayerVars(this.settings),
          autoplay: autoplay ? 1 : 0,
          mute: this.useBoost ? 1 : 0,
        },
        events: {
          onStateChange: (e) => {
            if (!this.useBoost) {
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
            }
          },
          onError: (e) => {
            if (SKIPPABLE_ERROR_CODES.has(e.data)) this.onPlayError?.(e.data);
          },
          onReady: (e) => {
            if (this.useBoost) e.target.setVolume(0);
            else e.target.setVolume(sliderToYoutubeApi(this.volume));
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
      if (this.useBoost) this.player!.setVolume(0);
    }
  }

  async load(videoId: string, autoplay = true): Promise<void> {
    if (this.settings.showVideo) {
      await this.ensureIframe(videoId, false);
    }

    await this.loadBoostAudio(videoId);

    if (autoplay) {
      if (this.useBoost) {
        await this.boost!.play();
        this.startTick();
        this.setPlayingState(true);
        if (this.settings.showVideo && this.player) {
          this.player.playVideo();
        }
      } else if (this.settings.showVideo && this.player) {
        this.player.playVideo();
        this.startTick();
        this.setPlayingState(true);
      }
    }

    this.currentVideoId = videoId;
  }

  async init(videoId: string): Promise<void> {
    return this.load(videoId, true);
  }

  play(videoId: string): void {
    void this.load(videoId, true);
  }

  pause(): void {
    this.boost?.pause();
    this.player?.pauseVideo();
    this.stopTick();
    this.setPlayingState(false);
  }

  resume(): void {
    if (this.useBoost && this.boost) {
      void this.boost.play().then(() => {
        this.startTick();
        this.setPlayingState(true);
        if (this.settings.showVideo) this.player?.playVideo();
      });
      return;
    }
    if (!this.player) return;
    this.player.playVideo();
    this.startTick();
    this.setPlayingState(true);
  }

  seek(seconds: number): void {
    this.boost?.seek(seconds);
    this.player?.seekTo(seconds, true);
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(VOLUME_SLIDER_MAX, vol));
    if (this.useBoost && this.boost) {
      this.boost.setVolume(this.volume);
      try {
        this.player?.setVolume(0);
      } catch {
        /* noop */
      }
    } else {
      try {
        this.player?.setVolume(sliderToYoutubeApi(this.volume));
      } catch {
        /* not ready */
      }
    }
  }

  getVolume(): number {
    return this.volume;
  }

  isPlaying(): boolean {
    if (this.useBoost && this.boost) return this.boost.isPlaying();
    try {
      return this.player?.getPlayerState() === PLAYING;
    } catch {
      return false;
    }
  }

  isPaused(): boolean {
    if (this.useBoost && this.boost) return !this.boost.isPlaying();
    try {
      const s = this.player?.getPlayerState();
      return s === PAUSED || s === 5;
    } catch {
      return false;
    }
  }

  hasPlayer(): boolean {
    return this.mounted || Boolean(this.boost);
  }

  destroy(): void {
    this.stopTick();
    this.boost?.destroy();
    this.boost = null;
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
    const wasShow = this.settings.showVideo;
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
    if (!wasShow && settings.showVideo && this.currentVideoId) {
      void this.ensureIframe(this.currentVideoId, false);
    }
  }
}
