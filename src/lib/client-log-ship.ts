/**
 * Batch-ship warn/error client logs to construct-api for CF Observability.
 */

import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

export interface ClientLogEvent {
  level: 'warn' | 'error';
  event: string;
  module?: string;
  message?: string;
  stack?: string;
  url?: string;
  request_id?: string;
  trace_id?: string;
  extra?: Record<string, unknown>;
}

const queue: ClientLogEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastTraceId: string | undefined;

export function setClientTraceContext(ctx: { requestId?: string; traceId?: string }): void {
  if (ctx.traceId) lastTraceId = ctx.traceId;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushClientLogs();
  }, 2000);
}

export function shipClientLog(event: ClientLogEvent): void {
  queue.push({
    ...event,
    trace_id: event.trace_id ?? lastTraceId,
    url: event.url ?? (typeof window !== 'undefined' ? window.location.href : undefined),
  });
  if (queue.length >= 10) {
    void flushClientLogs();
    return;
  }
  scheduleFlush();
}

export async function flushClientLogs(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 20);
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (!token) return;

  try {
    await fetch(`${API_BASE_URL}/api/observability/client-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-request-id': crypto.randomUUID(),
        ...(lastTraceId ? { 'x-trace-id': lastTraceId } : {}),
      },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Best-effort — avoid feedback loops
  }
}
