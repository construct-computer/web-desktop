/**
 * Per-window title-bar accessory store.
 *
 * App content components (e.g. AppWindow) can register an extra element
 * — typically an action button — to render on the right side of their
 * window's title bar. The Window chrome reads from this store so the
 * accessory lives in the title bar without having to bubble state up
 * through props.
 *
 * Usage:
 *   useWindowTitleBarAccessory(config.id, <button>...</button>);
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { create } from 'zustand';

interface WindowAccessoryState {
  accessories: Record<string, ReactNode>;
  setAccessory: (windowId: string, node: ReactNode | null) => void;
}

export const useWindowAccessoryStore = create<WindowAccessoryState>((set) => ({
  accessories: {},
  setAccessory: (windowId, node) =>
    set((state) => {
      const next = { ...state.accessories };
      if (node == null) delete next[windowId];
      else next[windowId] = node;
      return { accessories: next };
    }),
}));

/**
 * Register a title-bar accessory for the given window id. Automatically
 * clears on unmount. The effect re-runs whenever `node` changes, so a
 * fresh closure is stored each render — safe for buttons that capture
 * component state (e.g. a toggle).
 */
export function useWindowTitleBarAccessory(windowId: string, node: ReactNode | null): void {
  const setAccessory = useWindowAccessoryStore((s) => s.setAccessory);
  useEffect(() => {
    setAccessory(windowId, node);
    return () => setAccessory(windowId, null);
  }, [windowId, node, setAccessory]);
}
