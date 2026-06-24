/** Light haptic tap on supported mobile devices */
export function hapticTap(ms = 12): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    /* noop */
  }
}

export function bindHaptic(el: HTMLElement): void {
  el.addEventListener(
    'click',
    () => {
      hapticTap();
    },
    { passive: true }
  );
}
