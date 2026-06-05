import {
  MENUBAR_HEIGHT,
  MOBILE_MENUBAR_HEIGHT,
  DOCK_HEIGHT,
  MOBILE_APP_BAR_HEIGHT,
  STAGE_STRIP_WIDTH,
  DEFAULT_OPEN_PADDING,
  DEFAULT_OPEN_WIDTH_SCALE,
  DEFAULT_OPEN_HEIGHT_SCALE,
  DEFAULT_OPEN_CENTER_OFFSET_X_RATIO,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
} from '@/lib/constants';
import type { WindowBounds } from '@/types';

export interface DesktopWorkArea {
  /** Left edge of usable desktop (after stage strip + padding). */
  x: number;
  /** Top edge of usable desktop (after padding). */
  y: number;
  /** Usable width inside padding. */
  width: number;
  /** Usable height inside padding. */
  height: number;
  padding: number;
  stageStripW: number;
  screenWidth: number;
  screenHeight: number;
}

export function getDesktopWorkArea(opts?: {
  stageManagerActive?: boolean;
  mobile?: boolean;
}): DesktopWorkArea {
  const mobile = opts?.mobile ?? false;
  const screenWidth = globalThis.innerWidth;
  const menuH = mobile ? MOBILE_MENUBAR_HEIGHT : MENUBAR_HEIGHT;
  const bottomH = mobile ? MOBILE_APP_BAR_HEIGHT : DOCK_HEIGHT;
  const stageStripW =
    opts?.stageManagerActive && !mobile ? STAGE_STRIP_WIDTH : 0;
  const screenHeight = globalThis.innerHeight - menuH - bottomH;
  const padding = mobile ? 0 : DEFAULT_OPEN_PADDING;

  return {
    x: stageStripW + padding,
    y: padding,
    width: screenWidth - stageStripW - padding * 2,
    height: screenHeight - padding * 2,
    padding,
    stageStripW,
    screenWidth,
    screenHeight,
  };
}

/**
 * Shift open-window X so the frame lines up with the dock’s visual center.
 * Work-area center sits stageStripW/2 to the right of the viewport when Stage Manager
 * is active; correct that so the dock (viewport-centered) and window align.
 */
export function getDefaultOpenCenterOffsetX(
  area: DesktopWorkArea,
  mobile = false,
): number {
  if (mobile) return 0;
  const perceptual = Math.round(area.screenWidth * DEFAULT_OPEN_CENTER_OFFSET_X_RATIO);
  const stageCorrection =
    area.stageStripW > 0 ? -Math.round(area.stageStripW / 2) : 0;
  return perceptual + stageCorrection;
}

/** Dock-aware visual center for a window of the given size inside the work area. */
export function computeVisuallyCenteredPosition(
  area: DesktopWorkArea,
  size: { width: number; height: number },
  opts?: { mobile?: boolean },
): Pick<WindowBounds, 'x' | 'y'> {
  const { width, height } = size;
  const centerOffsetX = getDefaultOpenCenterOffsetX(area, opts?.mobile);
  const centeredX = area.x + Math.floor((area.width - width) / 2) + centerOffsetX;
  const maxX = area.x + area.width - width;
  return {
    x: Math.max(area.x, Math.min(centeredX, maxX)),
    y: area.y + Math.floor((area.height - height) / 2),
  };
}

export function computeDefaultOpenBounds(
  workArea?: DesktopWorkArea,
  opts?: { mobile?: boolean },
): WindowBounds {
  const area = workArea ?? getDesktopWorkArea({ mobile: opts?.mobile });
  const width = Math.min(
    area.width,
    Math.max(MIN_WINDOW_WIDTH, Math.floor(area.width * DEFAULT_OPEN_WIDTH_SCALE)),
  );
  const height = Math.min(
    area.height,
    Math.max(MIN_WINDOW_HEIGHT, Math.floor(area.height * DEFAULT_OPEN_HEIGHT_SCALE)),
  );
  const { x, y } = computeVisuallyCenteredPosition(area, { width, height }, opts);
  return { x, y, width, height };
}

export function clampBoundsToWorkArea(
  bounds: WindowBounds,
  workArea: DesktopWorkArea,
): WindowBounds {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;
  return {
    width,
    height,
    x: Math.max(workArea.x, Math.min(bounds.x, maxX)),
    y: Math.max(workArea.y, Math.min(bounds.y, maxY)),
  };
}

/** Minimum resize floor: at least global mins and half the work area. */
export function computeOpenMinSize(workArea: DesktopWorkArea): {
  minWidth: number;
  minHeight: number;
} {
  return {
    minWidth: Math.max(
      MIN_WINDOW_WIDTH,
      Math.floor(workArea.width * 0.5),
    ),
    minHeight: Math.max(
      MIN_WINDOW_HEIGHT,
      Math.floor(workArea.height * 0.5),
    ),
  };
}
