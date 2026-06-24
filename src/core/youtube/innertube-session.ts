/** Shared Innertube session for playlists, stream URLs, etc. */

let innertubePromise: Promise<import('youtubei.js').Innertube> | null = null;

const safeFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export function resetInnertubeSession(): void {
  innertubePromise = null;
}

export async function getInnertube(): Promise<import('youtubei.js').Innertube> {
  const { Innertube, Platform } = await import('youtubei.js');
  try {
    Platform.shim.fetch = safeFetch;
  } catch {
    /* shim not loaded */
  }
  if (!innertubePromise) {
    innertubePromise = Innertube.create({
      generate_session_locally: true,
      retrieve_player: true,
      fetch: safeFetch,
    });
  }
  return innertubePromise;
}
