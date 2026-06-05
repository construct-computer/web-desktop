/**
 * Client observability bridge — PostHog, Sentry, and backend telemetry ingest.
 */

import { analytics } from '@/lib/analytics';
import { captureClientException } from '@/lib/sentry';
import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

export interface ClientErrorReport {
  source: string;
  message: string;
  stack?: string;
  correlationId?: string;
  errorId?: string;
  context?: Record<string, unknown>;
}

const pendingEvents: Array<{ name: string; properties?: Record<string, unknown> }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Report a client error to PostHog, Sentry, and the worker telemetry API. */
export function reportClientError(report: ClientErrorReport): void {
  analytics.errorOccurred(report.message, report.source);

  captureClientException(new Error(report.message), {
    source: report.source,
    correlationId: report.correlationId,
    errorId: report.errorId,
    extra: report.context,
  });

  void fetch(`${API_BASE_URL}/telemetry/errors`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      source: report.source,
      message: report.message,
      stack: report.stack,
      correlationId: report.correlationId,
      errorId: report.errorId,
      context: report.context,
    }),
  }).catch(() => {});
}

/** Queue a server-side PostHog mirror event (batched). */
export function trackServerMirror(name: string, properties?: Record<string, unknown>): void {
  pendingEvents.push({ name, properties });
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushServerMirror();
  }, 2_000);
}

async function flushServerMirror(): Promise<void> {
  if (pendingEvents.length === 0) return;
  const batch = pendingEvents.splice(0, 20);
  try {
    await fetch(`${API_BASE_URL}/telemetry/events`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    pendingEvents.unshift(...batch);
  }
}

/** Report client-side timing samples to PostHog + worker. */
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

  void fetch(`${API_BASE_URL}/telemetry/timing`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  }).catch(() => {});
}

export function reportWsReconnect(input: {
  client: 'agent' | 'browser' | 'terminal';
  attempt: number;
  delayMs: number;
  code?: number;
  reason?: string;
}): void {
  analytics.track('ws_reconnect', input);
  trackServerMirror('ws_reconnect', input);
}

export function reportWsDisconnect(input: {
  client: 'agent' | 'browser' | 'terminal';
  code?: number;
  reason?: string;
}): void {
  analytics.track('ws_disconnect', input);
  trackServerMirror('ws_disconnect', input);
}
