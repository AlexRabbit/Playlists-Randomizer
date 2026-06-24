import type { Page } from '@playwright/test';

export async function installMockCastSdk(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__PRR_MOCK_CAST__ = true;
    window.cast = {
      framework: {
        AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' },
        CastContext: {
          getInstance: () => ({
            setOptions: () => undefined,
            requestSession: async () => undefined,
            getCurrentSession: () => ({
              loadMedia: async () => undefined,
              getCastDevice: () => ({ friendlyName: 'Living Room' }),
            }),
          }),
        },
      },
      media: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: 'CC1AD845',
        StreamType: { BUFFERED: 'BUFFERED', LIVE: 'LIVE' },
        MediaInfo: function (id: string, type: string) {
          return { contentId: id, contentType: type, metadata: {}, streamType: 'BUFFERED' };
        },
        GenericMediaMetadata: function () {
          return { title: '', subtitle: '' };
        },
        LoadRequest: function (media: unknown) {
          return { media };
        },
      },
    } as unknown as NonNullable<Window['cast']>;
    window.__onGCastApiAvailable?.(true);
  });
}

export async function installMockAirPlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockPicker = () => undefined;
    (
      HTMLVideoElement.prototype as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void }
    ).webkitShowPlaybackTargetPicker = mockPicker;
    (
      HTMLAudioElement.prototype as HTMLAudioElement & { webkitShowPlaybackTargetPicker?: () => void }
    ).webkitShowPlaybackTargetPicker = mockPicker;
  });
}

declare global {
  interface Window {
    __PRR_MOCK_CAST__?: boolean;
    __onGCastApiAvailable?: (available: boolean) => void;
  }
}
