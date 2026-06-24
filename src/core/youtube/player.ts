import type { CardSettings } from '../models/workspace';
import { VolumeBoostAudio } from './volume-boost';
import { VOLUME_SLIDER_MAX, sliderToYoutubeApi } from './volume';
import { log } from '@/logs/logger';
import { installMockYouTubeApi } from '@/e2e/stubs';
import { isE2E } from '@/e2e/flags';

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
  if (isE2E()) {
    installMockYouTubeApi();
    return Promise.resolve();
  }
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
const BUFFERING = 3;

export type SeekCallback = (current: number, duration: number) => void;
export type PlayerErrorCallback = (code: number) => void;
export type PlayStateCallback = (playing: boolean) => void;

export const SKIPPABLE_ERROR_CODES = new Set([2, 5, 100, 101, 150]);

export class YouTubePlayerController {
  private player: YTPlayer | null = null;
  private boost: VolumeBoostAudio | null = null;
  private useBoost = false;
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
  private iframeReady: Promise<void> | null = null;
  private userWantsPlay = false;

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

  private wantsBoost(): boolean {
    return this.volume > 100;
  }

  private setPlayingState(playing: boolean): void {
    this.onPlayStateChange?.(playing);
  }

  private ensureBoost(): VolumeBoostAudio {
    if (!this.boost) {
      this.boost = new VolumeBoostAudio();
      this.boost.onEnded(() => {
        if (!this.useBoost) return;
        this.setPlayingState(false);
        this.stopTick();
        this.onEnded?.();
      });
      this.boost.onError(() => {
        if (this.useBoost) this.onPlayError?.(5);
      });
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

  private async tryLoadBoost(videoId: string): Promise<boolean> {
    if (!this.wantsBoost()) {
      this.useBoost = false;
      return false;
    }
    try {
      const boost = this.ensureBoost();
      await boost.load(videoId);
      this.useBoost = true;
      boost.setVolume(this.volume);
      return true;
    } catch (e) {
      log.warn('player', 'Volume boost unavailable, using iframe volume', { error: String(e) });
      this.useBoost = false;
      return false;
    }
  }

  private waitForIframeReady(): Promise<void> {
    return this.iframeReady ?? Promise.resolve();
  }

  private async ensureIframe(videoId: string, startAt = 0): Promise<void> {
    await loadYouTubeApi();
    const YT = window.YT!;
    const h = 360;
    const w = 640;

    if (!this.mounted) {
      this.iframeReady = new Promise((resolve) => {
        this.player = new YT.Player(this.container, {
          height: h,
          width: w,
          videoId,
          playerVars: {
            ...buildPlayerVars(this.settings),
            autoplay: 0,
            mute: 0,
            ...(startAt > 0 ? { start: Math.floor(startAt) } : {}),
          },
          events: {
            onStateChange: (e) => {
              if (this.useBoost) return;
              if (e.data === ENDED) {
                this.setPlayingState(false);
                this.stopTick();
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
              this.applyIframeVolume(e.target);
              if (startAt > 0.5) {
                try {
                  e.target.seekTo(startAt, true);
                } catch {
                  /* not ready */
                }
              }
              resolve();
            },
          },
        });
        this.mounted = true;
        this.currentVideoId = videoId;
      });
      await this.waitForIframeReady();
      return;
    }

    await this.waitForIframeReady();
    if (this.currentVideoId !== videoId) {
      this.player!.loadVideoById(videoId, startAt > 0.5 ? startAt : undefined);
      this.currentVideoId = videoId;
    }
    this.applyIframeVolume(this.player!);
  }

  private applyIframeVolume(target: YTPlayer): void {
    try {
      target.setVolume(this.useBoost ? 0 : sliderToYoutubeApi(this.volume));
    } catch {
      /* not ready */
    }
  }

  private async startPlayback(): Promise<void> {
    this.userWantsPlay = true;
    if (this.useBoost && this.boost) {
      try {
        await this.boost.play();
      } catch (e) {
        log.warn('player', 'Boost play failed, falling back to iframe', { error: String(e) });
        this.useBoost = false;
        if (this.player) this.applyIframeVolume(this.player);
      }
    }

    if (this.player) {
      if (!this.useBoost || this.settings.showVideo) {
        this.player.playVideo();
      }
    }

    this.startTick();
    this.setPlayingState(true);
  }

  async load(videoId: string, autoplay = true): Promise<void> {
    const boostOk = await this.tryLoadBoost(videoId);
    const needsIframe = this.settings.showVideo || !boostOk;
    if (needsIframe) {
      await this.ensureIframe(videoId);
      if (!this.settings.showVideo) this.hideVideoSurface();
    }

    this.currentVideoId = videoId;

    if (autoplay) {
      await this.startPlayback();
    }
  }

  async init(videoId: string): Promise<void> {
    return this.load(videoId, true);
  }

  play(videoId: string): void {
    void this.load(videoId, true);
  }

  pause(): void {
    this.userWantsPlay = false;
    this.boost?.pause();
    this.player?.pauseVideo();
    this.stopTick();
    this.setPlayingState(false);
  }

  resume(): void {
    void this.startPlayback();
  }

  seek(seconds: number): void {
    this.boost?.seek(seconds);
    this.player?.seekTo(seconds, true);
  }

  private async syncBoostPlayback(pos: number, shouldPlay: boolean): Promise<void> {
    if (!this.useBoost || !this.boost) return;
    if (pos > 0.5) this.boost.seek(pos);
    if (shouldPlay) {
      try {
        await this.boost.play();
      } catch (e) {
        log.warn('player', 'Boost play failed after volume change', { error: String(e) });
      }
    }
    if (this.player) {
      this.applyIframeVolume(this.player);
      if (this.settings.showVideo && shouldPlay) this.syncIframeVideoAt(pos);
    }
  }

  async setVolume(vol: number): Promise<void> {
    const prev = this.volume;
    this.volume = Math.max(0, Math.min(VOLUME_SLIDER_MAX, vol));

    const wasBoost = this.useBoost;
    const wantBoost = this.wantsBoost();
    const wasPlaying = this.userWantsPlay;
    const pos = this.getCurrentTime();

    if (wantBoost && !wasBoost && this.currentVideoId) {
      await this.tryLoadBoost(this.currentVideoId);
      if (this.useBoost) await this.syncBoostPlayback(pos, wasPlaying);
    } else if (!wantBoost && wasBoost) {
      this.useBoost = false;
      if (this.player) this.applyIframeVolume(this.player);
    }

    if (this.useBoost && this.boost) {
      this.boost.setVolume(this.volume);
    } else if (this.player) {
      this.applyIframeVolume(this.player);
    }

    if (prev !== this.volume && wantBoost !== wasBoost) {
      /* volume mode switched */
    }
  }

  getVolume(): number {
    return this.volume;
  }

  getCurrentTime(): number {
    if (this.useBoost && this.boost) return this.boost.getCurrentTime();
    try {
      return this.player?.getCurrentTime() ?? 0;
    } catch {
      return 0;
    }
  }

  wantsPlayback(): boolean {
    return this.userWantsPlay;
  }

  getPlaybackTime(): number {
    return this.getCurrentTime();
  }

  getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }

  getCastAudioElement(): HTMLMediaElement | null {
    return this.boost?.getAudioElement() ?? null;
  }

  getCastIframeElement(): HTMLIFrameElement | null {
    return this.container.querySelector('iframe');
  }

  restorePlayback(pos: number, shouldPlay: boolean): void {
    if (pos > 0.5) this.seek(pos);
    if (shouldPlay) void this.resumeAfterSurfaceChange(pos);
  }

  /** Show iframe at full size (overlay open) without reloading. */
  showVideoSurface(): void {
    this.applyIframeVisibility(true);
    this.scheduleIframeResize();
  }

  /** Hide iframe visually (overlay closed) but keep playback running. */
  hideVideoSurface(): void {
    this.applyIframeVisibility(false);
  }

  private scheduleIframeResize(): void {
    const resize = () => {
      try {
        this.player?.setSize(640, 360);
      } catch {
        /* not ready */
      }
    };
    resize();
    requestAnimationFrame(resize);
  }

  private applyIframeVisibility(visible: boolean): void {
    const el = this.container.querySelector('iframe') as HTMLIFrameElement | null;
    if (visible) {
      this.container.style.width = '100%';
      this.container.style.height = '100%';
    }
    if (!el) return;
    // Never use display:none — YouTube iframe goes black / pauses when hidden that way.
    if (visible) {
      el.style.visibility = '';
      el.style.position = '';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.opacity = '1';
      el.style.pointerEvents = '';
      el.style.left = '';
      el.style.top = '';
      el.setAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; airplay'
      );
      el.setAttribute('allowfullscreen', '');
    } else {
      el.style.visibility = 'hidden';
      el.style.position = 'absolute';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.style.left = '-9999px';
      el.style.top = '0';
    }
  }

  private syncIframeVideoAt(pos: number): void {
    if (!this.player) return;
    try {
      if (pos > 0.5) this.player.seekTo(pos, true);
      this.player.playVideo();
    } catch {
      /* not ready */
    }
  }

  /** Create or resize iframe for video overlay without restarting playback. */
  async attachVideoSurface(): Promise<void> {
    if (!this.currentVideoId) return;
    const pos = this.getCurrentTime();

    if (!this.mounted) {
      const prevShow = this.settings.showVideo;
      this.settings = { ...this.settings, showVideo: true };
      await this.ensureIframe(this.currentVideoId, pos);
      this.settings = { ...this.settings, showVideo: prevShow || true };
    }

    this.showVideoSurface();

    if (this.useBoost && this.userWantsPlay) this.syncIframeVideoAt(pos);
    else if (!this.useBoost && pos > 0.5) this.seek(pos);
  }

  async resumeAfterSurfaceChange(savedPos?: number): Promise<void> {
    const pos = savedPos ?? this.getCurrentTime();
    this.userWantsPlay = true;
    if (this.useBoost && this.boost) {
      if (!this.boost.isPlaying()) {
        try {
          await this.boost.play();
        } catch {
          /* gesture / transient */
        }
      }
      this.syncIframeVideoAt(pos);
    } else {
      try {
        if (pos > 0.5) this.player?.seekTo(pos, true);
        this.player?.playVideo();
      } catch {
        /* not ready */
      }
    }
    this.startTick();
    this.setPlayingState(true);
  }

  isPlaying(): boolean {
    if (!this.userWantsPlay) return false;
    if (this.useBoost && this.boost?.isPlaying()) return true;
    try {
      const state = this.player?.getPlayerState();
      if (state === PLAYING || state === BUFFERING) return true;
      return this.userWantsPlay;
    } catch {
      return this.userWantsPlay;
    }
  }

  isPaused(): boolean {
    return !this.isPlaying();
  }

  hasPlayer(): boolean {
    return this.mounted || this.useBoost;
  }

  destroy(): void {
    this.stopTick();
    this.boost?.destroy();
    this.boost = null;
    this.useBoost = false;
    this.iframeReady = null;
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
    if (!settings.showVideo) this.hideVideoSurface();
  }
}
