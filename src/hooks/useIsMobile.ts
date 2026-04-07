import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Reactive hook that returns `true` when the viewport is narrower than 768px.
 * Uses `matchMedia` so it only re-renders on actual breakpoint crossings,
 * not on every pixel of resize.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Non-reactive utility for imperative code (stores, event handlers).
 * Reads the current viewport width at call time.
 */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}
