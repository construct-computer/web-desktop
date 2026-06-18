/**
 * Client observability bridge — PostHog (product analytics) + Sentry (error
 * tracking) + backend correlation via traceparent/x-request-id headers.
 */

import { analytics } from '@/lib/analytics';
import { captureException, sentryEnabled } from '@/lib/sentry';

export interface ClientErrorReport {
  source: string;
  message: string;
  stack?: string;
  correlationId?: string;
  errorId?: string;
  error?: unknown;
  context?: Record<string, unknown>;
}

declare const __GIT_HASH__: string | undefined;

/**
 * Human hints for the most common (and most opaque) minified React error codes,
 * so a production Slack alert is actionable even before source maps resolve.
 * See https://react.dev/errors.
 */
const REACT_ERROR_HINTS: Record<string, string> = {
  '185': 'Maximum update depth exceeded — a setState/store update is looping (state updated during render, or in an effect without correct deps).',
  '300': 'Rendered fewer hooks than expected (a hook was called conditionally / early-returned before it).',
  '310': 'Rendered more hooks than during the previous render (conditional or out-of-order hook).',
  '321': 'Invalid hook call — a hook ran outside a component, or there are duplicate copies of React.',
  '418': 'Hydration mismatch — server-rendered HTML did not match the client.',
  '423': 'Hydration failed — the server HTML was discarded and re-rendered on the client.',
  '425': 'Text content did not match during hydration.',
};

/** Detect a (minified) React error code from a message and return a hint. */
function reactErrorHint(message: string): { code?: string; hint?: string } {
  const match = /Minified React error #(\d+)/.exec(message) || /react\.dev\/errors\/(\d+)/.exec(message);
  if (!match) return {};
  const code = match[1];
  return { code, hint: REACT_ERROR_HINTS[code] };
}

/** Build/commit identifier — always available via the Vite `__GIT_HASH__` define. */
function appRelease(): string {
  return (import.meta.env.VITE_APP_VERSION as string | undefined)
    || (typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : undefined)
    || 'unknown';
}

/** Current in-app route (path + query + hash), capped for safety. */
function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`.slice(0, 512);
}

/**
 * First meaningful (app, non-vendor) frame from a JS or React component stack.
 * Used both to triage and to keep the fingerprint stable across reports.
 */
function topAppFrame(stack?: string): string | undefined {
  if (!stack) return undefined;
  const lines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (l.startsWith('at ') || l.startsWith('in ') || l.includes('@') || l.includes('.tsx') || l.includes('.ts')));
  const appFrame = lines.find((l) => !/node_modules|-vendor|vendor-|chunk-|\bscheduler\b|\breact-dom\b/.test(l));
  return (appFrame || lines[0])?.slice(0, 300);
}

/**
 * Stable, low-cardinality fingerprint so the same error dedupes across reports
 * and deploys. Numbers in the message are masked (except React error codes) so
 * volatile ids/timestamps don't fragment grouping.
 */
function fingerprint(parts: Array<string | undefined>): string {
  const basis = parts.filter(Boolean).join('|');
  let h = 5381;
  for (let i = 0; i < basis.length; i++) {
    h = ((h << 5) + h + basis.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Report a client error to Sentry (ops) + PostHog (product analytics). */
export function reportClientError(report: ClientErrorReport): void {
  const route = currentRoute();
  const release = appRelease();
  const { code: reactErrorCode, hint: reactHint } = reactErrorHint(report.message);

  const normalizedMessage = reactErrorCode
    ? `react#${reactErrorCode}`
    : report.message.replace(/\d+/g, '#').slice(0, 160);
  const fp = fingerprint([
    report.source,
    normalizedMessage,
    topAppFrame(report.stack),
  ]);

  // Sentry: ops error tracking with full context, fingerprint, and source-mapped
  // stack (when sourcemaps are uploaded). This is the source of truth for ops.
  if (sentryEnabled()) {
    const errorObj = report.error instanceof Error
      ? report.error
      : (report.stack ? new Error(report.message) : new Error(normalizedMessage));
    if (report.stack && !(report.error instanceof Error)) {
      errorObj.stack = report.stack;
    }
    captureException(errorObj, {
      tags: {
        source: report.source,
        fingerprint: fp,
        ...(reactErrorCode ? { react_error_code: reactErrorCode } : {}),
      },
      extra: {
        route,
        release,
        correlation_id: report.correlationId,
        server_error_id: report.errorId,
        ...(reactHint ? { react_hint: reactHint } : {}),
        ...(report.context ?? {}),
      },
    });
  }

  // PostHog: product-analytics mirror (useful for funnels like "error → churn").
  analytics.errorOccurred(report.message, report.source);
}

export function createCorrelationIds(): { requestId: string; traceId: string; traceparent: string } {
  const requestId = crypto.randomUUID().slice(0, 12);
  const traceId = crypto.randomUUID().replace(/-/g, '');
  return {
    requestId,
    traceId,
    traceparent: `00-${traceId}-0000000000000000-01`,
  };
}

/** Report client-side timing samples to PostHog. */
export function reportClientTiming(input: {
  category: string;
  action: string;
  durationMs: number;
  success?: boolean;
  properties?: Record<string, unknown>;
}): void {
  analytics.track('client_timing', {
    category: input.category,
    action: input.action,
    duration_ms: input.durationMs,
    success: input.success ?? true,
    ...input.properties,
  });
}

export function reportWsReconnect(input: {
  client: 'agent' | 'browser' | 'terminal';
  attempt: number;
  delayMs: number;
  code?: number;
  reason?: string;
}): void {
  analytics.track('ws_reconnect', input);
}

export function reportWsDisconnect(input: {
  client: 'agent' | 'browser' | 'terminal';
  code?: number;
  reason?: string;
}): void {
  analytics.track('ws_disconnect', input);
}
