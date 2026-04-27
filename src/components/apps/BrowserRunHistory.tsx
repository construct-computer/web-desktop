/**
 * BrowserRunHistory — surfaces past remote_browser runs (task, status, cost).
 * Rendered inside BrowserWindow's empty state. Screenshots are not persisted;
 * the agent fetches them on demand via remote_browser_screenshot.
 */

import { useEffect, useState, useCallback } from 'react';
import { Clock, AlertTriangle, CheckCircle2, Loader2, ChevronLeft, RefreshCw } from 'lucide-react';
import { listBrowserRuns, getBrowserRun, type BrowserRunSummary, type BrowserRunDetail } from '@/services/api';

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

function StatusDot({ status }: { status: BrowserRunSummary['status'] }) {
  if (status === 'running') return <Loader2 className="w-3 h-3 animate-spin text-[var(--color-text-subtle)]" />;
  if (status === 'success') return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
  if (status === 'cancelled') return <Clock className="w-3 h-3 text-amber-500" />;
  return <AlertTriangle className="w-3 h-3 text-red-500" />;
}

export function BrowserRunHistory() {
  const [runs, setRuns] = useState<BrowserRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<BrowserRunDetail | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listBrowserRuns(30);
    if (res.success && res.data) setRuns(res.data.runs);
    else setError((!res.success && res.error) || 'Failed to load history');
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openDetail = useCallback(async (runId: string) => {
    setOpenLoading(true);
    const res = await getBrowserRun(runId);
    if (res.success && res.data) setOpenRun(res.data);
    setOpenLoading(false);
  }, []);

  if (openRun) {
    return (
      <div className="w-full h-full overflow-y-auto px-6 py-4 text-left">
        <button
          onClick={() => setOpenRun(null)}
          className="flex items-center gap-1 text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-text)] mb-3"
        >
          <ChevronLeft className="w-3 h-3" /> Back to history
        </button>
        <div className="flex items-start gap-2 mb-3">
          <StatusDot status={openRun.run.status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--color-text)] line-clamp-3">{openRun.run.task || '(no task)'}</p>
            <p className="text-xs text-[var(--color-text-subtle)] opacity-70 mt-0.5">
              {relTime(openRun.run.started_at)}
              {openRun.run.cost_usd != null && ` · $${openRun.run.cost_usd.toFixed(4)}`}
              {openRun.run.step_count != null && ` · ${openRun.run.step_count} steps`}
            </p>
          </div>
        </div>
        {openRun.run.final_text && (
          <pre className="text-[11px] text-[var(--color-text-muted)] bg-black/30 rounded p-2 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
            {openRun.run.final_text}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto px-6 py-4 text-left">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-subtle)] opacity-60">Recent browser runs</p>
        <button
          onClick={refresh}
          className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {!loading && runs.length === 0 && !error && (
        <p className="text-xs text-[var(--color-text-subtle)] opacity-50">No browser runs yet.</p>
      )}
      <div className="space-y-1.5">
        {runs.map((r) => (
          <button
            key={r.run_id}
            onClick={() => openDetail(r.run_id)}
            disabled={openLoading}
            className="w-full text-left px-2 py-2 rounded hover:bg-white/5 transition-colors flex items-start gap-2"
          >
            <div className="mt-0.5"><StatusDot status={r.status} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--color-text)] line-clamp-2">{r.task || '(no task)'}</p>
              <p className="text-[10px] text-[var(--color-text-subtle)] opacity-60 mt-0.5">
                {relTime(r.started_at)}
                {r.cost_usd != null && ` · $${r.cost_usd.toFixed(4)}`}
                {r.step_count != null && ` · ${r.step_count} steps`}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
