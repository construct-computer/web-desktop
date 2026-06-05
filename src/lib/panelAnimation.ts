/** Shared open/close transition for panels and app windows. */
export function buildTransformOpacityTransition(
  ms: number,
  easing: string,
  prefersReducedMotion: boolean,
): string {
  if (prefersReducedMotion) return 'none';
  return `transform ${ms}ms ${easing}, opacity ${ms}ms ${easing}`;
}

/** Paint closed state, then flip animating on the next frame(s). */
export function kickOpenAnimation(
  setAnimating: (value: boolean) => void,
  prefersReducedMotion: boolean,
): () => void {
  if (prefersReducedMotion) {
    setAnimating(true);
    return () => {};
  }
  let cancelled = false;
  requestAnimationFrame(() => {
    if (!cancelled) {
      requestAnimationFrame(() => {
        if (!cancelled) setAnimating(true);
      });
    }
  });
  return () => {
    cancelled = true;
  };
}
