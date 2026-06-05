import { useCallback, useEffect, useRef, type RefObject } from 'react';

const LINE_HEIGHT_PX = 16;
const SPEED_FACTOR = 1.15;

function normalizeWheelDelta(event: WheelEvent, containerWidth: number): number {
  const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY;
  if (raw === 0) return 0;

  switch (event.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return raw * LINE_HEIGHT_PX * SPEED_FACTOR;
    case WheelEvent.DOM_DELTA_PAGE:
      return raw * containerWidth * SPEED_FACTOR;
    default:
      return raw * SPEED_FACTOR;
  }
}

function isRefObject(value: unknown): value is RefObject<HTMLElement | null> {
  return !!value && typeof value === 'object' && 'current' in value;
}

export interface HorizontalWheelScrollOptions {
  /** Wheel events on the listener element scroll this target instead (e.g. tab strip). */
  scrollTargetRef?: RefObject<HTMLElement | null>;
}

/** Map vertical wheel (and trackpad horizontal delta) to horizontal scroll — no Shift required. */
export function useHorizontalWheelScroll(
  depsOrRef: unknown[] | RefObject<HTMLElement | null> = [],
  options?: HorizontalWheelScrollOptions,
): (node: HTMLElement | null) => void {
  const legacyRef = isRefObject(depsOrRef) ? depsOrRef : null;
  const deps = legacyRef ? [] : (depsOrRef as unknown[]);
  const scrollTargetRef = options?.scrollTargetRef;
  const elRef = useRef<HTMLElement | null>(legacyRef?.current ?? null);

  const setScrollEl = useCallback((node: HTMLElement | null) => {
    elRef.current = node;
    if (legacyRef) {
      (legacyRef as { current: HTMLElement | null }).current = node;
    }
  }, [legacyRef]);

  useEffect(() => {
    const listener = legacyRef?.current ?? elRef.current;
    const el = scrollTargetRef?.current ?? listener;
    if (!listener || !el) return;

    let accum = 0;
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (accum === 0) return;
      el.scrollBy({ left: accum, behavior: 'instant' });
      accum = 0;
    };

    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;

      const delta = normalizeWheelDelta(event, el.clientWidth);
      if (delta === 0) return;

      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      const scrollingLeft = delta < 0;
      const scrollingRight = delta > 0;

      if ((scrollingLeft && atStart) || (scrollingRight && atEnd)) return;

      event.preventDefault();
      event.stopPropagation();
      accum += delta;
      if (!rafId) {
        rafId = requestAnimationFrame(flush);
      }
    };

    listener.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      listener.removeEventListener('wheel', onWheel);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [setScrollEl, legacyRef, scrollTargetRef, ...deps]);

  return setScrollEl;
}
