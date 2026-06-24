import type { YTNamespace, YTPlayer } from '@/core/youtube/player';

export { E2E_MOCK_VIDEOS, isE2E } from './flags';

const PLAYING = 1;
const PAUSED = 2;

class MockYTPlayer implements YTPlayer {
  private state = PAUSED;
  private currentTime = 0;
  private duration = 120;
  private volume = 100;
  readonly videoId: string;
  readonly container: HTMLElement;

  constructor(container: HTMLElement, videoId: string) {
    this.container = container;
    this.videoId = videoId;
    const iframe = document.createElement('iframe');
    iframe.className = 'yt-mock-iframe';
    iframe.dataset.videoId = videoId;
    iframe.title = 'Mock YouTube player';
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; airplay');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.background = '#111';
    container.replaceChildren(iframe);
  }

  playVideo(): void {
    this.state = PLAYING;
  }

  pauseVideo(): void {
    this.state = PAUSED;
  }

  stopVideo(): void {
    this.state = PAUSED;
    this.currentTime = 0;
  }

  loadVideoById(videoId: string, startSeconds?: number): void {
    this.container.querySelector('iframe')?.setAttribute('data-video-id', videoId);
    if (startSeconds != null) this.currentTime = startSeconds;
    this.state = PAUSED;
  }

  getPlayerState(): number {
    return this.state;
  }

  getCurrentTime(): number {
    if (this.state === PLAYING) this.currentTime += 0.5;
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  seekTo(seconds: number): void {
    this.currentTime = seconds;
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  getVolume(): number {
    return this.volume;
  }

  destroy(): void {
    this.container.replaceChildren();
  }

  setSize(): void {
    /* noop — layout handled by CSS */
  }
}

export function installMockYouTubeApi(): void {
  if (window.YT?.Player) return;

  const YT: YTNamespace = {
    Player: class MockPlayer implements YTPlayer {
      private inner: MockYTPlayer;

      constructor(el: HTMLElement | string, opts: { videoId?: string; events?: { onReady?: (e: { target: YTPlayer }) => void; onStateChange?: (e: { data: number; target: YTPlayer }) => void } }) {
        const container = typeof el === 'string' ? (document.getElementById(el) ?? document.createElement('div')) : el;
        this.inner = new MockYTPlayer(container, opts.videoId ?? 'e2eVideo000001');
        const target = this as unknown as YTPlayer;
        queueMicrotask(() => opts.events?.onReady?.({ target }));
      }

      playVideo(): void {
        this.inner.playVideo();
      }
      pauseVideo(): void {
        this.inner.pauseVideo();
      }
      stopVideo(): void {
        this.inner.stopVideo();
      }
      loadVideoById(videoId: string, startSeconds?: number): void {
        this.inner.loadVideoById(videoId, startSeconds);
      }
      getPlayerState(): number {
        return this.inner.getPlayerState();
      }
      getCurrentTime(): number {
        return this.inner.getCurrentTime();
      }
      getDuration(): number {
        return this.inner.getDuration();
      }
      seekTo(seconds: number): void {
        this.inner.seekTo(seconds);
      }
      setVolume(volume: number): void {
        this.inner.setVolume(volume);
      }
      getVolume(): number {
        return this.inner.getVolume();
      }
      destroy(): void {
        this.inner.destroy();
      }
      setSize(): void {
        this.inner.setSize();
      }
    },
    PlayerState: {
      UNSTARTED: -1,
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
      BUFFERING: 3,
      CUED: 5,
    },
  };

  window.YT = YT;
  window.onYouTubeIframeAPIReady?.();
}