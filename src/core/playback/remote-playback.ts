import { getInnertube } from '@/core/youtube/innertube-session';
import { log } from '@/logs/logger';
import { showToast } from '@/app/toast';
import { t } from '@/i18n';

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
  }
}

let castSdkPromise: Promise<boolean> | null = null;

function castApi(): Window['cast'] {
  return window.cast;
}

export function isAirPlaySupported(): boolean {
  return (
    typeof (HTMLVideoElement.prototype as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })
      .webkitShowPlaybackTargetPicker === 'function'
  );
}

export function promptAirPlay(media: HTMLMediaElement): boolean {
  const el = media as HTMLMediaElement & { webkitShowPlaybackTargetPicker?: () => void };
  if (typeof el.webkitShowPlaybackTargetPicker !== 'function') return false;
  try {
    el.webkitShowPlaybackTargetPicker();
    return true;
  } catch (e) {
    log.warn('cast', 'AirPlay picker failed', { error: String(e) });
    return false;
  }
}

export async function ensureChromecastSdk(): Promise<boolean> {
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
  return ensureChromecastSdk();
}

async function resolveStreamUrl(videoId: string): Promise<string | null> {
  try {
    const yt = await getInnertube();
    const format = await yt.getStreamingData(videoId, { type: 'video', quality: 'best' });
    return format.url ?? null;
  } catch (e) {
    log.warn('cast', 'Stream URL unavailable for Chromecast', { videoId, error: String(e) });
    return null;
  }
}

export async function castToChromecast(videoId: string, title?: string): Promise<boolean> {
  const ok = await ensureChromecastSdk();
  const cast = castApi();
  if (!ok || !cast?.framework) {
    showToast(t('castUnavailable'));
    return false;
  }

  const streamUrl = await resolveStreamUrl(videoId);
  if (!streamUrl) {
    showToast(t('castUnavailable'));
    return false;
  }

  try {
    const ctx = cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: cast.framework.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    await ctx.requestSession();
    const session = ctx.getCurrentSession();
    if (!session) return false;

    const mediaInfo = new cast.media.MediaInfo(streamUrl, 'video/mp4');
    mediaInfo.metadata = new cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = title ?? videoId;
    mediaInfo.metadata.subtitle = 'YouTube';

    const request = new cast.media.LoadRequest(mediaInfo);
    await session.loadMedia(request);
    return true;
  } catch (e) {
    log.warn('cast', 'Chromecast session failed', { error: String(e) });
    showToast(t('castFailed'));
    return false;
  }
}

export async function startRemotePlayback(options: {
  videoId: string | null;
  title?: string;
  airPlayMedia?: HTMLMediaElement | null;
}): Promise<void> {
  if (!options.videoId) {
    showToast(t('castNoVideo'));
    return;
  }

  if (options.airPlayMedia && promptAirPlay(options.airPlayMedia)) return;

  await castToChromecast(options.videoId, options.title);
}
