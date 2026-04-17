/**
 * UI layout constants and z-index layers.
 *
 * For operational config (timeouts, limits, storage keys, etc),
 * see ./config.ts — the central configuration file.
 */

// Re-export commonly used values so existing imports still work
export { API_BASE_URL, STORAGE_KEYS } from './config';

// Window defaults
export const DEFAULT_WINDOW_WIDTH = 800;
export const DEFAULT_WINDOW_HEIGHT = 600;
export const MIN_WINDOW_WIDTH = 300;
export const MIN_WINDOW_HEIGHT = 200;
export const MENUBAR_HEIGHT = 40;
export const MOBILE_MENUBAR_HEIGHT = 44;
export const DOCK_HEIGHT = 80; // dock bar height including magnification space
export const STAGE_STRIP_WIDTH = 160; // stage manager left sidebar width
export const MOBILE_APP_BAR_HEIGHT = 80; // bottom app bar on mobile

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
