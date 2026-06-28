import { lazy, Suspense, useMemo } from 'react';
import { Lock } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { Window } from './Window';
import { MobileWindow } from './MobileWindow';
import { ErrorBoundary } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/logger';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MENUBAR_HEIGHT, STAGE_STRIP_WIDTH } from '@/lib/constants';
import { MC_WORKSPACE_BAR_HEIGHT } from '@/components/desktop/MissionControl';
import type { WindowConfig, WindowType } from '@/types';
import { hasPaidAccess } from '@/lib/plans';
import { openSubscribeWindow } from '@/lib/settingsNav';
import { useAuthStore } from '@/stores/authStore';

const logger = log('WindowManager');

const BrowserWindow = lazy(() => import('@/components/apps/BrowserWindow').then((m) => ({ default: m.BrowserWindow })));
const TerminalWindow = lazy(() => import('@/components/apps/TerminalWindow').then((m) => ({ default: m.TerminalWindow })));
const FilesWindow = lazy(() => import('@/components/apps/FilesWindow').then((m) => ({ default: m.FilesWindow })));
const SettingsWindow = lazy(() => import('@/components/apps/SettingsWindow').then((m) => ({ default: m.SettingsWindow })));
const AboutWindow = lazy(() => import('@/components/apps/AboutWindow').then((m) => ({ default: m.AboutWindow })));
const CalendarWindow = lazy(() => import('@/components/apps/CalendarWindow').then((m) => ({ default: m.CalendarWindow })));
const AuditLogsWindow = lazy(() => import('@/components/apps/AuditLogsWindow').then((m) => ({ default: m.AuditLogsWindow })));
const MemoryWindow = lazy(() => import('@/components/apps/MemoryWindow').then((m) => ({ default: m.MemoryWindow })));
const EmailWindow = lazy(() => import('@/components/apps/EmailWindow').then((m) => ({ default: m.EmailWindow })));
const AccessControlWindow = lazy(() => import('../apps/AccessControlWindow').then((m) => ({ default: m.AccessControlWindow })));
const DocumentViewerWindow = lazy(() => import('../apps/DocumentViewerWindow').then((m) => ({ default: m.DocumentViewerWindow })));
const AppRegistryWindow = lazy(() => import('../apps/AppRegistryWindow').then((m) => ({ default: m.AppRegistryWindow })));
const AppBuilderWindow = lazy(() => import('../apps/AppBuilderWindow').then((m) => ({ default: m.AppBuilderWindow })));
const SubscribeWindow = lazy(() => import('../screens/SubscribeWindow').then((m) => ({ default: m.SubscribeWindow })));
const AppWindow = lazy(() => import('../apps/AppWindow').then((m) => ({ default: m.AppWindow })));

const PAID_ONLY_WINDOW_TYPES: Set<WindowType> = new Set([
  'browser',
  'terminal',
  'files',
  'editor',
  'document-viewer',
  'calendar',
  'auditlogs',
  'memory',
  'email',
  'access-control',
  'app',
]);

const WINDOW_LOCK_BULLETS: Partial<Record<WindowType, readonly string[]>> = {
  browser: ['Browse the web inside Construct', 'Keep OAuth and live sites in the workspace', 'Use the browser once you subscribe'],
  terminal: ['Run shell commands and scripts', 'Keep CLI work next to your windows', 'Use the terminal once you subscribe'],
  files: ['Manage workspace files in one place', 'Upload, rename, and organize documents', 'Use Files once you subscribe'],
  editor: ['Edit workspace documents directly', 'Work on files without leaving Construct', 'Use the editor once you subscribe'],
  'document-viewer': ['Preview documents in the workspace', 'Open files without leaving the desktop', 'Use the viewer once you subscribe'],
  calendar: ['Track scheduling in the workspace', 'See meetings and task timing together', 'Use Calendar once you subscribe'],
  auditlogs: ['Review agent activity and history', 'Inspect changes and actions as they happen', 'Use Audit Logs once you subscribe'],
  memory: ['Store persistent notes and context', 'Recall previous work across sessions', 'Use Memory once you subscribe'],
  email: ['Send and read agent email', 'Keep inboxes tied to the workspace', 'Use Email once you subscribe'],
  'access-control': ['Manage permissions and access', 'Review sensitive changes in one place', 'Use Access Control once you subscribe'],
  app: ['Open connected apps and integrations', 'Keep third-party tools inside Construct', 'Use connected apps once you subscribe'],
};

// Map window types to their content components.
// Chat and Tracker are NOT standalone windows — they live as MenuBar dropdown panels only.
const windowComponents: Record<WindowType, React.ComponentType<{ config: WindowConfig }>> = {
  browser: BrowserWindow,
  terminal: TerminalWindow,
  files: FilesWindow,
  editor: DocumentViewerWindow,
  'document-viewer': DocumentViewerWindow,
  settings: SettingsWindow,
  about: AboutWindow,
  calendar: CalendarWindow,
  auditlogs: AuditLogsWindow,
  memory: MemoryWindow,
  email: EmailWindow,
  'access-control': AccessControlWindow,
  'app-registry': AppRegistryWindow,
  'app-builder': AppBuilderWindow,
  subscribe: SubscribeWindow,
  app: AppWindow,
};

function WindowContentFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center surface-app text-xs text-[var(--color-text-muted)]">
      Loading {title}...
    </div>
  );
}

/** Target position for a window in Mission Control mode. */
export interface MissionControlTarget {
  /** Target x (relative to window area, same coordinate space as config.x) */
  x: number;
  /** Target y (relative to window area) */
  y: number;
  /** Scale factor (0-1) */
  scale: number;
}

/**
 * Compute a grid layout for Mission Control.
 *
 * Each window keeps its original width/height in the config; we compute
 * a target (x, y, scale) that Window.tsx uses for a CSS transform.
 * Positions are in the same coordinate space as window config (relative to window area).
 */
function computeMissionControlLayout(
  windows: WindowConfig[],
  areaWidth: number,
  areaHeight: number,
): MissionControlTarget[] {
  const count = windows.length;
  if (count === 0) return [];

  const padding = 48;
  const gap = 32;
  // Reserve space at top for the workspace bar (which overlays the window area)
  const topOffset = MC_WORKSPACE_BAR_HEIGHT;
  const labelSpace = 28; // space below each window for title label

  const availW = areaWidth - padding * 2;
  const availH = areaHeight - topOffset - padding - labelSpace;

  // Determine grid dimensions — favor wider layouts
  let cols: number;
  let rows: number;
  if (count === 1) {
    cols = 1; rows = 1;
  } else if (count === 2) {
    cols = 2; rows = 1;
  } else if (count <= 4) {
    cols = 2; rows = 2;
  } else if (count <= 6) {
    cols = 3; rows = 2;
  } else if (count <= 9) {
    cols = 3; rows = 3;
  } else {
    cols = 4; rows = Math.ceil(count / 4);
  }

  const cellW = Math.floor((availW - gap * (cols - 1)) / cols);
  const cellH = Math.floor((availH - gap * (rows - 1)) / rows);

  return windows.map((win, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Scale to fit within cell, preserving aspect ratio. Never exceed 80%.
    const scaleX = cellW / win.width;
    const scaleY = cellH / win.height;
    const scale = Math.min(scaleX, scaleY, 0.8);

    const scaledW = win.width * scale;
    const scaledH = win.height * scale;

    // Center within cell
    const cellX = padding + col * (cellW + gap);
    const cellY = topOffset + padding + row * (cellH + gap);
    const x = cellX + (cellW - scaledW) / 2;
    const y = cellY + (cellH - scaledH) / 2;

    return { x, y, scale };
  });
}

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);
  const userPlan = useAuthStore((s) => s.user?.plan);
  const activeWorkspaceId = useWindowStore((s) => s.activeWorkspaceId);
  const missionControlActive = useWindowStore((s) => s.missionControlActive);
  const workspaceTransition = useWindowStore((s) => s.workspaceTransition);

  // During a workspace transition, render windows from BOTH the from and to
  // workspaces so they can slide together. Otherwise just the active workspace.
  const stageManagerActive = useWindowStore((s) => s.stageManagerActive);
  const stageManagerActiveIds = useWindowStore((s) => s.stageManagerActiveIds);
  const stageManagerOrder = useWindowStore((s) => s.stageManagerOrder);

  const visibleWindows = useMemo(() => {
    if (workspaceTransition) {
      return windows.filter(
        (w) => w.workspaceId === workspaceTransition.fromId || w.workspaceId === workspaceTransition.toId,
      );
    }
    // Stage Manager: show ALL workspace windows (active + strip) — strip windows
    // are rendered as real scaled-down windows via CSS transforms, not placeholders.
      return windows.filter((w) => w.workspaceId === activeWorkspaceId && w.state !== 'minimized');
  }, [windows, activeWorkspaceId, workspaceTransition]);

  const lockedByPlan = !hasPaidAccess(userPlan);

  // Compute grid targets when MC is active
  const mcTargets = useMemo(() => {
    if (!missionControlActive) return null;

    const areaW = globalThis.innerWidth;
    const areaH = globalThis.innerHeight - MENUBAR_HEIGHT;
    
    // Sort windows by type, then alphabetical title to cluster them nicely
    const orderedWindows = [...visibleWindows].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.title.localeCompare(b.title);
    });

    const targets = computeMissionControlLayout(orderedWindows, areaW, areaH);

    // Map by window id for easy lookup
    const map = new Map<string, { target: MissionControlTarget; index: number }>();
    orderedWindows.forEach((w, i) => {
      if (targets[i]) {
        map.set(w.id, { target: targets[i], index: i });
      }
    });
    return map;
  }, [missionControlActive, visibleWindows]);

  // Compute stage manager targets for strip windows.
  // Each strip window is rendered by the same Window component at its real position,
  // then CSS transform moves + scales it into the strip area.
  //
  // Coordinate system:
  //   - Window area origin (0,0) = top-left of the main area (right of strip)
  //   - Window area is at viewport (STAGE_STRIP_WIDTH, MENUBAR_HEIGHT)
  //   - Strip is at viewport (0, MENUBAR_HEIGHT) — LEFT of the window area
  //   - So strip positions in window-area coords have NEGATIVE x values
  //
  // Transform: translate(dx, dy) is applied first, moving the window's top-left
  // to the target position. Then scale(s) shrinks around that top-left (origin 0 0).
  const stageTargets = useMemo(() => {
    if (!stageManagerActive) return null;
    const map = new Map<string, { x: number; y: number; scale: number }>();

    const baseThumbW = 140;
    const baseGap = 12;
    const topPad = 12;
    const areaH = globalThis.innerHeight - MENUBAR_HEIGHT - topPad * 2;

    // We can render Stage Manager targets for multiple workspaces if we are transitioning
    const wsIds = workspaceTransition
      ? [workspaceTransition.fromId, workspaceTransition.toId]
      : [activeWorkspaceId];

    for (const ws of wsIds) {
      const order = stageManagerOrder[ws] || [];
      if (order.length === 0) continue;

      // First pass: compute natural sizes
      const rawItems: Array<{ wid: string; win: WindowConfig }> = [];
      for (const wid of order) {
        const win = visibleWindows.find(w => w.id === wid);
        if (!win) continue;
        rawItems.push({ wid, win });
      }
      if (rawItems.length === 0) continue;

      // Compute natural total height at baseThumbW
      let naturalH = 0;
      for (const { win } of rawItems) {
        const s = baseThumbW / win.width;
        naturalH += win.height * s;
      }
      naturalH += Math.max(0, rawItems.length - 1) * baseGap;

      // If it overflows, shrink thumb width (and gap) proportionally to fit
      let thumbW = baseThumbW;
      let gap = baseGap;
      if (naturalH > areaH && rawItems.length > 1) {
        const shrink = areaH / naturalH;
        thumbW = Math.max(60, baseThumbW * shrink);
        gap = Math.max(4, baseGap * shrink);
      }

      const padX = (STAGE_STRIP_WIDTH - thumbW) / 2;

      // Second pass: compute actual sizes with (potentially shrunk) thumbW
      const items: Array<{ wid: string; win: WindowConfig; scale: number; thumbH: number }> = [];
      let totalH = 0;
      for (const { wid, win } of rawItems) {
        const scale = thumbW / win.width;
        const thumbH = win.height * scale;
        items.push({ wid, win, scale, thumbH });
        totalH += thumbH;
      }
      totalH += Math.max(0, items.length - 1) * gap;

      const startY = Math.max(topPad, (areaH - totalH) / 2 + topPad);
      let y = startY;
      for (const { wid, win, scale, thumbH } of items) {
        const dx = padX - win.x;
        const dy = y - win.y;
        map.set(wid, { x: dx, y: dy, scale });
        y += thumbH + gap;
      }
    }

    return map;
  }, [stageManagerActive, stageManagerOrder, visibleWindows, activeWorkspaceId, workspaceTransition]);

  // Calculate per-window x offsets for workspace slide transition.
  // To-workspace windows are positioned one screen-width away so the
  // container's translateX can reveal them during the slide.
  const screenWidth = globalThis.innerWidth || 1920;
  const isMobile = useIsMobile();

  return (
    <>
      {visibleWindows.map((config) => {
        const ContentComponent = windowComponents[config.type];

        if (!ContentComponent) {
          logger.warn(`Unknown window type: ${config.type}`);
          return null;
        }

        if (isMobile) {
          // On mobile, we only want to show the currently focused window so it takes up the whole screen.
          // MobileWindow handles hiding unfocused windows via CSS (so they don't lose state)
          return (
            <MobileWindow key={config.id} config={config}>
              <ErrorBoundary inline label={config.title}>
                <Suspense fallback={<WindowContentFallback title={config.title} />}>
                  <ContentComponent config={config} />
                </Suspense>
              </ErrorBoundary>
            </MobileWindow>
          );
        }

        const mcInfo = mcTargets?.get(config.id) ?? null;
        const stageTarget = stageTargets?.get(config.id) ?? null;
        const wsActives = stageManagerActiveIds[config.workspaceId] || [];
        const isStageStrip = stageManagerActive && !wsActives.includes(config.id) && stageTarget !== null;
        const showPlanLock = lockedByPlan && PAID_ONLY_WINDOW_TYPES.has(config.type);
        const lockBullets = WINDOW_LOCK_BULLETS[config.type] ?? ['Subscribe to unlock this window.', 'The preview stays visible while controls are disabled.'];

        // During workspace transition, offset the destination workspace's windows
        // by ±screenWidth so they sit off-screen until the container slides.
        let slideXOffset = 0;
        if (workspaceTransition && config.workspaceId === workspaceTransition.toId) {
          slideXOffset = workspaceTransition.direction === 'left' ? screenWidth : -screenWidth;
        }

        return (
          <Window
            key={config.id}
            config={config}
            missionControlTarget={mcInfo?.target ?? null}
            missionControlIndex={mcInfo?.index ?? 0}
            slideXOffset={slideXOffset}
            stageTarget={isStageStrip ? stageTarget : null}
            isStageActive={stageManagerActive && wsActives.includes(config.id)}
          >
            <ErrorBoundary inline label={config.title}>
              <Suspense fallback={<WindowContentFallback title={config.title} />}>
                <div className="relative flex h-full w-full overflow-hidden">
                  <div className={showPlanLock ? 'h-full w-full pointer-events-none select-none opacity-60' : 'h-full w-full'}>
                    <ContentComponent config={config} />
                  </div>

                  {showPlanLock && (
                    <div className="absolute inset-0 z-20">
                      <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-black/5 to-transparent dark:from-black/25 dark:via-black/10" />
                      <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[320px] pointer-events-auto">
                        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[var(--color-surface)]/92 backdrop-blur-md p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
                          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                            <Lock className="h-3.5 w-3.5" />
                            Preview only
                          </div>
                          <h2 className="mt-2 text-[15px] font-semibold text-[var(--color-text)]">
                            Unlock {config.title}
                          </h2>
                          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
                            You can see the app here, but interaction stays disabled until you subscribe.
                          </p>
                          <ul className="mt-3 space-y-2">
                            {lockBullets.map((bullet) => (
                              <li key={bullet} className="flex items-start gap-2 text-[12px] leading-snug text-[var(--color-text-muted)]">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]/70" />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                          <Button className="mt-4 w-full" variant="primary" onClick={openSubscribeWindow}>
                            Open Subscribe
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Suspense>
            </ErrorBoundary>
          </Window>
        );
      })}
    </>
  );
}
