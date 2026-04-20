/**
 * Central frontend configuration.
 *
 * ALL timeouts, limits, intervals, storage keys, and operational defaults
 * live here. No other file should hardcode these values.
 */

// ── API & Environment ──────────────────────────────────────────────────────

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/** True when running in development (Vite dev server). */
export const IS_DEV = import.meta.env.DEV === true;

// ── WebSocket Configuration ────────────────────────────────────────────────

/** Base reconnect delay (ms). Actual delay: min(base * 2^attempts, max) + jitter. */
export const WS_RECONNECT_BASE_MS = 2_000;

/** Maximum reconnect delay (ms). */
export const WS_RECONNECT_MAX_MS = 60_000;

/** Random jitter added to reconnect delay (ms). */
export const WS_RECONNECT_JITTER_MS = 1_000;

/** Browser WS keepalive: force reconnect if no message for this long. */
export const WS_KEEPALIVE_TIMEOUT_MS = 45_000;

/** Browser WS keepalive: send ping this often. */
export const WS_KEEPALIVE_PING_INTERVAL_MS = 30_000;

/** Default ping timeout for latency measurement. */
export const WS_PING_TIMEOUT_MS = 5_000;

// ── Polling Intervals ──────────────────────────────────────────────────────

/** Usage stats refresh interval (ms). */
export const USAGE_POLL_INTERVAL_MS = 60_000;

/** Billing usage refresh interval (ms). */
export const BILLING_POLL_INTERVAL_MS = 30_000;

/** Latency measurement interval (ms). */
export const LATENCY_POLL_INTERVAL_MS = 3_000;

/** Google Drive file list poll interval (ms). */
export const DRIVE_POLL_INTERVAL_MS = 15_000;

/** Clock display update interval (ms). */
export const CLOCK_UPDATE_INTERVAL_MS = 1_000;

// ── Agent & Chat Limits ────────────────────────────────────────────────────

/** Max chat messages retained in memory. Oldest trimmed beyond this. */
export const MAX_CHAT_MESSAGES = 2_000;

/** Safety timeout: reset agentRunning if no events arrive within this period. */
export const AGENT_RUNNING_TIMEOUT_MS = 180_000;

/** Max file upload size (bytes). */
export const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Audit log page size. */
export const AUDIT_LOG_PAGE_SIZE = 50;

/** Max pending sounds in queue. */
export const MAX_SOUND_QUEUE = 8;

/** Click sound cooldown (ms). */
export const SOUND_CLICK_COOLDOWN_MS = 60;

/** Default sound volume (0-1). */
export const DEFAULT_SOUND_VOLUME = 0.3;

// ── Debounce & Animation ───────────────────────────────────────────────────

/** Email availability check debounce (ms). */
export const EMAIL_CHECK_DEBOUNCE_MS = 400;

/** Agent tracker auto-persist debounce (ms). */
export const TRACKER_PERSIST_DEBOUNCE_MS = 500;

/** Notification deduplication window (ms). */
export const NOTIFICATION_DEDUP_WINDOW_MS = 10_000;

/** Default toast duration (ms). */
export const TOAST_DURATION_MS = 30_000;

/** Extended toast duration for important notifications (ms). */
export const TOAST_DURATION_LONG_MS = 15_000;

/** Workspace slide animation duration (ms). */
export const WORKSPACE_SLIDE_DURATION_MS = 400;

/** Mission Control animation duration (ms). */
export const MISSION_CONTROL_DURATION_MS = 500;

// ── Layout ─────────────────────────────────────────────────────────────────

/** Mobile breakpoint (px). */
export const MOBILE_BREAKPOINT_PX = 768;

/** Window grid layout padding (px). */
export const WINDOW_GRID_PADDING = 16;

/** Window grid layout gap (px). */
export const WINDOW_GRID_GAP = 12;

/** Window cascade offset for overlapped windows (px). */
export const WINDOW_CASCADE_OFFSET = 30;

/** Dock magnification hover range constants */
export const DOCK_BASE_GAP = 8;
export const DOCK_MIN_GAP = 4;

// ── Storage Keys ───────────────────────────────────────────────────────────

/** All localStorage and sessionStorage keys used by the app. */
export const STORAGE_KEYS = {
  // Auth
  token: 'construct:token',
  userId: 'construct:userId',

  // Preferences
  theme: 'construct:theme',
  soundEnabled: 'construct:sound',
  wallpaper: 'construct:wallpaper',

  // Window state
  windowPositions: 'construct:windows',
  openAppWindows: 'construct:openAppWindows',

  // Chat
  chatDraft: 'construct:chat-draft',
  spotlightDraft: 'construct:spotlight-draft',
  historyClearedFlag: 'construct:history-cleared',

  // Tour / onboarding
  tourCompleted: 'construct:tour-completed',
  tourSkipped: 'construct:tour-skipped',

  // Promo codes (referral / partner codes captured via ?code= URL param)
  promoCode: 'construct:promo_code',
  promoSeen: 'construct:promo_seen',
  // Note: RECOGNIZED_PROMO_CODES (below) lists codes the LoginScreen banner
  // highlights. Any 2-32 char alphanumeric code via ?code=XXX is persisted
  // and offered at checkout regardless of being listed here — the list only
  // affects which codes get the "promo applied · 1 month free" banner.

  // Tracker
  trackerDismissedGoals: 'construct:tracker:dismissedGoals',
  trackerOperations: 'construct:tracker:operations',

  // Session storage (not localStorage)
  authConnectCards: 'construct_auth_connect_cards',
  setupWizardProgress: 'setup_wizard_progress',
} as const;

/**
 * Promo codes that the login screen banner recognizes and displays as
 * "1 month free pro". Add a new code here to light up the banner for it;
 * the code must ALSO be configured on Dodo's side as a valid discount_code
 * for the Pro product, otherwise checkout will fail. All codes in this list
 * are treated identically (same benefit, same banner copy).
 */
export const RECOGNIZED_PROMO_CODES = ['YCSUS', 'YESMANGO'] as const;
export type RecognizedPromoCode = (typeof RECOGNIZED_PROMO_CODES)[number];

/**
 * Detect whether the user arrived with or previously stored a recognized
 * promo code. Returns the code (for display) or null.
 */
export function detectActivePromoCode(): RecognizedPromoCode | null {
  try {
    const search = window.location.search.toUpperCase();
    for (const code of RECOGNIZED_PROMO_CODES) {
      if (search.includes(code)) return code;
    }
    const stored = localStorage.getItem(STORAGE_KEYS.promoCode);
    if (stored && (RECOGNIZED_PROMO_CODES as readonly string[]).includes(stored)) {
      return stored as RecognizedPromoCode;
    }
  } catch { /* storage unavailable */ }
  return null;
}

// ── External Services ──────────────────────────────────────────────────────

/** Upload directory path inside the workspace. */
export const UPLOAD_DIRECTORY = '/home/sandbox/workspace/uploads';

/** AgentMail email domain. */
export const AGENTMAIL_DOMAIN = 'agents.construct.computer';

/** BroadcastChannel name for tab singleton. */
export const TAB_SINGLETON_CHANNEL = 'construct-desktop';

// ── Auth Popup ─────────────────────────────────────────────────────────────

/** OAuth popup window dimensions. */
export const AUTH_POPUP_WIDTH = 520;
export const AUTH_POPUP_HEIGHT = 700;
