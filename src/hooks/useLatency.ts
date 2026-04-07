import { useState, useEffect, useRef, useCallback } from 'react';
import { agentWS } from '@/services/websocket';

export interface LatencyData {
  /** Frontend → Worker HTTP round-trip (ms) */
  http: number | null;
  /** Frontend → Agent DO via WebSocket round-trip (ms) */
  agentWs: number | null;
}

const POLL_INTERVAL = 3000;

/**
 * Measures latency between the frontend and backend.
 * Only polls while `active` is true (i.e. when the popover is visible).
 */
export function useLatency(active: boolean): LatencyData {
  const [data, setData] = useState<LatencyData>({
    http: null,
    agentWs: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const measure = useCallback(async () => {
    const [http, agent] = await Promise.all([
      measureHttp(),
      measureWs(() => agentWS.ping(3000)),
    ]);
    setData({ http, agentWs: agent });
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
    intervalRef.current = setInterval(measure, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
