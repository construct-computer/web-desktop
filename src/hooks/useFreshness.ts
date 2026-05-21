import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface FreshnessOptions {
  enabled?: boolean;
  intervalMs?: number;
  staleMs?: number;
  runOnMount?: boolean;
  refreshOnFocus?: boolean;
  refreshOnOnline?: boolean;
}

interface FreshnessRefreshOptions {
  force?: boolean;
}

export interface FreshnessState {
  isRefreshing: boolean;
  lastUpdatedAt: number | null;
  now: number;
  isStale: boolean;
  error: string | null;
  refreshNow: (options?: FreshnessRefreshOptions) => Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Refresh failed';
}

/**
 * Keeps async views current without duplicating interval/focus/online wiring.
 * Concurrent refreshes are coalesced so slow requests cannot pile up.
 */
export function useFreshness(
  refresh: () => Promise<void> | void,
  {
    enabled = true,
    intervalMs,
    staleMs,
    runOnMount = false,
    refreshOnFocus = true,
    refreshOnOnline = true,
  }: FreshnessOptions = {},
): FreshnessState {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const activeRefreshCountRef = useRef(0);
  const refreshRunIdRef = useRef(0);
  const mountedRef = useRef(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  refreshRef.current = refresh;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshNow = useCallback(async (options?: FreshnessRefreshOptions) => {
    if (!enabled) return;
    if (!options?.force && inFlightRef.current) return inFlightRef.current;

    const runId = ++refreshRunIdRef.current;
    const run = (async () => {
      activeRefreshCountRef.current += 1;
      setIsRefreshing(true);
      setError(null);
      try {
        await refreshRef.current();
        if (mountedRef.current) {
          const ts = Date.now();
          setLastUpdatedAt(ts);
          setNow(ts);
        }
      } catch (err) {
        if (mountedRef.current) setError(toErrorMessage(err));
      } finally {
        if (refreshRunIdRef.current === runId) inFlightRef.current = null;
        activeRefreshCountRef.current = Math.max(0, activeRefreshCountRef.current - 1);
        if (mountedRef.current && activeRefreshCountRef.current === 0) setIsRefreshing(false);
      }
    })();

    inFlightRef.current = run;
    return run;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !runOnMount) return;
    void refreshNow();
  }, [enabled, refreshNow, runOnMount]);

  useEffect(() => {
    if (!enabled || !intervalMs) return;
    const id = window.setInterval(() => {
      void refreshNow();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, refreshNow]);

  useEffect(() => {
    if (!enabled || !refreshOnFocus) return;
    const handleVisible = () => {
      if (!document.hidden) void refreshNow();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [enabled, refreshNow, refreshOnFocus]);

  useEffect(() => {
    if (!enabled || !refreshOnOnline) return;
    const handleOnline = () => void refreshNow();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [enabled, refreshNow, refreshOnOnline]);

  useEffect(() => {
    if (!staleMs || !lastUpdatedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), Math.min(10_000, Math.max(1_000, staleMs / 4)));
    return () => window.clearInterval(id);
  }, [lastUpdatedAt, staleMs]);

  const isStale = useMemo(
    () => Boolean(staleMs && lastUpdatedAt && now - lastUpdatedAt > staleMs),
    [lastUpdatedAt, now, staleMs],
  );

  return { isRefreshing, lastUpdatedAt, now, isStale, error, refreshNow };
}
