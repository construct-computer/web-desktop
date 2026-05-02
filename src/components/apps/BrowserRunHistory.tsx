/**
 * BrowserRunHistory — surfaces past browser runs (task, status, output).
 * Rendered inside BrowserWindow's empty state. Screenshots are not persisted;
 * the agent fetches them on demand via remote_browser_screenshot.
 *
 * UX: runs are grouped by day, filterable by status + free-text, inline
 * expandable (no view swap), and the scroll position is preserved across
 * refreshes.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Clock, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, X, ChevronDown, ChevronRight,
  StopCircle, ExternalLink,
} from 'lucide-react';
import {
  listBrowserRuns, getBrowserRun, stopBrowserRun,
  type BrowserRunSummary, type BrowserRunDetail,
} from '@/services/api';
import { BrowserScreenshotGallery } from './BrowserScreenshotGallery';
import { getOrCreateBrowserAppWindow, useComputerStore } from '@/stores/agentStore';
import { useNotificationStore } from '@/stores/notificationStore';

const RECENT_RUN_WINDOW_MS = 15 * 60 * 1000; // Browser Use live URL max lifetime

type StatusFilter = 'all' | 'running' | 'success' | 'error' | 'cancelled';

const HISTORY_LIMIT = 100;

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

function dayBucket(ts: number): { key: string; label: string } {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  let label: string;
  if (d.getTime() === today.getTime()) label = 'Today';
  else if (d.getTime() === yesterday.getTime()) label = 'Yesterday';
  else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  return { key, label };
}

function StatusDot({ status, className = 'w-3 h-3' }: { status: BrowserRunSummary['status']; className?: string }) {
  if (status === 'running') return <Loader2 className={`${className} animate-spin text-[var(--color-text-subtle)]`} />;
  if (status === 'success') return <CheckCircle2 className={`${className} text-emerald-500`} />;
  if (status === 'cancelled') return <Clock className={`${className} text-amber-500`} />;
  return <AlertTriangle className={`${className} text-red-500`} />;
}

const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'success', label: 'Success' },
  { key: 'error', label: 'Error' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function BrowserRunHistory() {
  const [tab, setTab] = useState<'runs' | 'shots'>('runs');
  const runs = useComputerStore((s) => s.browserRuns);
  const hydrated = useComputerStore((s) => s.browserRunsHydrated);
  const hydrateBrowserRuns = useComputerStore((s) => s.hydrateBrowserRuns);
  const patchBrowserRun = useComputerStore((s) => s.patchBrowserRun);
  const setActiveBrowserSession = useComputerStore((s) => s.setActiveBrowserSession);
  const [loading, setLoading] = useState(!hydrated);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, BrowserRunDetail | 'loading' | 'error'>>({});
  const [stoppingIds, setStoppingIds] = useState<Record<string, boolean>>({});
  const [openingIds, setOpeningIds] = useState<Record<string, boolean>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  const refresh = useCallback(async () => {
    if (scrollRef.current) savedScrollTop.current = scrollRef.current.scrollTop;
    setLoading(true);
    setError(null);
    const res = await listBrowserRuns(HISTORY_LIMIT);
    if (res.success && res.data) hydrateBrowserRuns(res.data.runs);
    else setError((!res.success && res.error) || 'Failed to load history');
    setLoading(false);
  }, [hydrateBrowserRuns]);

  useEffect(() => {
    // First mount: hydrate from REST. After that, the WS handlers in the store
    // keep the slice live; never refetch on visibility/focus.
    if (!hydrated) refresh();
  }, [hydrated, refresh]);

  const onStopRun = useCallback(async (runId: string) => {
    if (stoppingIds[runId]) return;
    setStoppingIds((p) => ({ ...p, [runId]: true }));
    // Optimistic flip — the WS broadcast from the per-run stop handler will
    // arrive shortly to confirm the final status.
    patchBrowserRun({ run_id: runId, status: 'cancelled', ended_at: Date.now() });
    try {
      await stopBrowserRun(runId);
    } finally {
      setStoppingIds((p) => { const { [runId]: _drop, ...rest } = p; return rest; });
    }
  }, [stoppingIds, patchBrowserRun]);

  const onOpenRun = useCallback(async (run: BrowserRunSummary) => {
    if (openingIds[run.run_id]) return;
    const subagentKey = run.subagent_id || `run:${run.run_id}`;

    // Use the cached live_url if present; otherwise fetch the run detail.
    let liveUrl = run.live_url || null;
    if (!liveUrl) {
      setOpeningIds((p) => ({ ...p, [run.run_id]: true }));
      const res = await getBrowserRun(run.run_id);
      setOpeningIds((p) => { const { [run.run_id]: _drop, ...rest } = p; return rest; });
      if (res.success && res.data) liveUrl = res.data.run.live_url || null;
    }
    if (!liveUrl) {
      useNotificationStore.getState().addNotification(
        {
          title: 'Live view no longer available',
          body: 'Browser Use live URLs expire after the 15-minute browser lifetime.',
          source: 'Browser',
          variant: 'info',
        },
        5000,
      );
      return;
    }

    const metadata = {
      browserAppWindow: true,
      browserSubagentId: subagentKey,
      browserStreamUrl: liveUrl,
      browserRunId: run.run_id,
      browserRunPhase: run.status === 'running' ? 'live' : (run.status === 'success' ? 'complete' : 'error'),
      ...(run.step_count != null ? { browserStepCount: run.step_count } : {}),
    };

    setActiveBrowserSession(run.run_id);
    getOrCreateBrowserAppWindow({
      title: 'Browser',
      metadata,
    });
  }, [openingIds, setActiveBrowserSession]);

  // Restore scroll after refresh re-renders the list.
  useEffect(() => {
    if (!loading && scrollRef.current && savedScrollTop.current > 0) {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [loading, runs]);

  const toggleExpand = useCallback(async (runId: string) => {
    setExpanded((prev) => {
      if (prev[runId]) {
        const { [runId]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [runId]: 'loading' };
    });
    if (expanded[runId]) return;
    const res = await getBrowserRun(runId);
    setExpanded((prev) => {
      // User may have collapsed before fetch returned.
      if (!(runId in prev)) return prev;
      if (res.success && res.data) return { ...prev, [runId]: res.data };
      return { ...prev, [runId]: 'error' };
    });
  }, [expanded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (r.task || '').toLowerCase().includes(q);
    });
  }, [runs, query, statusFilter]);

  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; runs: BrowserRunSummary[] }> = [];
    const byKey = new Map<string, { key: string; label: string; runs: BrowserRunSummary[] }>();
    for (const r of filtered) {
      const b = dayBucket(r.started_at);
      let g = byKey.get(b.key);
      if (!g) {
        g = { ...b, runs: [] };
        byKey.set(b.key, g);
        out.push(g);
      }
      g.runs.push(r);
    }
    return out;
  }, [filtered]);

  if (tab === 'shots') {
    return (
      <div className="w-full h-full flex flex-col">
        <TabBar tab={tab} setTab={setTab} />
        <div className="flex-1 min-h-0">
          <BrowserScreenshotGallery />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <TabBar tab={tab} setTab={setTab} />
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 text-left">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-subtle)] opacity-60">
          Recent browser runs
        </p>
        <button
          onClick={refresh}
          className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search + status filter */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)] opacity-50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by task..."
            className="w-full pl-7 pr-7 py-1 text-xs bg-white/5 border border-white/10 rounded
                       focus:outline-none focus:border-white/20 text-[var(--color-text)]
                       placeholder:text-[var(--color-text-subtle)] placeholder:opacity-40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => setStatusFilter(o.key)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              statusFilter === o.key
                ? 'bg-white/10 border-white/20 text-[var(--color-text)]'
                : 'bg-transparent border-white/10 text-[var(--color-text-subtle)] hover:bg-white/5'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {!loading && runs.length === 0 && !error && (
        <p className="text-xs text-[var(--color-text-subtle)] opacity-50">No browser runs yet.</p>
      )}
      {!loading && runs.length > 0 && filtered.length === 0 && (
        <p className="text-xs text-[var(--color-text-subtle)] opacity-50">
          No runs match{query ? ` "${query}"` : ''}{statusFilter !== 'all' ? ` (${statusFilter})` : ''}.
        </p>
      )}

      {/* Grouped runs */}
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] opacity-50 mb-1 px-1">
              {g.label}
            </p>
            <div className="space-y-1">
              {g.runs.map((r) => {
                const detail = expanded[r.run_id];
                const isOpen = !!detail;
                const isRecent = Date.now() - r.started_at < RECENT_RUN_WINDOW_MS;
                const canOpen = r.status === 'running' ? true : (isRecent && !!r.live_url);
                const isStopping = !!stoppingIds[r.run_id];
                const isOpening = !!openingIds[r.run_id];
                return (
                  <div key={r.run_id} className="rounded hover:bg-white/[0.03] transition-colors group/row">
                    <div className="w-full flex items-start gap-1 px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.run_id)}
                        className="flex-1 min-w-0 text-left flex items-start gap-2"
                      >
                        <div className="mt-0.5 shrink-0 flex items-center gap-1">
                          {isOpen
                            ? <ChevronDown className="w-3 h-3 text-[var(--color-text-subtle)] opacity-50" />
                            : <ChevronRight className="w-3 h-3 text-[var(--color-text-subtle)] opacity-50" />}
                          <StatusDot status={r.status} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[var(--color-text)] line-clamp-2">{r.task || '(no task)'}</p>
                          <p className="text-[10px] text-[var(--color-text-subtle)] opacity-60 mt-0.5">
                            {relTime(r.started_at)}
                            {r.step_count != null && ` · ${r.step_count} steps`}
                          </p>
                        </div>
                      </button>
                      <div className="shrink-0 flex items-center gap-1 mt-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                        {canOpen && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenRun(r); }}
                            disabled={isOpening}
                            title={r.status === 'running' ? 'Open live view' : 'Reopen live preview'}
                            className="p-1 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-white/5 disabled:opacity-40"
                          >
                            {isOpening ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                          </button>
                        )}
                        {r.status === 'running' && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onStopRun(r.run_id); }}
                            disabled={isStopping}
                            title="Stop this run"
                            className="p-1 rounded text-red-400/80 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                          >
                            {isStopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <StopCircle className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="ml-7 mr-2 mb-2 px-2 py-2 rounded bg-black/20 border border-white/[0.04]">
                        {detail === 'loading' && (
                          <p className="text-[11px] text-[var(--color-text-subtle)] opacity-60 inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                          </p>
                        )}
                        {detail === 'error' && (
                          <p className="text-[11px] text-red-400">Failed to load run details.</p>
                        )}
                        {typeof detail === 'object' && detail !== null && (
                          detail.run.final_text
                            ? (
                              <pre className="text-[11px] text-[var(--color-text-muted)] whitespace-pre-wrap max-h-[40vh] overflow-y-auto">
                                {detail.run.final_text}
                              </pre>
                            )
                            : (
                              <p className="text-[11px] text-[var(--color-text-subtle)] opacity-60">No final output recorded.</p>
                            )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: 'runs' | 'shots'; setTab: (t: 'runs' | 'shots') => void }) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-4 pt-3 border-b border-[var(--color-border)]">
      {(['runs', 'shots'] as const).map((k) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className={`text-[11px] px-2 py-1 rounded-t border-b-2 transition-colors ${
            tab === k
              ? 'border-white/40 text-[var(--color-text)]'
              : 'border-transparent text-[var(--color-text-subtle)] opacity-60 hover:opacity-100'
          }`}
        >
          {k === 'runs' ? 'Runs' : 'Screenshots'}
        </button>
      ))}
    </div>
  );
}
