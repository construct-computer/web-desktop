import { useCallback, useEffect, useRef } from 'react';
import * as api from '@/services/api';
import { useTerminalStore, type TerminalRun } from '@/stores/terminalStore';

function needsFullLog(run: TerminalRun): boolean {
  return Boolean(
    run.toolCallId
    && (run.outputRef || run.preview)
    && !run.hydratedFull
    && run.chunks.length === 0,
  );
}

/** Fetches persisted terminal output into the store when runs only have previews. */
export function useTerminalHydration(
  runs: TerminalRun[],
  sessionKey: string | undefined,
  terminalId: string,
): {
  requestHydration: (run: TerminalRun) => void;
} {
  const mergeRunOutput = useTerminalStore((s) => s.mergeRunOutput);
  const appendRunsFromApi = useTerminalStore((s) => s.appendRunsFromApi);
  const inflightRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchFullLog = useCallback(async (toolCallId: string) => {
    if (inflightRef.current.has(toolCallId)) return;
    inflightRef.current.add(toolCallId);
    try {
      const result = await api.getTerminalRunOutput(toolCallId);
      if (!mountedRef.current) return;
      if (result.success && result.data?.output) {
        mergeRunOutput(toolCallId, result.data.output);
      }
    } finally {
      inflightRef.current.delete(toolCallId);
    }
  }, [mergeRunOutput]);

  const requestHydration = useCallback((run: TerminalRun) => {
    if (!run.toolCallId || !needsFullLog(run)) return;
    void fetchFullLog(run.toolCallId);
  }, [fetchFullLog]);

  useEffect(() => {
    if (!sessionKey) return;
    void (async () => {
      const result = await api.getTerminalRuns(sessionKey, { terminalId, limit: 100 });
      if (!mountedRef.current || !result.success || !result.data?.runs?.length) return;
      appendRunsFromApi(result.data.runs);
    })();
  }, [sessionKey, terminalId, appendRunsFromApi]);

  useEffect(() => {
    for (const run of runs) {
      if (needsFullLog(run) && run.toolCallId) {
        void fetchFullLog(run.toolCallId);
      }
    }
  }, [runs, fetchFullLog]);

  return { requestHydration };
}
