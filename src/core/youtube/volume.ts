/** UI volume slider range — 135 = 135% loudness via Web Audio gain. */
export const VOLUME_SLIDER_MAX = 135;

export function sliderToGain(sliderValue: number): number {
  const v = Math.max(0, Math.min(VOLUME_SLIDER_MAX, sliderValue));
  return v / 100;
}

/** Fallback when Web Audio boost is unavailable (iframe-only path). */
export function sliderToYoutubeApi(sliderValue: number): number {
  return Math.round(Math.max(0, Math.min(100, sliderValue)));
}
