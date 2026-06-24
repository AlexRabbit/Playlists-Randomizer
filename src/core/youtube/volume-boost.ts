import { getInnertube } from './innertube-session';
import { VOLUME_SLIDER_MAX, sliderToGain } from './volume';

/** Real 0–135% loudness via Web Audio gain (YouTube iframe API caps at 100). */
export class VolumeBoostAudio {
  private readonly audio = document.createElement('audio');
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private volume = 100;
  private videoId: string | null = null;
  private onEndedCb: (() => void) | null = null;
  private onErrorCb: (() => void) | null = null;
  private onTimeUpdateCb: (() => void) | null = null;
  private wired = false;

  constructor() {
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', '');
  }

  private wireEvents(): void {
    if (this.wired) return;
    this.wired = true;
    this.audio.addEventListener('ended', () => this.onEndedCb?.());
    this.audio.addEventListener('error', () => this.onErrorCb?.());
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdateCb?.());
  }

  private ensureGraph(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaElementSource(this.audio);
    this.gain = this.ctx.createGain();
    this.source.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.applyGain();
  }

  private applyGain(): void {
    if (this.gain) {
      this.gain.gain.value = sliderToGain(this.volume);
    }
  }

  async load(videoId: string): Promise<void> {
    if (this.videoId === videoId && this.audio.src) return;
    const yt = await getInnertube();
    const format = await yt.getStreamingData(videoId, { type: 'audio', quality: 'best' });
    const url = format.url;
    if (!url) throw new Error('No audio stream URL');
    this.videoId = videoId;
    this.audio.src = url;
    this.wireEvents();
    this.ensureGraph();
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error('Audio stream failed to load'));
      };
      const cleanup = () => {
        this.audio.removeEventListener('canplay', onReady);
        this.audio.removeEventListener('error', onErr);
      };
      this.audio.addEventListener('canplay', onReady, { once: true });
      this.audio.addEventListener('error', onErr, { once: true });
      this.audio.load();
    });
  }

  async play(): Promise<void> {
    await this.ctx?.resume();
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) this.audio.currentTime = seconds;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(VOLUME_SLIDER_MAX, vol));
    this.applyGain();
  }

  getVolume(): number {
    return this.volume;
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  getDuration(): number {
    const d = this.audio.duration;
    return Number.isFinite(d) ? d : 0;
  }

  getAudioElement(): HTMLAudioElement {
    return this.audio;
  }

  onEnded(fn: () => void): void {
    this.onEndedCb = fn;
  }

  onError(fn: () => void): void {
    this.onErrorCb = fn;
  }

  onTimeUpdate(fn: () => void): void {
    this.onTimeUpdateCb = fn;
  }

  destroy(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    try {
      this.source?.disconnect();
      this.gain?.disconnect();
      void this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.gain = null;
    this.source = null;
    this.videoId = null;
  }
}
