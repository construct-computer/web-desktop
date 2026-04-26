/**
 * Long-press helper — fires a callback after the user holds a finger
 * stationary for `delay` ms. Returns props you spread on a touch target.
 *
 * On touch, single-finger taps that move >10px cancel the press. On mouse,
 * does nothing — wire `onContextMenu` separately for desktop right-click.
 */

import { useCallback, useRef } from 'react';

interface LongPressOptions {
  delay?: number;
  /** Movement threshold in px before cancelling. */
  moveThreshold?: number;
}

export function useLongPress<T = unknown>(
  callback: (e: React.TouchEvent<HTMLElement>, ctx: T) => void,
  options: LongPressOptions = {},
) {
  const { delay = 500, moveThreshold = 10 } = options;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLElement>, ctx: T) => {
    if (e.touches.length !== 1) { cancel(); return; }
    const t = e.touches[0];
    startPos.current = { x: t.clientX, y: t.clientY };
    fired.current = false;
    cancel();
    timer.current = setTimeout(() => {
      fired.current = true;
      callback(e, ctx);
    }, delay);
  }, [callback, delay, cancel]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const start = startPos.current;
    if (!start || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dx * dx + dy * dy > moveThreshold * moveThreshold) cancel();
  }, [moveThreshold, cancel]);

  const onTouchEnd = useCallback(() => {
    cancel();
    startPos.current = null;
  }, [cancel]);

  const onTouchCancel = useCallback(() => {
    cancel();
    startPos.current = null;
    fired.current = false;
  }, [cancel]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, didFire: () => fired.current };
}
