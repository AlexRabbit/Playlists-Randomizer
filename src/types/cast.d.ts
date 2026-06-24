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
  class Session {
    loadMedia(request: media.LoadRequest): Promise<void>;
  }
  namespace media {
    const DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    class MediaInfo {
      constructor(contentId: string, contentType: string);
      metadata: GenericMediaMetadata;
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

declare global {
  interface Window {
    cast?: typeof cast;
  }
}

export {};
