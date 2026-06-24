/** Card started playback — pause global list player only (other cards may keep playing). */
export function onCardPlaybackStart(): void {
  document.dispatchEvent(new CustomEvent('prr:pause-global'));
}

/** Global list started playback — pause every card player. */
export function onGlobalPlaybackStart(): void {
  document.dispatchEvent(new CustomEvent('prr:pause-cards'));
}

export function listenForPlaybackCoordination(handlers: {
  onPauseGlobal?: () => void;
  onPauseCards?: () => void;
}): () => void {
  const onGlobal = () => handlers.onPauseGlobal?.();
  const onCards = () => handlers.onPauseCards?.();
  document.addEventListener('prr:pause-global', onGlobal);
  document.addEventListener('prr:pause-cards', onCards);
  return () => {
    document.removeEventListener('prr:pause-global', onGlobal);
    document.removeEventListener('prr:pause-cards', onCards);
  };
}
