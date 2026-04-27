/**
 * PostHog Analytics — centralized tracking for construct.computer
 *
 * Usage:
 *   import { analytics } from '@/lib/analytics';
 *   analytics.track('chat_message_sent', { sessionKey: 'abc' });
 *
 * All tracking is fire-and-forget. If PostHog is not configured
 * (missing env vars), all calls are silent no-ops.
 *
 * The SDK is loaded via the official HTML snippet stub in index.html, which
 * pulls `array.js` from PostHog's CDN on each visit so the client stays
 * current without npm lockfile drift. See:
 * https://posthog.com/docs/sdk-doctor/keeping-sdks-current
 */

import type { PostHog } from '@posthog/types';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined;

let initialized = false;

function client(): PostHog | undefined {
  return typeof window !== 'undefined' ? window.posthog : undefined;
}

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize PostHog. Call once at app startup (main.tsx).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initAnalytics(): void {
  if (initialized) return;
  if (!POSTHOG_KEY || !POSTHOG_HOST) {
    console.warn(
      '[analytics] PostHog not initialized: missing ' +
      [!POSTHOG_KEY && 'VITE_PUBLIC_POSTHOG_KEY', !POSTHOG_HOST && 'VITE_PUBLIC_POSTHOG_HOST'].filter(Boolean).join(', ') +
      '. Tracking is disabled.'
    );
    return;
  }

  const posthog = client();
  if (!posthog) {
    console.warn(
      '[analytics] PostHog loader missing: ensure index.html includes the official snippet stub (see PostHog keeping-sdks-current docs). Tracking is disabled.'
    );
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-01-30',

    // ── Pageview & navigation ──
    // 'history_change' auto-captures SPA route changes via pushState/replaceState
    capture_pageview: 'history_change',
    capture_pageleave: true,

    // ── Session replay ──
    // Recording is controlled server-side in PostHog project settings.
    // These options configure what gets captured when recording is active.
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true },
      recordCrossOriginIframes: false,
    },

    // ── Autocapture, heatmaps & dead clicks ──
    autocapture: {
      capture_copied_text: false,
    },
    capture_dead_clicks: true,

    // ── Web vitals & performance ──
    capture_performance: {
      web_vitals: true,
      web_vitals_allowed_metrics: ['LCP', 'CLS', 'FCP', 'INP'],
    },

    // ── Performance ──
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        ph.debug();
      }
    },

    // ── Privacy ──
    person_profiles: 'always',
    respect_dnt: true,
    persistence: 'localStorage+cookie',
  });

  initialized = true;
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Identify the current user. Call after successful login/auth check.
 * Sets the user's distinct_id and attaches person properties.
 *
 * Accepts the API `User` object shape directly (avatarUrl, setupCompleted).
 */
export function identifyUser(user: {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  setupCompleted?: boolean;
  plan?: string;
}): void {
  if (!initialized) return;

  const posthog = client();
  if (!posthog) return;

  posthog.identify(user.id, {
    email: user.email,
    name: user.displayName,
    avatar: user.avatarUrl,
    setup_complete: user.setupCompleted ?? false,
    plan: user.plan,
  });
}

/**
 * Reset identity on logout. Clears the distinct_id and starts a new anonymous session.
 */
export function resetUser(): void {
  if (!initialized) return;
  client()?.reset();
}

// ── Event Tracking ───────────────────────────────────────────────────────────

/**
 * Track a custom event with optional properties.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  client()?.capture(event, properties);
}

// ── Super Properties ─────────────────────────────────────────────────────────

/**
 * Register super properties that are sent with every subsequent event.
 * Useful for things like theme, sound preference, etc.
 */
export function registerSuperProperties(properties: Record<string, unknown>): void {
  if (!initialized) return;
  client()?.register(properties);
}

// ── Feature Flags ────────────────────────────────────────────────────────────

/**
 * Check if a feature flag is enabled.
 */
export function isFeatureEnabled(flag: string): boolean {
  if (!initialized) return false;
  return client()?.isFeatureEnabled(flag) ?? false;
}

/**
 * Get a feature flag's value (for multivariate flags).
 */
export function getFeatureFlag(flag: string): string | boolean | undefined {
  if (!initialized) return undefined;
  return client()?.getFeatureFlag(flag);
}

// ── Groups ───────────────────────────────────────────────────────────────────

/**
 * Associate the user with a group (e.g., organization, instance).
 */
export function setGroup(groupType: string, groupKey: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  client()?.group(groupType, groupKey, properties);
}

// ── Convenience: Pre-defined Events ──────────────────────────────────────────
// These provide type-safe wrappers for common events.

export const analytics = {
  init: initAnalytics,
  identify: identifyUser,
  reset: resetUser,
  track,
  register: registerSuperProperties,
  isFeatureEnabled,
  getFeatureFlag,
  setGroup,

  // ── Auth Events ──
  loginStarted: (method: 'google' | 'magic_link' | 'dev') => {
    track('login_started', { method });
  },
  loginSuccess: (method: 'google' | 'magic_link' | 'dev') => {
    track('login_success', { method });
  },
  loginFailed: (method: 'google' | 'magic_link' | 'dev', error?: string) => {
    track('login_failed', { method, error });
  },
  logout: () => {
    track('logout');
    resetUser();
  },

  // ── Onboarding ──
  setupStarted: () => track('setup_started'),
  setupStepCompleted: (step: string, data?: Record<string, unknown>) => {
    track('setup_step_completed', { step, ...data });
  },
  setupCompleted: () => track('setup_completed'),
  tourStarted: () => track('tour_started'),
  tourCompleted: () => track('tour_completed'),
  tourSkipped: () => track('tour_skipped'),

  // ── Chat / Agent ──
  chatMessageSent: (props?: { sessionKey?: string; messageLength?: number }) => {
    track('chat_message_sent', props);
  },
  chatSessionCreated: (sessionKey?: string) => {
    track('chat_session_created', { session_key: sessionKey });
  },
  chatSessionSwitched: (sessionKey?: string) => {
    track('chat_session_switched', { session_key: sessionKey });
  },
  chatStopped: () => track('chat_stopped'),
  agentConnected: () => track('agent_connected'),
  agentDisconnected: () => track('agent_disconnected'),

  // ── Windows / Navigation ──
  windowOpened: (type: string) => {
    track('window_opened', { window_type: type });
  },
  windowClosed: (type: string) => {
    track('window_closed', { window_type: type });
  },
  windowFocused: (type: string) => {
    track('window_focused', { window_type: type });
  },
  panelOpened: (panel: string) => {
    track('panel_opened', { panel });
  },
  panelClosed: (panel: string) => {
    track('panel_closed', { panel });
  },

  // ── Workspace ──
  workspaceSwitched: (workspaceId: string, platform?: string) => {
    track('workspace_switched', { workspace_id: workspaceId, platform });
  },
  workspaceCreated: (platform: string) => {
    track('workspace_created', { platform });
  },

  // ── Settings ──
  themeChanged: (theme: string) => {
    track('theme_changed', { theme });
    registerSuperProperties({ theme });
  },
  soundToggled: (enabled: boolean) => {
    track('sound_toggled', { enabled });
    registerSuperProperties({ sound_enabled: enabled });
  },
  wallpaperChanged: (wallpaperId: string) => {
    track('wallpaper_changed', { wallpaper_id: wallpaperId });
  },

  // ── Computer / Container ──
  computerProvisioned: () => track('computer_provisioned'),
  computerRebootStarted: () => track('computer_reboot_started'),
  computerRebootCompleted: () => track('computer_reboot_completed'),
  computerShutdown: () => track('computer_shutdown'),

  // ── Spotlight ──
  spotlightOpened: () => track('spotlight_opened'),
  spotlightCommandExecuted: (command: string) => {
    track('spotlight_command_executed', { command });
  },

  // ── Email ──
  emailSent: (props?: { threadId?: string }) => {
    track('email_sent', props);
  },
  emailOpened: (props?: { threadId?: string }) => {
    track('email_opened', props);
  },

  // ── Files ──
  fileOpened: (extension?: string) => {
    track('file_opened', { extension });
  },
  fileCreated: (extension?: string) => {
    track('file_created', { extension });
  },

  // ── Errors ──
  errorOccurred: (error: string, context?: string) => {
    track('error_occurred', { error, context });
  },
} as const;

export default analytics;
