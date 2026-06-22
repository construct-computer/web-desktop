import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import type { WindowConfig, WindowType, WindowBounds, Workspace, WorkspacePlatform, MenuBarPanelType } from '@/types';
import { generateId, clamp } from '@/lib/utils';
import { agentWS } from '@/services/websocket';
import { useAuthStore } from '@/stores/authStore';
import { hasAgentAccess } from '@/lib/plans';
import { track } from '@/lib/analytics';

/** Window types unsubscribed users can open in preview mode. */
const PREVIEW_ALLOWED_TYPES: Set<WindowType> = new Set([
  'settings', 'about', 'app-registry', 'app-builder',
]);
import {
  DEFAULT_OPEN_PADDING,
  MENUBAR_HEIGHT,
  MOBILE_MENUBAR_HEIGHT,
  DOCK_HEIGHT,
  MOBILE_APP_BAR_HEIGHT,
  STAGE_STRIP_WIDTH,
  Z_INDEX,
  STORAGE_KEYS,
} from '@/lib/constants';
import {
  getDesktopWorkArea,
  computeDefaultOpenBounds,
  computeVisuallyCenteredPosition,
  clampBoundsToWorkArea,
  computeOpenMinSize,
} from '@/lib/windowBounds';
import { isMobileViewport } from '@/hooks/useIsMobile';

/** Default workspace for the desktop/main context. */
const MAIN_WORKSPACE: Workspace = {
  id: 'main',
  name: 'Desktop',
  platform: 'desktop',
  color: '#6366f1', // indigo
};

/** Persisted app window entry — just enough to re-open it. */
interface PersistedAppWindow {
  title: string;
  icon?: string;
  metadata: Record<string, unknown>;
}

const loadPersistedAppWindows = (): PersistedAppWindow[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.openAppWindows);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const savePersistedAppWindows = (windows: WindowConfig[]) => {
  const appWindows = windows
    .filter(w => w.type === 'app' && w.workspaceId === 'main' && w.metadata?.appId)
    .map(w => ({
      title: w.title,
      icon: w.icon,
      metadata: w.metadata!,
    }));
  localStorage.setItem(STORAGE_KEYS.openAppWindows, JSON.stringify(appWindows));
};

interface WindowStore {
  windows: WindowConfig[];
  focusedWindowId: string | null;
  nextZIndex: number;

  // Workspaces
  workspaces: Workspace[];
  activeWorkspaceId: string;
  workspaceTransition: {
    fromId: string;
    toId: string;
    direction: 'left' | 'right';
  } | null;

  // Workspace actions
  createWorkspace: (opts: { id?: string; name: string; platform: WorkspacePlatform; laneKey?: string; color?: string; active?: boolean }) => string;
  switchWorkspace: (id: string) => void;
  completeWorkspaceTransition: () => void;
  deleteWorkspace: (id: string) => void;
  getWorkspaceForLane: (laneKey: string) => Workspace | undefined;
  /** Resolve the workspace ID for a session key. Always returns a valid ID, never activeWorkspaceId. */
  resolveWorkspaceForSession: (sessionKey?: string) => string;
  setWorkspaceActive: (id: string, active: boolean) => void;
  cycleWorkspaces: (reverse?: boolean) => void;
  moveWindowToWorkspace: (windowId: string, workspaceId: string, opts?: { switchView?: boolean }) => void;
  cleanupStaleWorkspaces: () => void;

  // Actions
  openWindow: (type: WindowType, options?: Partial<WindowConfig>) => string;
  closeWindow: (id: string) => void;
  /** Update a window's properties (title, metadata, etc.) without closing/reopening */
  updateWindow: (id: string, updates: Partial<Pick<WindowConfig, 'title' | 'metadata'>>) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  
  // Position/size
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  setBounds: (id: string, bounds: Partial<WindowBounds>) => void;
  
  // Bulk actions
  minimizeAll: () => void;
  closeAll: () => void;
  /** Remove all workspaces except 'main'. Used on restart/shutdown to clean up. */
  clearNonMainWorkspaces: () => void;
  
  // Helpers
  getWindow: (id: string) => WindowConfig | undefined;
  getWindowsByType: (type: WindowType) => WindowConfig[];
  getWindowsByAgent: (agentId: string) => WindowConfig[];
  getFocusedWindow: () => WindowConfig | undefined;
  cycleWindows: (reverse?: boolean) => void;
  
  // Close all windows of a given type (used by agent window:close events)
  closeWindowsByType: (type: WindowType) => void;

  // Find or create a workspace for a given platform (e.g. 'email', 'calendar')
  getOrCreateWorkspaceForPlatform: (platform: WorkspacePlatform) => string;

  // Ensure a window of this type is open and focused.
  // Optional workspaceId overrides auto-routing.
  // Optional metadata filter finds a specific window (e.g. by filePath or daemonTabId).
  /** Open a window if not already open, or focus it. Returns window ID if newly opened, null if existed. */
  ensureWindowOpen: (type: WindowType, workspaceId?: string, metadata?: Record<string, unknown>) => string | null;

  // Open multiple windows arranged in a tidy grid, auto-routed to their natural workspaces
  openWindowsGrid: (types: WindowType[]) => void;

  // Re-arrange all windows in a workspace into a tidy grid layout
  arrangeWindows: (workspaceId?: string) => void;

  // MenuBar panel (chat/tracker dropdown panels)
  menuBarPanel: MenuBarPanelType | null;
  toggleMenuBarPanel: (panel: MenuBarPanelType) => void;
  closeMenuBarPanel: () => void;

  // Mission Control (macOS-style window overview + workspace switcher)
  missionControlActive: boolean;
  toggleMissionControl: () => void;
  closeMissionControl: () => void;

  // Spotlight (Ctrl+Space command bar)
  spotlightOpen: boolean;
  toggleSpotlight: () => void;
  closeSpotlight: () => void;

  // Launchpad (macOS-style fullscreen app grid)
  launchpadOpen: boolean;
  toggleLaunchpad: () => void;
  closeLaunchpad: () => void;

  // Tracker side panel

  // Stage Manager (macOS-style sidebar with scaled window thumbnails)
  stageManagerActive: boolean;
  /** Ordered window IDs in the strip (top to bottom). Active window is NOT in this list. */
  stageManagerOrder: Record<string, string[]>;
  /** The windows currently promoted to the main area. */
  stageManagerActiveIds: Record<string, string[]>;
  toggleStageManager: () => void;
  /** Promote a window from the strip to the main area. */
  setStageActiveWindow: (id: string) => void;
  /** Add a window to the current active group */
  addWindowToStageGroup: (id: string) => void;
  /** Remove a window from the active group to the strip */
  removeWindowFromStageGroup: (id: string) => void;
}

// Window type default configurations (title + resize behavior only; size is unified)
const windowDefaults: Record<WindowType, Partial<WindowConfig>> = {
  browser: {
    title: 'Browser',
    aspectRatio: 16 / 9,
    chromeHeight: 88, // titlebar(32) + navbar(33) + statusbar(23)
  },
  terminal: { title: 'Terminal' },
  files: { title: 'Files' },
  editor: { title: 'Editor' },
  settings: { title: 'Settings' },
  about: { title: 'About' },
  calendar: { title: 'Calendar' },
  auditlogs: { title: 'Activity' },
  memory: { title: 'Knowledge' },
  email: { title: 'Email' },
  'access-control': { title: 'Approvals' },
  'app-registry': { title: 'Apps' },
  'app-builder': { title: 'Builder' },
  'document-viewer': { title: 'Document Viewer' },
  app: { title: 'App' },
};

/**
 * Debounce timers for auto-arranging windows in non-main workspaces.
 * When multiple subagent windows are created in quick succession (e.g. during
 * event replay on reconnect), we wait for the batch to settle before arranging.
 */
const arrangeDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleArrangeWindows(workspaceId: string) {
  if (workspaceId === 'main') return;
  const existing = arrangeDebounceTimers.get(workspaceId);
  if (existing) clearTimeout(existing);
  arrangeDebounceTimers.set(
    workspaceId,
    setTimeout(() => {
      arrangeDebounceTimers.delete(workspaceId);
      useWindowStore.getState().arrangeWindows(workspaceId);
    }, 500),
  );
}

/** Platform accent colors for auto-created workspaces. */
const PLATFORM_COLORS: Record<WorkspacePlatform, string> = {
  desktop: '#6366f1',   // indigo
  slack: '#4A154B',     // slack aubergine
  telegram: '#0088cc',  // telegram blue
  email: '#10b981',     // emerald
  calendar: '#f59e0b',  // amber
};

/** Human-readable names for auto-created platform workspaces. */
const PLATFORM_NAMES: Record<WorkspacePlatform, string> = {
  desktop: 'Desktop',
  slack: 'Slack',
  telegram: 'Telegram',
  email: 'Email',
  calendar: 'Calendar',
};

/**
 * Maps window types to the workspace platform they naturally belong to.
 * Window types not in this map default to the currently active workspace.
 */
const WINDOW_PLATFORM_MAP: Partial<Record<WindowType, WorkspacePlatform>> = {
  email: 'email',
  calendar: 'calendar',
};

/** Window types that only allow a single instance (opening again focuses the existing one). */
const SINGLETON_TYPES: Set<WindowType> = new Set([
  'settings', 'about', 'calendar', 'auditlogs', 'memory',
  'email', 'files', 'access-control', 'app-registry', 'app-builder',
  // NOTE: 'terminal' was removed — multiple terminal windows are supported,
  // each connecting to a separate tmux session via the terminalId metadata.
]);

export const useWindowStore = create<WindowStore>()(
  subscribeWithSelector((set, get) => ({
    windows: [],
    focusedWindowId: null,
    nextZIndex: Z_INDEX.window,

    // ── Workspaces ──────────────────────────────────────────
    workspaces: [MAIN_WORKSPACE],
    activeWorkspaceId: 'main',
    workspaceTransition: null,

    createWorkspace: (opts) => {
      const { workspaces } = get();
      // Don't create duplicate for the same lane
      if (opts.laneKey) {
        const existing = workspaces.find(w => w.laneKey === opts.laneKey);
        if (existing) return existing.id;
      }
      // Don't create duplicate if an id was provided and already exists
      if (opts.id) {
        const existing = workspaces.find(w => w.id === opts.id);
        if (existing) return existing.id;
      }
      const id = opts.id ?? generateId('ws');
      const workspace: Workspace = {
        id,
        name: opts.name,
        platform: opts.platform,
        laneKey: opts.laneKey,
        color: opts.color ?? PLATFORM_COLORS[opts.platform] ?? '#6366f1',
        active: opts.active ?? false,
      };
      set({ workspaces: [...workspaces, workspace] });
      return id;
    },

    switchWorkspace: (id) => {
      const { workspaces, activeWorkspaceId, workspaceTransition, missionControlActive } = get();
      if (id === activeWorkspaceId) return;
      if (!workspaces.some(w => w.id === id)) return;
      const targetWs = workspaces.find(w => w.id === id);

      const focusTopInWorkspace = (wsId: string) => {
        const wsWindows = get().windows.filter(w => w.workspaceId === wsId && w.state !== 'minimized');
        return wsWindows.length > 0
          ? wsWindows.reduce((a, b) => a.zIndex > b.zIndex ? a : b)
          : null;
      };

      // Determine slide direction from workspace array positions
      const fromIdx = workspaces.findIndex(w => w.id === activeWorkspaceId);
      const toIdx = workspaces.findIndex(w => w.id === id);
      const direction = toIdx > fromIdx ? 'left' : 'right';

      // Skip animation: Mission Control active, single workspace, or mobile
      const shouldSkipAnimation = missionControlActive || workspaces.length <= 1 || isMobileViewport();

      if (shouldSkipAnimation) {
        const topWindow = focusTopInWorkspace(id);
        set({
          activeWorkspaceId: id,
          focusedWindowId: topWindow?.id ?? null,
          workspaceTransition: null,
        });
        if (get().stageManagerActive) rebuildStageForWorkspace(id);
        return;
      }

      if (workspaceTransition) {
        get().completeWorkspaceTransition();
      }

      if (get().stageManagerActive) rebuildStageForWorkspace(id);

      set({
        workspaceTransition: { fromId: activeWorkspaceId, toId: id, direction },
      });
    },

    completeWorkspaceTransition: () => {
      const { workspaceTransition } = get();
      if (!workspaceTransition) return;

      const { toId } = workspaceTransition;
      const wsWindows = get().windows.filter(w => w.workspaceId === toId && w.state !== 'minimized');
      const topWindow = wsWindows.length > 0
        ? wsWindows.reduce((a, b) => a.zIndex > b.zIndex ? a : b)
        : null;

      set({
        activeWorkspaceId: toId,
        focusedWindowId: topWindow?.id ?? null,
        workspaceTransition: null,
      });
    },

    deleteWorkspace: (id) => {
      if (id === 'main') return; // cannot delete the main workspace
      const { workspaces, windows, activeWorkspaceId, workspaceTransition } = get();

      // Move orphaned windows to main workspace
      const updatedWindows = windows.map(w =>
        w.workspaceId === id ? { ...w, workspaceId: 'main' } : w
      );

      // Clear any in-flight transition involving this workspace
      const clearTransition = workspaceTransition &&
        (workspaceTransition.fromId === id || workspaceTransition.toId === id);

      const switchingToMain = activeWorkspaceId === id;
      set({
        workspaces: workspaces.filter(w => w.id !== id),
        windows: updatedWindows,
        activeWorkspaceId: switchingToMain ? 'main' : activeWorkspaceId,
        ...(clearTransition ? { workspaceTransition: null } : {}),
      });

      // Rebuild stage to include the orphaned windows that moved to main
      const effectiveWs = switchingToMain ? 'main' : get().activeWorkspaceId;
      if (get().stageManagerActive && effectiveWs === 'main') {
        rebuildStageForWorkspace('main');
      }
    },

    getWorkspaceForLane: (laneKey) => {
      return get().workspaces.find(w => w.laneKey === laneKey);
    },

    /**
     * Resolve the workspace ID for a given session key.
     * This is THE canonical function for routing agent windows to workspaces.
     *
     * Rules:
     * 1. 'default' or undefined sessionKey → 'main' (desktop workspace)
     * 2. Known sessionKey with existing workspace → that workspace's ID
     * 3. Unknown non-desktop sessionKey → LAZILY CREATE a workspace for it
     *
     * Workspaces are created on-demand when the first window needs to open,
     * NOT when a message is received. This avoids empty workspaces for
     * simple messages and lets the name reflect the actual work.
     *
     * This function NEVER returns activeWorkspaceId. Agent windows always go
     * to their session's workspace or 'main'.
     */
    resolveWorkspaceForSession: (_sessionKey?: string): string => {
      // All windows go to main workspace. Workspaces are manually managed by the user.
      return 'main';
    },

    setWorkspaceActive: (id, active) => {
      const { workspaces } = get();
      set({
        workspaces: workspaces.map(w =>
          w.id === id ? { ...w, active } : w
        ),
      });
    },

    cycleWorkspaces: (reverse = false) => {
      const { workspaces, activeWorkspaceId } = get();
      if (workspaces.length <= 1) return;
      const idx = workspaces.findIndex(w => w.id === activeWorkspaceId);
      const next = reverse
        ? (idx - 1 + workspaces.length) % workspaces.length
        : (idx + 1) % workspaces.length;
      get().switchWorkspace(workspaces[next].id);
    },

    moveWindowToWorkspace: (windowId, workspaceId, opts) => {
      const { windows, workspaces, activeWorkspaceId } = get();
      const win = windows.find(w => w.id === windowId);
      if (!win || win.workspaceId === workspaceId) return;
      if (!workspaces.some(w => w.id === workspaceId)) return;

      // Re-assign the window's workspace
      set({
        windows: windows.map(w =>
          w.id === windowId ? { ...w, workspaceId } : w
        ),
      });

      // Switch to the target workspace so the user follows the window.
      // Agent-initiated moves can pass switchView: false to avoid jarring the user.
      const switchView = opts?.switchView !== false;
      if (switchView && activeWorkspaceId !== workspaceId) {
        get().switchWorkspace(workspaceId);
      }
    },

    cleanupStaleWorkspaces: () => {
      const { workspaces, windows, activeWorkspaceId } = get();
      const toDelete: string[] = [];
      for (const ws of workspaces) {
        if (ws.id === 'main') continue;                            // never delete main
        if (ws.id === activeWorkspaceId) continue;                 // don't delete the active one
        if (ws.active) continue;                                   // agent is working on it
        if (ws.laneKey) continue;                                  // belongs to a platform agent lane
        const hasWindows = windows.some(w => w.workspaceId === ws.id);
        if (!hasWindows) {
          toDelete.push(ws.id);
        }
      }
      for (const id of toDelete) {
        get().deleteWorkspace(id);
      }
    },

    // ── Windows ─────────────────────────────────────────────
    openWindow: (type, options = {}) => {
      // Preview mode: unsubscribed users can only open whitelisted app types.
      // Telegram Mini App users are exempt from this UI block since they use the serverless agent.
      const userPlan = useAuthStore.getState().user?.plan;
      const isTelegram = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp;
      if (!isTelegram && !hasAgentAccess(userPlan) && !PREVIEW_ALLOWED_TYPES.has(type)) {
        return '';
      }

      // During a workspace transition, default new windows to the destination workspace
      const wsId = options.workspaceId ?? (get().workspaceTransition?.toId ?? get().activeWorkspaceId);
      // Prevent duplicate windows only for singleton types (settings, calendar, etc.)
      if (SINGLETON_TYPES.has(type)) {
        const existing = get().windows.find((w) => w.type === type);
        if (existing) {
          // Switch to the workspace if needed, then focus
          if (get().activeWorkspaceId !== existing.workspaceId) get().switchWorkspace(existing.workspaceId);
          get().focusWindow(existing.id);
          return existing.id;
        }
      }

      // App windows are singletons per appId — max one window per app
      if (type === 'app' && options.metadata?.appId) {
        const existing = get().windows.find(
          (w) => w.type === 'app' && w.metadata?.appId === options.metadata!.appId,
        );
        if (existing) {
          if (get().activeWorkspaceId !== existing.workspaceId) get().switchWorkspace(existing.workspaceId);
          get().focusWindow(existing.id);
          return existing.id;
        }
      }

      const defaults = windowDefaults[type] || {};
      const mobile = isMobileViewport();
      const workArea = getDesktopWorkArea({
        stageManagerActive: get().stageManagerActive,
        mobile,
      });
      const { x, y, width, height } = computeDefaultOpenBounds(workArea);

      const { windows, nextZIndex } = get();

      const id = options.id ?? generateId('window');
      
      // Auto-assign terminal session ID: first terminal gets 'main' (shared
      // with the agent's exec tool), additional terminals get unique IDs.
      let metadata = options.metadata;
      if (type === 'terminal' && !metadata?.terminalId) {
        const existingTerminals = windows.filter(w => w.type === 'terminal');
        const terminalId = existingTerminals.length === 0 ? 'main' : `term_${id.split('-').pop()}`;
        metadata = { ...metadata, terminalId };
      }

      const openMin = computeOpenMinSize(workArea);
      const minWidthRaw = Math.max(options.minWidth ?? 0, openMin.minWidth);
      const minHeightRaw = Math.max(options.minHeight ?? 0, openMin.minHeight);
      const minWidth = mobile
        ? Math.min(minWidthRaw, width)
        : minWidthRaw;
      const minHeight = mobile
        ? Math.min(minHeightRaw, height)
        : minHeightRaw;

      const newWindow: WindowConfig = {
        id,
        type,
        title: options.title ?? defaults.title ?? type,
        icon: options.icon,
        x,
        y,
        width,
        height,
        minWidth,
        minHeight,
        maxWidth: workArea.width,
        maxHeight: workArea.height,
        aspectRatio: options.aspectRatio ?? defaults.aspectRatio,
        chromeHeight: options.chromeHeight ?? defaults.chromeHeight,
        state: mobile ? 'maximized' : 'normal',
        zIndex: nextZIndex,
        workspaceId: wsId,
        agentId: options.agentId,
        metadata,
      };
      
      const newWindows = [...windows, newWindow];
      set({
        windows: newWindows,
        focusedWindowId: id,
        nextZIndex: nextZIndex + 1,
      });

      if (type === 'app' && metadata?.appId) {
        track('app_opened', { app_id: String(metadata.appId) });
      }

      // Persist open app windows so they survive refresh
      if (type === 'app') savePersistedAppWindows(newWindows);


      // Notify backend so this window type is restored on next refresh.
      // Only track windows in the main workspace — subagent/platform windows
      // are transient and should not be restored as orphans on the main desktop.
      // App windows require metadata (appId) and cannot be restored from just the type.
      if (wsId === 'main' && type !== 'app') {
        agentWS.sendWindowOpen(type);
      }

      // Stage Manager: new window becomes active, previous active goes to strip
      const sm = get();
      if (sm.stageManagerActive) {
        const wsTarget = options?.workspaceId || sm.activeWorkspaceId;
        const prevActives = sm.stageManagerActiveIds[wsTarget] || [];
        let newOrder = (sm.stageManagerOrder[wsTarget] || []).filter(wid => wid !== id);
        if (prevActives.length > 0 && !prevActives.includes(id)) {
          newOrder = [...prevActives.filter(wid => wid !== id), ...newOrder];
        }
        set({
          stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: [id] },
          stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: newOrder },
          focusedWindowId: id
        });
      }
      
      return id;
    },
    
    updateWindow: (id, updates) => {
      const { windows } = get();
      set({
        windows: windows.map((w) => {
          if (w.id !== id) return w;
          return {
            ...w,
            ...(updates.title !== undefined && { title: updates.title }),
            ...(updates.metadata !== undefined && { metadata: updates.metadata }),
          };
        }),
      });
    },

    closeWindow: (id) => {
      const { windows, focusedWindowId } = get();
      const closing = windows.find((w) => w.id === id);
      const newWindows = windows.filter((w) => w.id !== id);

      // If we closed the focused window, focus the next highest z-index window
      let newFocusedId = focusedWindowId;
      if (focusedWindowId === id) {
        const visibleWindows = newWindows.filter((w) => w.state !== 'minimized');
        if (visibleWindows.length > 0) {
          const highestWindow = visibleWindows.reduce((a, b) => 
            a.zIndex > b.zIndex ? a : b
          );
          newFocusedId = highestWindow.id;
        } else {
          newFocusedId = null;
        }
      }
      
      set({ windows: newWindows, focusedWindowId: newFocusedId });
      
      // Stage Manager: if we closed the active window, promote next from strip
      const sm = get();
      if (sm.stageManagerActive) {
        const wsTarget = closing?.workspaceId || sm.activeWorkspaceId;
        const actives = sm.stageManagerActiveIds[wsTarget] || [];
        if (actives.includes(id)) {
          const newActives = actives.filter(wid => wid !== id);
          if (newActives.length > 0) {
            set({ stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: newActives } });
          } else {
            const order = sm.stageManagerOrder[wsTarget] || [];
            const newOrder = order.filter(wid => newWindows.some(w => w.id === wid));
            if (newOrder.length > 0) {
              const promoted = newOrder.shift()!;
              set({
                stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: [promoted] },
                stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: newOrder },
                focusedWindowId: promoted
              });
            } else {
              set({
                stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: [] },
                stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: [] }
              });
            }
          }
        } else {
          // Closed a strip window — just remove from order
          const order = sm.stageManagerOrder[wsTarget] || [];
          set({ stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: order.filter(wid => wid !== id) } });
        }
      }

      // Notify backend so this window type isn't restored on next refresh.
      // Only send if no other window of the same type remains open.
      if (closing && !newWindows.some((w) => w.type === closing.type)) {
        agentWS.sendWindowClose(closing.type);
      }

      // Persist open app windows
      if (closing?.type === 'app') savePersistedAppWindows(newWindows);
    },
    
    focusWindow: (id) => {
      const { windows, nextZIndex, focusedWindowId } = get();
      if (id === focusedWindowId) return;
      
      const window = windows.find((w) => w.id === id);
      if (!window) return;

      const wasMinimized = window.state === 'minimized';
      const newState = wasMinimized ? 'normal' : window.state;

      const sm = get();
      let restorePosition: { x: number; y: number } | undefined;
      if (wasMinimized && newState === 'normal') {
        const workArea = getDesktopWorkArea({
          stageManagerActive: sm.stageManagerActive,
          mobile: isMobileViewport(),
        });
        restorePosition = computeVisuallyCenteredPosition(workArea, {
          width: window.width,
          height: window.height,
        });
      }

      set({
        windows: windows.map((w) =>
          w.id === id
            ? {
                ...w,
                zIndex: nextZIndex,
                state: newState,
                ...(restorePosition ?? {}),
              }
            : w
        ),
        focusedWindowId: id,
        nextZIndex: nextZIndex + 1,
      });

      // Stage Manager: promote focused window as active, move previous active to strip
      if (sm.stageManagerActive) {
        const wsTarget = window.workspaceId;
        const actives = sm.stageManagerActiveIds[wsTarget] || [];
        const order = sm.stageManagerOrder[wsTarget] || [];
        if (!actives.includes(id)) {
          let newOrder = [...order];
          const clickIdx = newOrder.indexOf(id);
          
          if (clickIdx !== -1 && actives.length > 0) {
            // Swap active window natively into the clicked position
            newOrder.splice(clickIdx, 1, ...actives);
          } else {
            newOrder = newOrder.filter(wid => wid !== id);
            if (actives.length > 0) {
              newOrder = [...actives, ...newOrder];
            }
          }
          set({
            stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: [id] },
            stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: newOrder }
          });
          requestAnimationFrame(() => centerStageActiveWindow(wsTarget));
        } else if (wasMinimized && actives.length === 0) {
          set({ stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: [id] } });
          requestAnimationFrame(() => centerStageActiveWindow(wsTarget));
        }
      }
    },
    
    minimizeWindow: (id) => {
      const { windows, focusedWindowId, stageManagerActive } = get();
      const target = windows.find((w) => w.id === id);
      if (!target) return;

      const mobile = isMobileViewport();
      const collapseFromMaximized = target.state === 'maximized';
      let collapsedBounds: Partial<WindowBounds> | undefined;
      if (collapseFromMaximized) {
        const workArea = getDesktopWorkArea({ stageManagerActive, mobile });
        collapsedBounds = target.previousBounds
          ? clampBoundsToWorkArea(target.previousBounds, workArea)
          : computeDefaultOpenBounds(workArea, { mobile });
      }

      set({
        windows: windows.map((w) =>
          w.id === id
            ? {
                ...w,
                state: 'minimized',
                ...(collapsedBounds ?? {}),
              }
            : w
        ),
        focusedWindowId: focusedWindowId === id ? null : focusedWindowId,
      });

      // Stage Manager: if minimizing the active window, promote next from strip.
      // If minimizing a strip window, remove it from the strip order.
      const sm = get();
      if (sm.stageManagerActive) {
        const window = get().windows.find(w => w.id === id);
        const wsTarget = window?.workspaceId || sm.activeWorkspaceId;
        const actives = sm.stageManagerActiveIds[wsTarget] || [];
        const order = sm.stageManagerOrder[wsTarget] || [];

        if (actives.includes(id)) {
          const newActives = actives.filter(wid => wid !== id);
          if (newActives.length > 0) {
            set({ stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: newActives } });
          } else {
            const newOrder = order.filter(wid => wid !== id);
            if (newOrder.length > 0) {
              const promoted = newOrder.shift()!;
              set({
                stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: [promoted] },
                stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: newOrder },
                focusedWindowId: promoted
              });
              requestAnimationFrame(() => centerStageActiveWindow(wsTarget));
            } else {
              set({
                stageManagerActiveIds: { ...sm.stageManagerActiveIds, [wsTarget]: [] },
                stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: [] }
              });
            }
          }
        } else {
          set({ stageManagerOrder: { ...sm.stageManagerOrder, [wsTarget]: order.filter(wid => wid !== id) } });
        }
      }
      
      // Focus next window
      const currentActives = get().stageManagerActiveIds[get().activeWorkspaceId] || [];
      if (focusedWindowId === id && currentActives.length === 0) {
        const visibleWindows = get().windows.filter(
          (w) => w.id !== id && w.state !== 'minimized'
        );
        if (visibleWindows.length > 0) {
          const highestWindow = visibleWindows.reduce((a, b) =>
            a.zIndex > b.zIndex ? a : b
          );
          get().focusWindow(highestWindow.id);
        }
      }
    },
    
    maximizeWindow: (id) => {
      const { windows, nextZIndex } = get();
      const window = windows.find((w) => w.id === id);
      if (!window) return;
      
      const mobile = isMobileViewport();
      const screenWidth = globalThis.innerWidth;
      const menuH = mobile ? MOBILE_MENUBAR_HEIGHT : MENUBAR_HEIGHT;
      const bottomH = mobile ? MOBILE_APP_BAR_HEIGHT : DOCK_HEIGHT;
      const stageStripW = get().stageManagerActive && !mobile ? STAGE_STRIP_WIDTH : 0;
      const screenHeight = globalThis.innerHeight - menuH - bottomH;

      const padding = mobile ? 0 : DEFAULT_OPEN_PADDING;
      const usableWidth = screenWidth - stageStripW;
      
      set({
        windows: windows.map((w) =>
          w.id === id
            ? {
                ...w,
                state: 'maximized',
                previousBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
                x: stageStripW + padding,
                y: padding,
                width: usableWidth - padding * 2,
                height: screenHeight - padding * 2,
                zIndex: nextZIndex,
              }
            : w
        ),
        focusedWindowId: id,
        nextZIndex: nextZIndex + 1,
      });
    },
    
    restoreWindow: (id) => {
      const { windows, nextZIndex } = get();
      const window = windows.find((w) => w.id === id);
      if (!window) return;
      
      const mobile = isMobileViewport();
      const workArea = getDesktopWorkArea({
        stageManagerActive: get().stageManagerActive,
        mobile,
      });
      const bounds = window.previousBounds
        ? clampBoundsToWorkArea(window.previousBounds, workArea)
        : computeDefaultOpenBounds(workArea);
      
      set({
        windows: windows.map((w) =>
          w.id === id
            ? {
                ...w,
                state: 'normal',
                ...bounds,
                zIndex: nextZIndex,
              }
            : w
        ),
        focusedWindowId: id,
        nextZIndex: nextZIndex + 1,
      });
    },
    
    toggleMaximize: (id) => {
      const window = get().windows.find((w) => w.id === id);
      if (!window) return;
      
      if (window.state === 'maximized') {
        get().restoreWindow(id);
      } else {
        get().maximizeWindow(id);
      }
    },
    
    moveWindow: (id, x, y) => {
      const { windows } = get();
      const window = windows.find((w) => w.id === id);
      set({
        windows: windows.map((w) =>
          w.id === id ? { ...w, x, y, state: 'normal' } : w
        ),
      });
    },
    
    resizeWindow: (id, width, height) => {
      const { windows } = get();
      const window = windows.find((w) => w.id === id);
      if (!window) return;
      
      const wWidth = clamp(width, window.minWidth, window.maxWidth ?? Infinity);
      const wHeight = clamp(height, window.minHeight, window.maxHeight ?? Infinity);
      
      set({
        windows: windows.map((w) =>
          w.id === id
            ? {
                ...w,
                width: wWidth,
                height: wHeight,
                state: 'normal',
              }
            : w
        ),
      });
    },
    
    setBounds: (id, bounds) => {
      const { windows } = get();
      const window = windows.find((w) => w.id === id);
      if (!window) return;
      
      const newWidth = bounds.width !== undefined ? clamp(bounds.width, window.minWidth, window.maxWidth ?? Infinity) : window.width;
      const newHeight = bounds.height !== undefined ? clamp(bounds.height, window.minHeight, window.maxHeight ?? Infinity) : window.height;
      const newX = bounds.x ?? window.x;
      const newY = bounds.y ?? window.y;
      
      set({
        windows: windows.map((w) =>
          w.id === id
            ? {
                ...w,
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight,
                state: 'normal',
              }
            : w
        ),
      });
    },
    
    minimizeAll: () => {
      const { windows } = get();
      set({
        windows: windows.map((w) => ({ ...w, state: 'minimized' })),
        focusedWindowId: null,
      });
    },
    
    closeAll: () => {
      set({ windows: [], focusedWindowId: null });
    },

    clearNonMainWorkspaces: () => {
      set(state => ({
        workspaces: state.workspaces.filter(w => w.id === 'main'),
        activeWorkspaceId: 'main',
      }));
    },
    
    closeWindowsByType: (type) => {
      const { windows, focusedWindowId } = get();
      const remaining = windows.filter((w) => w.type !== type);
      if (remaining.length === windows.length) return; // nothing to close
      
      let newFocusedId = focusedWindowId;
      if (focusedWindowId && !remaining.some((w) => w.id === focusedWindowId)) {
        const visible = remaining.filter((w) => w.state !== 'minimized');
        newFocusedId = visible.length > 0
          ? visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b)).id
          : null;
      }
      
      set({ windows: remaining, focusedWindowId: newFocusedId });
      
      // Notify backend so it can tear down associated processes
      agentWS.sendWindowClose(type);
    },
    
    getWindow: (id) => get().windows.find((w) => w.id === id),
    
    getWindowsByType: (type) => get().windows.filter((w) => w.type === type),
    
    getWindowsByAgent: (agentId) => get().windows.filter((w) => w.agentId === agentId),
    
    getFocusedWindow: () => {
      const { windows, focusedWindowId } = get();
      return windows.find((w) => w.id === focusedWindowId);
    },
    
    cycleWindows: (reverse = false) => {
      const { windows, focusedWindowId, activeWorkspaceId } = get();
      const visibleWindows = windows
        .filter((w) => w.state !== 'minimized' && w.workspaceId === activeWorkspaceId)
        .sort((a, b) => a.zIndex - b.zIndex);
      
      if (visibleWindows.length === 0) return;
      
      const currentIndex = visibleWindows.findIndex((w) => w.id === focusedWindowId);
      let nextIndex: number;
      
      if (currentIndex === -1) {
        nextIndex = 0;
      } else if (reverse) {
        nextIndex = (currentIndex - 1 + visibleWindows.length) % visibleWindows.length;
      } else {
        nextIndex = (currentIndex + 1) % visibleWindows.length;
      }
      
      get().focusWindow(visibleWindows[nextIndex].id);
    },
    
    getOrCreateWorkspaceForPlatform: (_platform) => {
      // All windows go to main workspace. Workspaces are manually managed by the user.
      return 'main';
    },

    ensureWindowOpen: (type, workspaceId?, metadata?) => {
      // Resolve target workspace: explicit only, fall back to 'main'.
      // Callers MUST pass the correct workspaceId (resolved via
      // resolveWorkspaceForSession). We never guess based on activeWorkspaceId
      // or WINDOW_PLATFORM_MAP — those heuristics cause cross-contamination
      // when multiple agents run simultaneously.
      const targetWsId = workspaceId || 'main';

      const { windows } = get();

      // For multi-instance types with metadata filter, find a matching window anywhere
      if (metadata && !SINGLETON_TYPES.has(type)) {
        const match = windows.find(w => {
          if (w.type !== type) return false;
          if (!w.metadata) return false;
          return Object.entries(metadata).every(([k, v]) => w.metadata![k] === v);
        });
        if (match) {
          // Only switch if the window is on the user's active workspace
          // (otherwise just focus it silently — don't yank the user away)
          if (get().activeWorkspaceId === match.workspaceId) {
            get().focusWindow(match.id);
          }
          return null; // already existed
        }
        // No matching window — create a new one with the requested metadata.
        // Do NOT fall through to the generic workspace search: that would
        // reuse an unrelated window of the same type (e.g. a different
        // subagent's terminal) instead of creating the correct instance.
        return get().openWindow(type, { workspaceId: targetWsId, metadata });
      }

      // For singleton types or when no metadata filter, look in target workspace
      const existing = windows.find(w => w.type === type && w.workspaceId === targetWsId);
      if (existing) {
        if (get().activeWorkspaceId === targetWsId) get().focusWindow(existing.id);
        return null; // already existed
      }
      // Open a new window on the target workspace — do NOT switch the user's view.
      // Subagent windows should appear silently on their designated workspace.
      // Pass metadata through so terminal windows get the correct terminalId.
      const newId = get().openWindow(type, { workspaceId: targetWsId, ...(metadata && { metadata }) });
      scheduleArrangeWindows(targetWsId);
      return newId;
    },

    openWindowsGrid: (types) => {
      if (types.length === 0) return;

      // Group types by their target workspace so we can lay each group out cleanly
      const { windows } = get();
      const newTypes: WindowType[] = [];
      for (const type of types) {
        const platform = WINDOW_PLATFORM_MAP[type];
        const targetWsId = platform
          ? get().getOrCreateWorkspaceForPlatform(platform)
          : 'main';
        // Deduplicate: skip if a window of this type already exists in the
        // target workspace. This covers singletons AND non-singleton types
        // like terminal/editor that can be restored by both the REST fallback
        // and the WS desktop_state event on reconnect.
        const existing = windows.find(w => w.type === type && w.workspaceId === targetWsId);
        if (existing) {
          get().focusWindow(existing.id);
          continue;
        }
        newTypes.push(type);
      }

      if (newTypes.length === 0) return;

      for (const type of newTypes) {
        const platform = WINDOW_PLATFORM_MAP[type];
        const targetWsId = platform
          ? get().getOrCreateWorkspaceForPlatform(platform)
          : 'main';
        get().openWindow(type, { workspaceId: targetWsId });
      }
    },

    arrangeWindows: (workspaceId?) => {
      const wsId = workspaceId ?? get().activeWorkspaceId;
      const targets = get().windows.filter(
        (w) => w.workspaceId === wsId && w.state !== 'minimized',
      );
      if (targets.length === 0) return;
      if (isMobileViewport()) return;

      const workArea = getDesktopWorkArea({
        stageManagerActive: get().stageManagerActive,
        mobile: false,
      });
      const { x, y, width, height } = computeDefaultOpenBounds(workArea);

      for (const win of targets) {
        get().setBounds(win.id, { x, y, width, height });
      }
    },

    // ── MenuBar panel (chat / tracker) ──────────────────────
    menuBarPanel: null,

    toggleMenuBarPanel: (panel) => {
      set((s) => ({ menuBarPanel: s.menuBarPanel === panel ? null : panel }));
    },

    closeMenuBarPanel: () => {
      set({ menuBarPanel: null });
    },

    // ── Mission Control ─────────────────────────────────────
    missionControlActive: false,

    toggleMissionControl: () => {
      if (isMobileViewport()) {
        set({ missionControlActive: false });
        return;
      }
      set((s) => ({ missionControlActive: !s.missionControlActive, menuBarPanel: null, launchpadOpen: false }));
    },

    closeMissionControl: () => {
      set({ missionControlActive: false });
    },

    // ── Spotlight ──────────────────────────────────────────────
    spotlightOpen: false,
    toggleSpotlight: () => {
      const s = get();
      set({ spotlightOpen: !s.spotlightOpen, launchpadOpen: false });
    },
    closeSpotlight: () => set({ spotlightOpen: false }),

    // ── Launchpad ─────────────────────────────────────────────
    launchpadOpen: false,
    toggleLaunchpad: () => {
      const s = get();
      set({ launchpadOpen: !s.launchpadOpen, spotlightOpen: false, missionControlActive: false, menuBarPanel: null });
    },
    closeLaunchpad: () => set({ launchpadOpen: false }),

    // ── Tracker Panel ─────────────────────────────────────────

    // ── Stage Manager ────────────────────────────────────────
    stageManagerActive: true,
    stageManagerOrder: {},
    stageManagerActiveIds: {},

    toggleStageManager: () => {
      // Stage manager is permanently on — no-op
    },

    setStageActiveWindow: (id: string) => {
      const s = get();
      if (!s.stageManagerActive) return;
      
      const win = s.windows.find(w => w.id === id);
      const ws = win?.workspaceId || s.activeWorkspaceId;
      const actives = s.stageManagerActiveIds[ws] || [];
      const order = s.stageManagerOrder[ws] || [];
      
      if (actives.includes(id)) return;

      let newOrder = [...order];
      const clickIdx = newOrder.indexOf(id);
      
      if (clickIdx !== -1 && actives.length > 0) {
        newOrder.splice(clickIdx, 1, ...actives);
      } else {
        newOrder = newOrder.filter(wid => wid !== id);
        if (actives.length > 0) {
          newOrder = [...actives, ...newOrder];
        }
      }

      set({
        stageManagerActiveIds: { ...s.stageManagerActiveIds, [ws]: [id] },
        stageManagerOrder: { ...s.stageManagerOrder, [ws]: newOrder },
        focusedWindowId: id,
      });
      // Center the newly active window
      requestAnimationFrame(() => centerStageActiveWindow(ws));
    },

    addWindowToStageGroup: (id: string) => {
      const s = get();
      if (!s.stageManagerActive) return;

      const win = s.windows.find(w => w.id === id);
      const ws = win?.workspaceId || s.activeWorkspaceId;
      const actives = s.stageManagerActiveIds[ws] || [];
      const order = s.stageManagerOrder[ws] || [];

      if (actives.includes(id)) return;

      const newOrder = order.filter(wid => wid !== id);
      set({
        stageManagerActiveIds: { ...s.stageManagerActiveIds, [ws]: [...actives, id] },
        stageManagerOrder: { ...s.stageManagerOrder, [ws]: newOrder },
        focusedWindowId: id,
      });
    },

    removeWindowFromStageGroup: (id: string) => {
      const s = get();
      if (!s.stageManagerActive) return;

      const win = s.windows.find(w => w.id === id);
      const ws = win?.workspaceId || s.activeWorkspaceId;
      const actives = s.stageManagerActiveIds[ws] || [];
      const order = s.stageManagerOrder[ws] || [];

      if (!actives.includes(id)) return;

      const newActives = actives.filter(wid => wid !== id);
      if (newActives.length === 0) return; // Can't remove the last one this way

      set({
        stageManagerActiveIds: { ...s.stageManagerActiveIds, [ws]: newActives },
        stageManagerOrder: { ...s.stageManagerOrder, [ws]: [id, ...order] },
      });
    },
  }))
);

/** Rebuild stage manager state for a different workspace. */
function rebuildStageForWorkspace(wsId: string): void {
  const { windows, focusedWindowId } = useWindowStore.getState();
  const wsWindows = windows
    .filter(w => w.workspaceId === wsId && w.state !== 'minimized')
    .sort((a, b) => b.zIndex - a.zIndex);

  if (wsWindows.length === 0) {
    useWindowStore.setState(s => ({
      stageManagerOrder: { ...s.stageManagerOrder, [wsId]: [] },
      stageManagerActiveIds: { ...s.stageManagerActiveIds, [wsId]: [] }
    }));
    return;
  }

  const activeId = focusedWindowId && wsWindows.some(w => w.id === focusedWindowId)
    ? focusedWindowId
    : wsWindows[0].id;
  const stripOrder = wsWindows.filter(w => w.id !== activeId).map(w => w.id);

  useWindowStore.setState(s => ({
    stageManagerActiveIds: { ...s.stageManagerActiveIds, [wsId]: [activeId] },
    stageManagerOrder: { ...s.stageManagerOrder, [wsId]: stripOrder },
    focusedWindowId: activeId,
  }));
  requestAnimationFrame(() => centerStageActiveWindow(wsId));
}

/** Center the active stage window in the main area without resizing. */
function centerStageActiveWindow(wsId: string): void {
  const { stageManagerActive, stageManagerActiveIds, windows } = useWindowStore.getState();
  if (!stageManagerActive) return;
  const actives = stageManagerActiveIds[wsId] || [];
  if (actives.length === 0) return;
  
  // Let grouped windows be freeform
  if (actives.length > 1) return;
  
  const win = windows.find(w => w.id === actives[0]);
  if (!win) return;

  const workArea = getDesktopWorkArea({ stageManagerActive: true, mobile: false });
  const { x, y } = computeVisuallyCenteredPosition(workArea, {
    width: win.width,
    height: win.height,
  });

  useWindowStore.getState().setBounds(actives[0], { x, y });
}

// Workspace sync to agent removed — workspaces are client-side only.
