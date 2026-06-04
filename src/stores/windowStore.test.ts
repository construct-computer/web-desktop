import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from './windowStore';
import { useAuthStore } from './authStore';
import { STORAGE_KEYS } from '@/lib/config';
import {
  computeDefaultOpenBounds,
  getDesktopWorkArea,
} from '@/lib/windowBounds';

describe('app-builder singleton metadata switching', () => {
  beforeAll(() => {
    // Grant agent access so openWindow's plan gate doesn't no-op.
    useAuthStore.setState({ user: { plan: 'pro' } as never });
  });

  it('reuses the singleton window but needs updateWindow to switch apps', () => {
    const store = useWindowStore.getState();

    const firstId = store.openWindow('app-builder', {
      title: 'Builder - App A',
      metadata: { appId: 'app-a' },
    });
    expect(firstId).toBeTruthy();

    // Opening again returns the same singleton id and does NOT apply new metadata.
    const secondId = useWindowStore.getState().openWindow('app-builder', {
      title: 'Builder - App B',
      metadata: { appId: 'app-b' },
    });
    expect(secondId).toBe(firstId);

    const stale = useWindowStore.getState().windows.find((w) => w.id === firstId);
    expect(stale?.metadata?.appId).toBe('app-a');

    // The fix: explicitly push the new metadata/title onto the singleton window.
    useWindowStore.getState().updateWindow(secondId, {
      title: 'Builder - App B',
      metadata: { appId: 'app-b' },
    });

    const updated = useWindowStore.getState().windows.find((w) => w.id === firstId);
    expect(updated?.metadata?.appId).toBe('app-b');
    expect(updated?.title).toBe('Builder - App B');
  });
});

function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('openWindow large defaults', () => {
  beforeAll(() => {
    useAuthStore.setState({ user: { plan: 'pro' } as never });
  });

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('localStorage', mockLocalStorage());
    useWindowStore.setState({
      windows: [],
      focusedWindowId: null,
      nextZIndex: 100,
      activeWorkspaceId: 'main',
      stageManagerActive: false,
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens at viewport-large default size for every type', () => {
    const workArea = getDesktopWorkArea({ mobile: false, stageManagerActive: false });
    const expected = computeDefaultOpenBounds(workArea);
    const id = useWindowStore.getState().openWindow('about');
    const win = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(win?.width).toBe(expected.width);
    expect(win?.height).toBe(expected.height);
    expect(win?.x).toBe(expected.x);
    expect(win?.y).toBe(expected.y);
    expect(win?.maxWidth).toBe(workArea.width);
    expect(win?.maxHeight).toBe(workArea.height);
  });

  it('opens centered regardless of legacy saved position in localStorage', () => {
    localStorage.setItem(
      STORAGE_KEYS.windowPositions,
      JSON.stringify({ files: { width: 320, height: 240, x: 10, y: 10 } }),
    );
    const expected = computeDefaultOpenBounds(
      getDesktopWorkArea({ mobile: false, stageManagerActive: false }),
    );
    const id = useWindowStore.getState().openWindow('files');
    const win = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(win?.width).toBe(expected.width);
    expect(win?.height).toBe(expected.height);
    expect(win?.x).toBe(expected.x);
    expect(win?.y).toBe(expected.y);
  });

  it('arrangeWindows keeps large dimensions for every window', () => {
    const expected = computeDefaultOpenBounds(
      getDesktopWorkArea({ mobile: false, stageManagerActive: false }),
    );
    const store = useWindowStore.getState();
    const id1 = store.openWindow('editor');
    const id2 = store.openWindow('terminal');
    useWindowStore.getState().arrangeWindows();
    const w1 = useWindowStore.getState().windows.find((w) => w.id === id1)!;
    const w2 = useWindowStore.getState().windows.find((w) => w.id === id2)!;
    expect(w1.width).toBe(expected.width);
    expect(w1.height).toBe(expected.height);
    expect(w2.width).toBe(expected.width);
    expect(w2.height).toBe(expected.height);
  });
});
