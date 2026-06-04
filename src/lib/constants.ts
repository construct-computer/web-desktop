/**
 * UI layout constants and z-index layers.
 *
 * For operational config (timeouts, limits, storage keys, etc),
 * see ./config.ts — the central configuration file.
 */

// Re-export commonly used values so existing imports still work
export { API_BASE_URL, STORAGE_KEYS, RECOGNIZED_PROMO_CODES, detectActivePromoCode } from './config';
export type { RecognizedPromoCode } from './config';

// Window defaults
export const DEFAULT_WINDOW_WIDTH = 800;
export const DEFAULT_WINDOW_HEIGHT = 600;
/** Desktop open/maximize inset — matches maximizeWindow padding. */
export const DEFAULT_OPEN_PADDING = 24;
/** Default open size as a fraction of the usable desktop (centered). */
export const DEFAULT_OPEN_WIDTH_SCALE = 0.65;
export const DEFAULT_OPEN_HEIGHT_SCALE = 0.72;
/**
 * Horizontal shift applied when centering new windows (fraction of screen width).
 * Dock is viewport-centered; a left nudge aligns the window frame with the dock
 * perceptually (right-side desktop widgets add visual weight).
 */
export const DEFAULT_OPEN_CENTER_OFFSET_X_RATIO = -0.025;
export const MIN_WINDOW_WIDTH = 480;
export const MIN_WINDOW_HEIGHT = 360;
export const MENUBAR_HEIGHT = 40;
export const MOBILE_MENUBAR_HEIGHT = 44;
export const DOCK_HEIGHT = 80; // dock bar height including magnification space
export const STAGE_STRIP_WIDTH = 160; // stage manager left sidebar width
export const MOBILE_APP_BAR_HEIGHT = 80; // bottom app bar on mobile
/** Notification / Work Status drawer — wider on desktop for list-first task UI */
export const NOTIFICATION_DRAWER_WIDTH = 420;
export const NOTIFICATION_DRAWER_WIDTH_MOBILE = '100dvw';

// Z-index layers
export const Z_INDEX = {
  desktop: 0,
  desktopIcon: 10,
  /** Desktop widgets (agent graph, stats) — below windows so they don't obscure content.
   *  The container is pointer-events-none; individual widgets opt in. */
  desktopWidget: 50,
  missionControlScrim: 90,
  window: 100,
  windowFocused: 200,
  missionControlBar: 500,

  taskbar: 900,

  /** Clippy-style floating agent assistant — above everything except modals/notifications */
  clippyWidget: 950,
  menu: 950,
  startMenu: 950,
  modal: 1000,
  notification: 1200,
  tooltip: 2000,

  /** Full-screen overlays (setup modal, goodbye screen, etc.) */
  overlay: 9999,
} as const;
