import { useState, useEffect, useRef, useCallback } from 'react';
import { agentWS } from '@/services/websocket';

export interface LatencyData {
  /** Frontend → Worker HTTP round-trip (ms) */
  http: number | null;
  /** Frontend → Agent DO via WebSocket round-trip (ms) */
  agentWs: number | null;
}

/** Prefer agent WebSocket RTT; fall back to worker edge HTTP when agent is unavailable. */
export function pickDisplayLatency(data: LatencyData): number | null {
  if (data.agentWs !== null) return data.agentWs;
  if (data.http !== null) return data.http;
  return null;
}

const POLL_INTERVAL_MS = 1500;

/**
 * Measures latency between the frontend and backend.
 * Only polls while `active` is true (i.e. when the popover is visible).
 *
 * HTTP and agent WS probes update independently so a slow or timing-out agent
 * ping does not block showing worker (edge) latency first.
 */
export function useLatency(active: boolean): LatencyData {
  const [data, setData] = useState<LatencyData>({
    http: null,
    agentWs: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const measure = useCallback(() => {
    void measureHttp().then((http) => {
      setData((d) => (d.http === http ? d : { ...d, http }));
    });
    void measureWs(() => agentWS.ping(2500)).then((agentWs) => {
      setData((d) => (d.agentWs === agentWs ? d : { ...d, agentWs }));
    });
  }, []);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    measure();
    intervalRef.current = setInterval(measure, POLL_INTERVAL_MS);
    let lastReportAt = 0;

    const reportIfDue = (snapshot: LatencyData) => {
      const now = Date.now();
      if (now - lastReportAt < 60_000) return;
      lastReportAt = now;
      const http = snapshot.http;
      const agentWs = snapshot.agentWs;
      if (http == null && agentWs == null) return;
      void import('@/lib/observability').then(({ reportClientTiming }) => {
        if (http != null) {
          reportClientTiming({ category: 'latency', action: 'http_probe', durationMs: http });
        }
        if (agentWs != null) {
          reportClientTiming({ category: 'latency', action: 'agent_ws_ping', durationMs: agentWs });
        }
      });
    };

    const reportInterval = setInterval(() => {
      setData((snapshot) => {
        reportIfDue(snapshot);
        return snapshot;
      });
    }, 60_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      clearInterval(reportInterval);
    };
  }, [active, measure]);

  return data;
}

async function measureHttp(): Promise<number | null> {
  try {
    const start = performance.now();
    const res = await fetch('/health', { cache: 'no-store' });
    if (!res.ok) return null;
    await res.text();
    return Math.round(performance.now() - start);
  } catch {
    return null;
  }
}

async function measureWs(pingFn: () => Promise<number>): Promise<number | null> {
  try {
    return await pingFn();
  } catch {
    return null;
  }
}
