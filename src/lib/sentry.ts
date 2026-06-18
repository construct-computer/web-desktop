/**
 * Sentry initialization for the construct.computer web frontend.
 *
 * Initialized once at app startup (main.tsx) BEFORE React renders so the
 * global error handlers and ErrorBoundary captures feed Sentry from the first
 * paint. When VITE_PUBLIC_SENTRY_DSN is unset (local dev), init is a no-op
 * and all capture helpers degrade to no-ops.
 *
 * Replay policy: `replaysOnErrorSampleRate: 1.0` + `replaysSessionSampleRate: 0`
 * — capture a session replay only when an error occurs (keeps cost bounded).
 * PostHog session replay continues to run alongside for product analytics.
 */

import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_PUBLIC_SENTRY_DSN as string | undefined;
const SENTRY_ENVIRONMENT = import.meta.env.VITE_PUBLIC_SENTRY_ENVIRONMENT as string | undefined;
const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined;

declare const __GIT_HASH__: string | undefined;

let initialized = false;

/** True when Sentry has been initialized with a DSN. */
export function sentryEnabled(): boolean {
  return initialized;
}

/** Initialize Sentry. Call once at app startup before React renders. */
export function initSentry(): void {
  if (initialized) return;
  if (!SENTRY_DSN) return;

  const release = APP_VERSION
    || (typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : undefined)
    || 'unknown';

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release,
    // Browser tracing for frontend performance spans; joins with backend
    // traceparent to form end-to-end distributed traces.
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session replay attached to errors only (cost-bounded).
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Propagate trace context to the API origin so backend spans join.
    tracePropagationTargets: [/^\//, /construct\.computer/],
  });

  initialized = true;
}

/** Capture an exception with optional context. No-op if unconfigured. */
export function captureException(
  err: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id: string };
  },
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context?.user) scope.setUser(context.user);
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context?.extra) {
      for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v);
    }
    Sentry.captureException(err);
  });
}

/** Capture a message at the given level. No-op if unconfigured. */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context?.extra) {
      for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v);
    }
    Sentry.captureMessage(message, level);
  });
}

/** Set the current user on the Sentry scope. No-op if unconfigured. */
export function setSentryUser(user: { id: string; email?: string | null } | null): void {
  if (!initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  } else {
    Sentry.setUser(null);
  }
}

export { Sentry };
