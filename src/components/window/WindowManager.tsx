import { useMemo } from 'react';
import { useWindowStore } from '@/stores/windowStore';
import { Window } from './Window';
import { ErrorBoundary } from '@/components/ui';
import { log } from '@/lib/logger';
import { MENUBAR_HEIGHT, DOCK_HEIGHT, STAGE_STRIP_WIDTH } from '@/lib/constants';
import { MC_WORKSPACE_BAR_HEIGHT } from '@/components/desktop/MissionControl';
import type { WindowConfig, WindowType } from '@/types';

const logger = log('WindowManager');

import { BrowserWindow } from '@/components/apps/BrowserWindow';
import { TerminalWindow } from '@/components/apps/TerminalWindow';
import { FilesWindow } from '@/components/apps/FilesWindow';
import { SettingsWindow } from '@/components/apps/SettingsWindow';
import { AboutWindow } from '@/components/apps/AboutWindow';
import { CalendarWindow } from '@/components/apps/CalendarWindow';
import { AuditLogsWindow } from '@/components/apps/AuditLogsWindow';
import { MemoryWindow } from '@/components/apps/MemoryWindow';
import { EmailWindow } from '@/components/apps/EmailWindow';
import { AccessControlWindow } from '../apps/AccessControlWindow';
import { DocumentViewerWindow } from '../apps/DocumentViewerWindow';
import { AppRegistryWindow } from '../apps/AppRegistryWindow';
import { AppWindow } from '../apps/AppWindow';
import { SubscribeWindow } from '../apps/SubscribeWindow';

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
  app: AppWindow,
  subscribe: SubscribeWindow,
};

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

  return (
    <>
      {visibleWindows.map((config) => {
        const ContentComponent = windowComponents[config.type];

        if (!ContentComponent) {
          logger.warn(`Unknown window type: ${config.type}`);
          return null;
        }

        const mcInfo = mcTargets?.get(config.id) ?? null;
        const stageTarget = stageTargets?.get(config.id) ?? null;
        const wsActives = stageManagerActiveIds[config.workspaceId] || [];
        const isStageStrip = stageManagerActive && !wsActives.includes(config.id) && stageTarget !== null;

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
              <ContentComponent config={config} />
            </ErrorBoundary>
          </Window>
        );
      })}
    </>
  );
}
