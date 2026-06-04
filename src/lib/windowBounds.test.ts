import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampBoundsToWorkArea,
  computeDefaultOpenBounds,
  computeOpenMinSize,
  getDefaultOpenCenterOffsetX,
  getDesktopWorkArea,
} from './windowBounds';
import {
  DEFAULT_OPEN_PADDING,
  DEFAULT_OPEN_HEIGHT_SCALE,
  DEFAULT_OPEN_CENTER_OFFSET_X_RATIO,
  DEFAULT_OPEN_WIDTH_SCALE,
  DOCK_HEIGHT,
  MENUBAR_HEIGHT,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  STAGE_STRIP_WIDTH,
} from './constants';

describe('windowBounds', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1440);
    vi.stubGlobal('innerHeight', 900);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('computes work area matching maximize padding', () => {
    const area = getDesktopWorkArea({ mobile: false, stageManagerActive: false });
    expect(area.x).toBe(DEFAULT_OPEN_PADDING);
    expect(area.y).toBe(DEFAULT_OPEN_PADDING);
    expect(area.width).toBe(1440 - DEFAULT_OPEN_PADDING * 2);
    expect(area.height).toBe(
      900 - MENUBAR_HEIGHT - DOCK_HEIGHT - DEFAULT_OPEN_PADDING * 2,
    );
  });

  it('subtracts stage strip when stage manager is active', () => {
    const area = getDesktopWorkArea({ mobile: false, stageManagerActive: true });
    expect(area.x).toBe(STAGE_STRIP_WIDTH + DEFAULT_OPEN_PADDING);
    expect(area.width).toBe(
      1440 - STAGE_STRIP_WIDTH - DEFAULT_OPEN_PADDING * 2,
    );
  });

  it('default open bounds are scaled and centered with dock-aligned offset', () => {
    const area = getDesktopWorkArea({ mobile: false });
    const bounds = computeDefaultOpenBounds(area);
    const width = Math.floor(area.width * DEFAULT_OPEN_WIDTH_SCALE);
    const height = Math.floor(area.height * DEFAULT_OPEN_HEIGHT_SCALE);
    const offsetX = getDefaultOpenCenterOffsetX(area);
    expect(offsetX).toBe(Math.round(1440 * DEFAULT_OPEN_CENTER_OFFSET_X_RATIO));
    expect(bounds.width).toBe(width);
    expect(bounds.height).toBe(height);
    expect(bounds.x).toBe(area.x + Math.floor((area.width - width) / 2) + offsetX);
    expect(bounds.y).toBe(area.y + Math.floor((area.height - height) / 2));
    expect(bounds.width).toBeLessThan(area.width);
    expect(bounds.height).toBeLessThan(area.height);
  });

  it('shifts further left when stage strip narrows the work area', () => {
    const area = getDesktopWorkArea({ mobile: false, stageManagerActive: true });
    const offsetX = getDefaultOpenCenterOffsetX(area);
    expect(offsetX).toBe(
      Math.round(1440 * DEFAULT_OPEN_CENTER_OFFSET_X_RATIO) - Math.round(STAGE_STRIP_WIDTH / 2),
    );
  });

  it('default open center offset is zero on mobile', () => {
    const area = getDesktopWorkArea({ mobile: true });
    expect(getDefaultOpenCenterOffsetX(area, true)).toBe(0);
  });

  it('clamps oversized bounds into the work area', () => {
    const area = getDesktopWorkArea({ mobile: false });
    const clamped = clampBoundsToWorkArea(
      { x: 9999, y: 9999, width: 5000, height: 5000 },
      area,
    );
    expect(clamped.width).toBe(area.width);
    expect(clamped.height).toBe(area.height);
    expect(clamped.x).toBeLessThanOrEqual(area.x + area.width - clamped.width);
    expect(clamped.y).toBeLessThanOrEqual(area.y + area.height - clamped.height);
  });

  it('open min size is at least global mins and half the work area', () => {
    const area = getDesktopWorkArea({ mobile: false });
    const { minWidth, minHeight } = computeOpenMinSize(area);
    expect(minWidth).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
    expect(minHeight).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
    expect(minWidth).toBe(Math.floor(area.width * 0.5));
    expect(minHeight).toBe(Math.floor(area.height * 0.5));
  });
});
