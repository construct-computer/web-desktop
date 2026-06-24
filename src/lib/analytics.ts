import posthog from 'posthog-js';
import type { User } from '@/types';
import { getNativePlatform, isNativePlatform } from '@/native';

let initialized = false;

export type AnalyticsSurface = 'web' | 'mobile_app' | 'telegram_mini';

function analyticsSurface(): AnalyticsSurface {
  if (isNativePlatform()) return 'mobile_app';
  if (window.location.pathname === '/mini' || window.Telegram?.WebApp) return 'telegram_mini';
  return 'web';
}

function environmentLabel(): string {
  return import.meta.env.VITE_PUBLIC_ENVIRONMENT ?? (import.meta.env.DEV ? 'local' : 'production');
}

function appVersion(): string | undefined {
  const v = import.meta.env.VITE_APP_VERSION;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function isDisabled(): boolean {
  return import.meta.env.VITE_POSTHOG_DISABLED === '1';
}

function isReady(): boolean {
  return initialized && !isDisabled();
}

/** Call once before React render. No-ops when key missing or disabled. */
export function initPostHog(): void {
  if (initialized || isDisabled()) return;

  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://x.construct.computer';
  const uiHost = import.meta.env.VITE_PUBLIC_POSTHOG_UI_HOST || 'https://eu.posthog.com';

  // Session replay + autocapture (heatmaps) are on by default. Replay sampling is
  // controlled in PostHog project settings. Virtual $pageview paths (see capturePageview)
  // group SPA screens for paths/heatmaps — see posthog-events.md at repo root.
  posthog.init(key, {
    api_host: host,
    ui_host: uiHost,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: { password: true },
    },
    loaded: (ph) => {
      ph.register({
        environment: environmentLabel(),
        surface: analyticsSurface(),
        ...(appVersion() ? { app_version: appVersion() } : {}),
      });
      if (import.meta.env.DEV) ph.debug();
    },
  });

  initialized = true;
}

export function identifyUser(user: User): void {
  if (!isReady()) return;

  posthog.identify(user.id, {
    email: user.email ?? undefined,
    plan: user.plan,
    user_id: user.id,
    username: user.username,
    display_name: user.displayName ?? undefined,
    setup_completed: user.setupCompleted,
    onboarding_completed: user.onboardingCompleted,
  });
}

export function resetAnalytics(): void {
  if (!initialized) return;
  track('auth_logout');
  posthog.reset();
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!isReady()) return;
  posthog.capture(event, props);
}

/** Virtual screen path for SPA boot phases (not the browser URL). Used for paths + heatmaps. */
export function capturePageview(
  virtualPath: string,
  props?: Record<string, unknown>,
): void {
  if (!isReady()) return;
  posthog.capture('$pageview', {
    $current_url: virtualPath,
    screen: virtualPath,
    ...props,
  });
}

/** Skip WS-origin errors — server already reports those. */
export function captureClientError(
  error: unknown,
  context?: Record<string, unknown> & { source?: string },
): void {
  if (!isReady()) return;
  if (context?.source === 'ws') return;

  const err = error instanceof Error ? error : new Error(String(error));
  posthog.captureException(err, {
    source: context?.source,
    ...context,
  });
}

export function hashSessionKey(sessionKey: string): string {
  let hash = 0;
  for (let i = 0; i < sessionKey.length; i++) {
    hash = (hash << 5) - hash + sessionKey.charCodeAt(i);
    hash |= 0;
  }
  return `sk_${Math.abs(hash).toString(36)}`;
}
