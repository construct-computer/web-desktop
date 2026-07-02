import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from './windowStore';
import { useAuthStore } from './authStore';
import constructLogo from '@/assets/logo.png';
import { STORAGE_KEYS } from '@/lib/config';
import {
  computeChatDockBounds,
  computeDefaultOpenBounds,
  computeVisuallyCenteredPosition,
  getDesktopWorkArea,
} from '@/lib/windowBounds';
import { MENUBAR_HEIGHT, WINDOW_TRANSITION_MS } from '@/lib/constants';

vi.useFakeTimers();

afterEach(() => {
  vi.clearAllTimers();
  useWindowStore.setState({ minimizeAnimatingWindowIds: {}, closeAnimatingWindowIds: {} });
});

afterAll(() => {
  vi.useRealTimers();
});

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

  it('opens chat as a right-docked desktop overlay window', () => {
    useWindowStore.setState({
      windows: [],
      focusedWindowId: null,
      nextZIndex: 100,
      activeWorkspaceId: 'main',
      stageManagerActive: true,
      stageManagerActiveIds: {},
      stageManagerOrder: {},
    });

    const baseId = useWindowStore.getState().openWindow('settings');
    const baseWindow = useWindowStore.getState().windows.find((w) => w.id === baseId)!;
    const activeBefore = useWindowStore.getState().stageManagerActiveIds.main;

    const workArea = getDesktopWorkArea({ mobile: false, stageManagerActive: true });
    const defaultBounds = computeDefaultOpenBounds(workArea);

    useWindowStore.getState().openWindowsGrid(['chat']);
    const win = useWindowStore.getState().windows.find((w) => w.type === 'chat');

    expect(win?.workspaceId).not.toBe('main');
    expect(win?.x).toBe(workArea.x + workArea.width - (win?.width ?? 0));
    expect(win?.y).toBe(workArea.y + Math.floor((workArea.height - (win?.height ?? 0)) / 2));
    expect(win?.width).toBeLessThan(defaultBounds.width);
    expect(win?.height).toBeGreaterThan(defaultBounds.height);
    expect(useWindowStore.getState().stageManagerActiveIds.main).toEqual(activeBefore);
    expect(baseWindow.state).toBe('normal');
    expect(useWindowStore.getState().agentWindowOpen).toBe(true);
  });

  it('opens chat centered when no other windows are open', () => {
    useWindowStore.setState({
      windows: [],
      focusedWindowId: null,
      nextZIndex: 100,
      activeWorkspaceId: 'main',
      stageManagerActive: true,
      stageManagerActiveIds: {},
      stageManagerOrder: {},
    });

    const workArea = getDesktopWorkArea({ mobile: false, stageManagerActive: true });
    const expected = computeChatDockBounds(workArea, undefined, 'center');

    const id = useWindowStore.getState().openWindow('chat');
    const win = useWindowStore.getState().windows.find((w) => w.id === id);

    expect(win?.x).toBe(expected.x);
    expect(win?.y).toBe(expected.y);
    expect(win?.workspaceId).not.toBe('main');
  });

  it('lets chat move without changing workspace', () => {
    const id = useWindowStore.getState().openWindow('chat');
    useWindowStore.getState().moveWindow(id, 120, 140);

    const win = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(win?.x).toBe(120);
    expect(win?.y).toBe(140);
    expect(win?.workspaceId).not.toBe('main');
  });

  it('allows desktop chat resizing', () => {
    const id = useWindowStore.getState().openWindow('chat');
    useWindowStore.getState().setBounds(id, { x: 80, y: 90, width: 520, height: 620 });

    const win = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(win?.x).toBe(80);
    expect(win?.y).toBe(90);
    expect(win?.width).toBe(520);
    expect(win?.height).toBe(620);
  });

  it('restores minimized chat when opening the agent window again', () => {
    const id = useWindowStore.getState().openWindow('chat');
    useWindowStore.getState().minimizeWindow(id);

    const minimized = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(minimized?.state).toBe('minimized');

    useWindowStore.getState().openAgentWindow();

    const restored = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(restored?.state).toBe('normal');
    expect(useWindowStore.getState().agentWindowOpen).toBe(true);
  });

  it('tracks minimize animation while the window is shrinking', () => {
    const id = useWindowStore.getState().openWindow('settings');

    useWindowStore.getState().minimizeWindow(id);

    expect(useWindowStore.getState().minimizeAnimatingWindowIds[id]).toBe(true);

    vi.advanceTimersByTime(WINDOW_TRANSITION_MS);

    expect(useWindowStore.getState().minimizeAnimatingWindowIds[id]).toBeUndefined();
  });

  it('animates requestCloseWindow before removing the window', () => {
    const id = useWindowStore.getState().openWindow('settings');

    useWindowStore.getState().requestCloseWindow(id);

    expect(useWindowStore.getState().closeAnimatingWindowIds[id]).toBe(true);
    expect(useWindowStore.getState().windows.some((w) => w.id === id)).toBe(true);

    vi.advanceTimersByTime(WINDOW_TRANSITION_MS);

    expect(useWindowStore.getState().closeAnimatingWindowIds[id]).toBeUndefined();
    expect(useWindowStore.getState().windows.some((w) => w.id === id)).toBe(false);
  });

  it('toggleSpotlight keeps chat open', () => {
    const id = useWindowStore.getState().openWindow('chat');
    expect(useWindowStore.getState().agentWindowOpen).toBe(true);

    useWindowStore.getState().toggleSpotlight();

    const state = useWindowStore.getState();
    expect(state.spotlightOpen).toBe(true);
    expect(state.agentWindowOpen).toBe(true);
    expect(state.windows.some((w) => w.id === id && w.type === 'chat')).toBe(true);
  });

  it('does not move chat to other workspaces', () => {
    const id = useWindowStore.getState().openWindow('chat');
    useWindowStore.getState().moveWindowToWorkspace(id, 'main');

    const win = useWindowStore.getState().windows.find((w) => w.id === id);
    expect(win?.workspaceId).not.toBe('main');
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
    expect(win?.icon).toBe(constructLogo);
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

  it('focusWindow restores the pre-minimize position, clamped to the work area', () => {
    const store = useWindowStore.getState();
    const id = store.openWindow('settings');
    const workArea = getDesktopWorkArea({ mobile: false, stageManagerActive: false });

    // Place the window at a deliberate user position inside the work area.
    const userX = workArea.x + 12;
    const userY = workArea.y + 20;
    useWindowStore.setState({
      windows: useWindowStore.getState().windows.map((w) =>
        w.id === id ? { ...w, x: userX, y: userY } : w,
      ),
    });

    store.minimizeWindow(id);
    useWindowStore.getState().focusWindow(id);

    const restored = useWindowStore.getState().windows.find((w) => w.id === id)!;
    expect(restored.state).toBe('normal');
    // User placement is preserved (previously restore always recentered).
    expect(restored.x).toBe(userX);
    expect(restored.y).toBe(userY);

    // A position outside the work area (e.g. legacy persisted bounds under
    // the dock) is clamped back inside on restore.
    useWindowStore.setState({
      windows: useWindowStore.getState().windows.map((w) =>
        w.id === id
          ? { ...w, y: legacyViewportCenterY(w.height, 900) }
          : w,
      ),
    });
    store.minimizeWindow(id);
    useWindowStore.getState().focusWindow(id);
    const reclamped = useWindowStore.getState().windows.find((w) => w.id === id)!;
    expect(reclamped.y + reclamped.height).toBeLessThanOrEqual(workArea.y + workArea.height);
    expect(reclamped.y).toBeGreaterThanOrEqual(workArea.y);
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
