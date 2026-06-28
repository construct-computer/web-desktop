import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from './windowStore';
import { useAuthStore } from './authStore';
import { STORAGE_KEYS } from '@/lib/config';
import {
  computeDefaultOpenBounds,
  computeVisuallyCenteredPosition,
  getDesktopWorkArea,
} from '@/lib/windowBounds';
import { MENUBAR_HEIGHT } from '@/lib/constants';

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

  it('honors explicit initial size overrides', () => {
    const workArea = getDesktopWorkArea({ mobile: false, stageManagerActive: false });
    const width = 1000;
    const height = 560;
    const expected = computeVisuallyCenteredPosition(workArea, { width, height });

    const id = useWindowStore.getState().openWindow('subscribe', { width, height });
    const win = useWindowStore.getState().windows.find((w) => w.id === id);

    expect(win?.width).toBe(width);
    expect(win?.height).toBe(height);
    expect(win?.x).toBe(expected.x);
    expect(win?.y).toBe(expected.y);
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

describe('openWindow access', () => {
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
    useAuthStore.setState({ user: { plan: 'unsubscribed' } as never });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still opens app windows for unsubscribed users', () => {
    const id = useWindowStore.getState().openWindow('app', {
      title: 'Example App',
      metadata: { appId: 'example-app' },
    });

    expect(id).toBeTruthy();
    const win = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(win?.type).toBe('app');
    expect(win?.metadata?.appId).toBe('example-app');
  });

  it('opens subscribe with the logo icon', () => {
    const id = useWindowStore.getState().openWindow('subscribe', { width: 1000, height: 640 });
    const win = useWindowStore.getState().windows.find((w) => w.id === id);

    expect(win?.title).toBe('Subscribe');
    expect(win?.icon).toBeTruthy();
  });
});

function legacyViewportCenterY(height: number, innerHeight: number): number {
  const areaH = innerHeight - MENUBAR_HEIGHT;
  return Math.max(0, Math.round((areaH - height) / 2));
}

async function flushAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

describe('minimize restore visual centering', () => {
  beforeAll(() => {
    useAuthStore.setState({ user: { plan: 'pro' } as never });
  });

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1440);
    vi.stubGlobal('innerHeight', 900);
    vi.stubGlobal('localStorage', mockLocalStorage());
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    useWindowStore.setState({
      windows: [],
      focusedWindowId: null,
      nextZIndex: 100,
      activeWorkspaceId: 'main',
      stageManagerActive: false,
      stageManagerActiveIds: {},
      stageManagerOrder: {},
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('focusWindow recenters after minimize restore', () => {
    const store = useWindowStore.getState();
    const id = store.openWindow('settings');
    const opened = useWindowStore.getState().windows.find((w) => w.id === id)!;
    const workArea = getDesktopWorkArea({ mobile: false, stageManagerActive: false });
    const expected = computeVisuallyCenteredPosition(workArea, {
      width: opened.width,
      height: opened.height,
    });

    useWindowStore.setState({
      windows: useWindowStore.getState().windows.map((w) =>
        w.id === id
          ? { ...w, y: legacyViewportCenterY(w.height, 900) }
          : w,
      ),
    });

    store.minimizeWindow(id);
    useWindowStore.getState().focusWindow(id);

    const restored = useWindowStore.getState().windows.find((w) => w.id === id)!;
    expect(restored.state).toBe('normal');
    expect(restored.x).toBe(expected.x);
    expect(restored.y).toBe(expected.y);
    expect(restored.y).not.toBe(legacyViewportCenterY(restored.height, 900));
  });

  it('stage manager minimize restore keeps dock-aware visual center', async () => {
    useWindowStore.setState({ stageManagerActive: true });

    const store = useWindowStore.getState();
    const id = store.openWindow('files');
    const opened = useWindowStore.getState().windows.find((w) => w.id === id)!;
    const workArea = getDesktopWorkArea({ mobile: false, stageManagerActive: true });
    const expected = computeVisuallyCenteredPosition(workArea, {
      width: opened.width,
      height: opened.height,
    });

    useWindowStore.setState({
      stageManagerActiveIds: { main: [id] },
      stageManagerOrder: { main: [] },
      windows: useWindowStore.getState().windows.map((w) =>
        w.id === id
          ? {
              ...w,
              x: Math.round((1440 - w.width) / 2),
              y: legacyViewportCenterY(w.height, 900),
            }
          : w,
      ),
    });

    store.minimizeWindow(id);
    useWindowStore.getState().focusWindow(id);
    await flushAnimationFrame();

    const restored = useWindowStore.getState().windows.find((w) => w.id === id)!;
    expect(restored.state).toBe('normal');
    expect(restored.x).toBe(expected.x);
    expect(restored.y).toBe(expected.y);
  });

  it('minimize from maximized collapses to previous bounds', () => {
    const store = useWindowStore.getState();
    const id = store.openWindow('about');
    const opened = useWindowStore.getState().windows.find((w) => w.id === id)!;
    const previousBounds = {
      x: opened.x,
      y: opened.y,
      width: opened.width,
      height: opened.height,
    };

    store.maximizeWindow(id);
    store.minimizeWindow(id);

    const minimized = useWindowStore.getState().windows.find((w) => w.id === id)!;
    expect(minimized.state).toBe('minimized');
    expect(minimized.width).toBe(previousBounds.width);
    expect(minimized.height).toBe(previousBounds.height);
    expect(minimized.x).toBe(previousBounds.x);
    expect(minimized.y).toBe(previousBounds.y);
  });
});
