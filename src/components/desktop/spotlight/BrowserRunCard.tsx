/**
 * BrowserRunCard — slim, single-line summary of an in-flight or finished
 * browser run. Surfaces a favicon, status pill, goal/host and a single
 * Open Browser CTA. Intentionally compact to match the other tool rows.
 */
import { useMemo, useState } from 'react';
import { Globe, ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { getOrCreateBrowserAppWindow, markBrowserWindowEngaged, useComputerStore, type ChatMessage } from '@/stores/agentStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { getBrowserRun, type BrowserRunSummary } from '@/services/api';

type RunPhase = 'live' | 'complete' | 'error';

function hostFromUrl(u: string | undefined): string | null {
  if (!u) return null;
  try { return new URL(u).host || null; } catch { return null; }
}

function faviconUrl(host: string | null): string | null {
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

function phaseFromRun(run: BrowserRunSummary | undefined): RunPhase {
  if (!run) return 'live';
  if (run.status === 'running') return 'live';
  if (run.status === 'success') return 'complete';
  return 'error';
}

export function BrowserRunCard({
  goal,
  startUrl,
  runId: runIdProp,
  activities,
  subagentId = 'main',
}: {
  goal: string;
  startUrl?: string;
  runId?: string;
  activities: ChatMessage[];
  subagentId?: string;
}) {
  const windows = useWindowStore((s) => s.windows);
  const browserRuns = useComputerStore((s) => s.browserRuns);
  const [reopening, setReopening] = useState(false);

  const win = useMemo(
    () => windows.find((w) => w.type === 'browser' && (
      w.metadata?.browserAppWindow
      || w.metadata?.browserSubagentId === subagentId
    )),
    [windows, subagentId],
  );

  const activityWindow = useMemo(() => {
    const times = activities.map((a) => new Date(a.timestamp).getTime()).filter(Number.isFinite);
    const first = Math.min(...times);
    const last = Math.max(...times);
    return Number.isFinite(first) && Number.isFinite(last) ? { first, last } : null;
  }, [activities]);

  const durableRun = useMemo(() => {
    if (runIdProp) return browserRuns.find((r) => r.run_id === runIdProp);
    const subagentRuns = browserRuns.filter((run) => (run.subagent_id || 'main') === subagentId);
    const inActivityWindow = activityWindow
      ? subagentRuns.find((run) => run.started_at >= activityWindow.first - 5_000 && run.started_at <= activityWindow.last + 60_000)
      : undefined;
    return inActivityWindow
      || subagentRuns.find((run) => run.status === 'running')
      || subagentRuns[0];
  }, [activityWindow, browserRuns, runIdProp, subagentId]);

  const runId = runIdProp
    || (typeof win?.metadata?.browserRunId === 'string' ? win.metadata.browserRunId as string : undefined)
    || durableRun?.run_id;
  const phase = (win?.metadata?.browserRunPhase as RunPhase | undefined) ?? phaseFromRun(durableRun);
  const stepCount = typeof win?.metadata?.browserStepCount === 'number'
    ? win.metadata.browserStepCount as number
    : durableRun?.step_count ?? undefined;

  const latestUrl = useMemo(() => {
    for (let i = activities.length - 1; i >= 0; i--) {
      const u = activities[i]?.browserAction?.url;
      if (typeof u === 'string' && u) return u;
    }
    return durableRun?.live_url || startUrl;
  }, [activities, durableRun?.live_url, startUrl]);

  const host = hostFromUrl(latestUrl);
  const favicon = faviconUrl(host);

  const pill = phase === 'complete'
    ? { label: 'Done', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="w-3 h-3" /> }
    : phase === 'error'
      ? { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <XCircle className="w-3 h-3" /> }
      : { label: 'Running', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Loader2 className="w-3 h-3 animate-spin" /> };

  const shortGoal = goal.length > 80 ? goal.slice(0, 80) + '…' : goal;

  // User explicitly opening the browser counts as engagement — never auto-close.
  const openBrowser = () => {
    const id = getOrCreateBrowserAppWindow({
      title: 'Browser',
      metadata: {
        browserAppWindow: true,
        browserSubagentId: subagentId,
        ...(runId ? { browserRunId: runId } : {}),
      },
    });
    markBrowserWindowEngaged(id);
  };

  const reopenFromRun = async () => {
    if (!runId || reopening) return;
    setReopening(true);
    try {
      const res = await getBrowserRun(runId);
      const liveUrl = durableRun?.live_url || (res.success && res.data ? res.data.run.live_url : null);
      if (!liveUrl) {
        useNotificationStore.getState().addNotification(
          {
            title: 'Live view no longer available',
            body: 'Live browser links expire after the 15-minute browser lifetime.',
            source: 'Browser',
            variant: 'info',
          },
          5000,
        );
        return;
      }
      const id = getOrCreateBrowserAppWindow({
        title: 'Construct Browser',
        metadata: {
          browserSubagentId: subagentId,
          browserStreamUrl: liveUrl,
          browserRunId: runId,
          browserRunPhase: phase,
          ...(typeof stepCount === 'number' ? { browserStepCount: stepCount } : {}),
        },
      });
      markBrowserWindowEngaged(id);
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="mb-1.5 flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
      <div className="shrink-0 w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.04] flex items-center justify-center overflow-hidden">
        {favicon ? (
          <img src={favicon} alt="" className="w-3.5 h-3.5" referrerPolicy="no-referrer" />
        ) : (
          <Globe className="w-3.5 h-3.5 text-[var(--color-text-muted)]/50" />
        )}
      </div>

      <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-medium border ${pill.cls}`}>
        {pill.icon}
        {pill.label}
      </span>

      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-muted)]/70 leading-snug">
        {shortGoal}
        {host && <span className="text-[var(--color-text-muted)]/40"> · {host}</span>}
      </span>

      {typeof stepCount === 'number' && (
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]/40">
          {stepCount} step{stepCount === 1 ? '' : 's'}
        </span>
      )}

      {win ? (
        <button
          type="button"
          onClick={openBrowser}
          className="shrink-0 text-[10px] inline-flex items-center gap-1 px-1.5 py-1 rounded border border-white/[0.06] bg-white/[0.03] text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open Browser
        </button>
      ) : runId && (
        <button
          type="button"
          onClick={() => { void reopenFromRun(); }}
          disabled={reopening}
          className="shrink-0 text-[10px] inline-flex items-center gap-1 px-1.5 py-1 rounded border border-white/[0.06] bg-white/[0.03] text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors disabled:opacity-40"
        >
          {reopening ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
          Open Browser
        </button>
      )}
    </div>
  );
}
