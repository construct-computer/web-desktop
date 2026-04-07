/**
 * PostHog Analytics — centralized tracking for construct.computer
 *
 * Usage:
 *   import { analytics } from '@/lib/analytics';
 *   analytics.track('chat_message_sent', { sessionKey: 'abc' });
 *
 * All tracking is fire-and-forget. If PostHog is not configured
 * (missing env vars), all calls are silent no-ops.
 */

import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined;

let initialized = false;

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize PostHog. Call once at app startup (main.tsx).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initAnalytics(): void {
  if (initialized || !POSTHOG_KEY) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || 'https://eu.i.posthog.com',
    defaults: '2026-01-30',
    // Automatically capture pageviews (we use a SPA, so also enable SPA tracking)
    capture_pageview: false, // we'll track "screen views" manually via window open/close
    capture_pageleave: true,
    // Session recording
    enable_recording_console_log: false,
    // Performance
    loaded: (ph) => {
      // In development, log events to console instead of sending
      if (import.meta.env.DEV) {
        ph.debug();
      }
    },
    // Privacy
    respect_dnt: true,
    persistence: 'localStorage+cookie',
    // Autocapture: clicks, inputs, page views
    autocapture: true,
  });

  initialized = true;
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Identify the current user. Call after successful login/auth check.
 * Sets the user's distinct_id and attaches person properties.
 */
export function identifyUser(user: {
  id: string;
  email: string | null;
  displayName: string | null;
  avatar?: string | null;
  setupComplete?: boolean;
}): void {
  if (!initialized) return;

  posthog.identify(user.id, {
    email: user.email,
    name: user.displayName,
    avatar: user.avatar,
    setup_complete: user.setupComplete ?? false,
  });
}

/**
 * Reset identity on logout. Clears the distinct_id and starts a new anonymous session.
 */
export function resetUser(): void {
  if (!initialized) return;
  posthog.reset();
}

// ── Event Tracking ───────────────────────────────────────────────────────────

/**
 * Track a custom event with optional properties.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

// ── Super Properties ─────────────────────────────────────────────────────────

/**
 * Register super properties that are sent with every subsequent event.
 * Useful for things like theme, sound preference, etc.
 */
export function registerSuperProperties(properties: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.register(properties);
}

// ── Feature Flags ────────────────────────────────────────────────────────────

/**
 * Check if a feature flag is enabled.
 */
export function isFeatureEnabled(flag: string): boolean {
  if (!initialized) return false;
  return posthog.isFeatureEnabled(flag) ?? false;
}

/**
 * Get a feature flag's value (for multivariate flags).
 */
export function getFeatureFlag(flag: string): string | boolean | undefined {
  if (!initialized) return undefined;
  return posthog.getFeatureFlag(flag);
}

// ── Groups ───────────────────────────────────────────────────────────────────

/**
 * Associate the user with a group (e.g., organization, instance).
 */
export function setGroup(groupType: string, groupKey: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.group(groupType, groupKey, properties);
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
