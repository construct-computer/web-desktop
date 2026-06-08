/**
 * Sentry client initialization for the Construct frontend.
 */

import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENVIRONMENT = import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined
  || import.meta.env.MODE
  || 'development';
const RELEASE = import.meta.env.VITE_APP_VERSION as string | undefined;

let initialized = false;

export function initSentry(): void {
  if (initialized || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.5 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });

  initialized = true;
}

export function captureClientException(
  error: unknown,
  context?: {
    source?: string;
    correlationId?: string;
    errorId?: string;
    route?: string;
    fingerprint?: string;
    extra?: Record<string, unknown>;
  },
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context?.source) scope.setTag('source', context.source);
    if (context?.correlationId) scope.setTag('correlationId', context.correlationId);
    if (context?.errorId) scope.setTag('errorId', context.errorId);
    if (context?.route) scope.setTag('route', context.route);
    if (context?.fingerprint) {
      scope.setTag('fingerprint', context.fingerprint);
      // Group by our stable fingerprint so the same loop/error stays one issue.
      scope.setFingerprint([context.source || 'client', context.fingerprint]);
    }
    if (context?.extra) scope.setExtras(context.extra);
    Sentry.captureException(error);
  });
}

export function identifySentryUser(user: {
  id: string;
  email?: string | null;
  displayName?: string | null;
  plan?: string;
}): void {
  if (!initialized) return;
  Sentry.setUser({
    id: user.id,
    email: user.email || undefined,
    username: user.displayName || undefined,
    plan: user.plan,
  });
}

export function clearSentryUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

export { Sentry };
