import { isE2E } from '@/e2e/flags';
import { getInnertube } from '@/core/youtube/innertube-session';
import type { YouTubePlayerController } from '@/core/youtube/player';
import { log } from '@/logs/logger';
import { showToast } from '@/app/toast';
import { t } from '@/i18n';

/** Official YouTube receiver for Chromecast (replaces generic media receiver). */
export const YOUTUBE_RECEIVER_APP_ID = '4F8B3483';

type CastSession = {
  loadMedia: (request: unknown) => Promise<void>;
  getCastDevice?: () => { friendlyName?: string };
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    __PRR_MOCK_CAST__?: boolean;
  }
}

export type CastPlatform = 'ios' | 'android' | 'desktop';
export type CastPrefer = 'airplay' | 'chromecast' | 'auto';

let castSdkPromise: Promise<boolean> | null = null;

function castApi(): Window['cast'] {
  return window.cast;
}

export function getCastPlatform(): CastPlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function shouldShowAirPlay(): boolean {
  if (getCastPlatform() === 'android') return false;
  return getCastPlatform() === 'ios' || isAirPlaySupported() || hasRemotePlaybackApi();
}

export function shouldShowChromecast(): boolean {
  return getCastPlatform() !== 'ios';
}

export function isAirPlaySupported(): boolean {
  return (
    typeof (HTMLVideoElement.prototype as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })
      .webkitShowPlaybackTargetPicker === 'function'
  );
}

function hasRemotePlaybackApi(): boolean {
  return 'remote' in HTMLVideoElement.prototype || 'remote' in HTMLMediaElement.prototype;
}

export function promptAirPlayWebKit(media: HTMLMediaElement): boolean {
  const el = media as HTMLMediaElement & { webkitShowPlaybackTargetPicker?: () => void };
  if (typeof el.webkitShowPlaybackTargetPicker !== 'function') return false;
  try {
    el.webkitShowPlaybackTargetPicker();
    showToast(t('castAirPlayPicker'));
    return true;
  } catch (e) {
    log.warn('cast', 'AirPlay picker failed', { error: String(e) });
    return false;
  }
}

export async function promptRemotePlayback(media: HTMLMediaElement): Promise<boolean> {
  const remote = (media as HTMLMediaElement & { remote?: RemotePlayback }).remote;
  if (!remote?.prompt) return false;
  try {
    await remote.prompt();
    showToast(t('castAirPlayPicker'));
    return true;
  } catch (e) {
    log.warn('cast', 'Remote Playback prompt failed', { error: String(e) });
    return false;
  }
}

export async function ensureChromecastSdk(): Promise<boolean> {
  if (window.__PRR_MOCK_CAST__ && castApi()?.framework) return true;
  if (castApi()?.framework) return true;
  if (castSdkPromise) return castSdkPromise;

  castSdkPromise = new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(false), 8000);
    window.__onGCastApiAvailable = (available) => {
      window.clearTimeout(timeout);
      resolve(available && !!castApi()?.framework);
    };
    if (document.querySelector('script[data-prr-cast-sdk]')) return;
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.dataset.prrCastSdk = '1';
    s.onerror = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    document.head.appendChild(s);
  });

  return castSdkPromise;
}

export async function isChromecastSupported(): Promise<boolean> {
  if (!shouldShowChromecast()) return false;
  return ensureChromecastSdk();
}

async function resolveStreamUrl(videoId: string): Promise<string | null> {
  try {
    const yt = await getInnertube();
    const format = await yt.getStreamingData(videoId, { type: 'video', quality: 'best' });
    return format.url ?? null;
  } catch (e) {
    log.warn('cast', 'Stream URL unavailable for Chromecast fallback', { videoId, error: String(e) });
    return null;
  }
}

function castDeviceLabel(session: CastSession | null): string {
  try {
    return session?.getCastDevice?.()?.friendlyName ?? t('castDefaultDevice');
  } catch {
    return t('castDefaultDevice');
  }
}

async function loadYoutubeReceiverMedia(
  cast: NonNullable<Window['cast']>,
  session: CastSession,
  videoId: string,
  title?: string
): Promise<boolean> {
  const mediaInfo = new cast.media.MediaInfo(`https://www.youtube.com/watch?v=${videoId}`, 'video/mp4');
  mediaInfo.streamType = cast.media.StreamType.BUFFERED;
  mediaInfo.metadata = new cast.media.GenericMediaMetadata();
  mediaInfo.metadata.title = title ?? videoId;
  mediaInfo.metadata.subtitle = 'YouTube';

  const request = new cast.media.LoadRequest(mediaInfo);
  await session.loadMedia(request);
  return true;
}

async function loadStreamReceiverMedia(
  cast: NonNullable<Window['cast']>,
  session: CastSession,
  streamUrl: string,
  title?: string
): Promise<void> {
  const mediaInfo = new cast.media.MediaInfo(streamUrl, 'video/mp4');
  mediaInfo.metadata = new cast.media.GenericMediaMetadata();
  mediaInfo.metadata.title = title ?? 'Video';
  const request = new cast.media.LoadRequest(mediaInfo);
  await session.loadMedia(request);
}

export async function castToChromecast(videoId: string, title?: string): Promise<boolean> {
  const ok = await ensureChromecastSdk();
  const cast = castApi();
  if (!ok || !cast?.framework) {
    showToast(t('castUnavailable'));
    return false;
  }

  try {
    const ctx = cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: YOUTUBE_RECEIVER_APP_ID,
      autoJoinPolicy: cast.framework.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    await ctx.requestSession();
    const session = ctx.getCurrentSession() as CastSession | null;
    if (!session) return false;

    if (isE2E() && window.__PRR_MOCK_CAST__) {
      showToast(t('castStarted', { device: castDeviceLabel(session) }));
      return true;
    }

    try {
      await loadYoutubeReceiverMedia(cast, session, videoId, title);
    } catch (e) {
      log.warn('cast', 'YouTube receiver failed, trying stream fallback', { error: String(e) });
      const streamUrl = await resolveStreamUrl(videoId);
      if (!streamUrl) {
        showToast(t('castUnavailable'));
        return false;
      }
      ctx.setOptions({
        receiverApplicationId: cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: cast.framework.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      await loadStreamReceiverMedia(cast, session, streamUrl, title);
    }

    showToast(t('castStarted', { device: castDeviceLabel(session) }));
    return true;
  } catch (e) {
    log.warn('cast', 'Chromecast session failed', { error: String(e) });
    showToast(t('castFailed'));
    return false;
  }
}

export async function promptCast(options: {
  controller: YouTubePlayerController;
  title?: string;
  prefer?: CastPrefer;
}): Promise<void> {
  const videoId = options.controller.getCurrentVideoId();
  if (!videoId) {
    showToast(t('castNoVideo'));
    return;
  }

  const platform = getCastPlatform();
  const prefer = options.prefer ?? 'auto';
  const audio = options.controller.getCastAudioElement();
  const iframe = options.controller.getCastIframeElement();

  if (prefer === 'airplay' || (prefer === 'auto' && platform === 'ios')) {
    const mediaCandidates: HTMLMediaElement[] = [];
    if (audio) mediaCandidates.push(audio);
    const iframeVideo = iframe?.contentDocument?.querySelector('video');
    if (iframeVideo) mediaCandidates.push(iframeVideo);
    mediaCandidates.push(document.createElement('video'));

    for (const media of mediaCandidates) {
      if (promptAirPlayWebKit(media)) return;
      if (await promptRemotePlayback(media)) return;
    }
  }

  if (prefer === 'chromecast' || (prefer === 'auto' && platform !== 'ios')) {
    if (await castToChromecast(videoId, options.title)) return;
  }

  if (platform === 'ios' && audio && promptAirPlayWebKit(audio)) return;

  showToast(t('castUnavailable'));
}
