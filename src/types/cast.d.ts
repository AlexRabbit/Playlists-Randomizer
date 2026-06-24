/** Minimal Google Cast sender typings for Chromecast support. */
declare namespace cast {
  namespace framework {
    class CastContext {
      static getInstance(): CastContext;
      setOptions(options: {
        receiverApplicationId: string;
        autoJoinPolicy: AutoJoinPolicy;
      }): void;
      requestSession(): Promise<void>;
      getCurrentSession(): Session | null;
    }
    enum AutoJoinPolicy {
      ORIGIN_SCOPED = 'origin_scoped',
    }
  }
  interface CastDevice {
    friendlyName?: string;
  }
  class Session {
    loadMedia(request: media.LoadRequest): Promise<void>;
    getCastDevice?(): CastDevice;
  }
  namespace media {
    const DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    enum StreamType {
      BUFFERED = 'BUFFERED',
      LIVE = 'LIVE',
    }
    class MediaInfo {
      contentId: string;
      contentType: string;
      streamType?: StreamType;
      metadata: GenericMediaMetadata;
      constructor(contentId: string, contentType: string);
    }
    class GenericMediaMetadata {
      title?: string;
      subtitle?: string;
    }
    class LoadRequest {
      constructor(mediaInfo: MediaInfo);
    }
  }
}

declare global {
  interface Window {
    cast?: typeof cast;
  }
}

export {};
