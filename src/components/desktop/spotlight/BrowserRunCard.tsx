/**
 * BrowserRunCard — compact summary of an in-flight or finished Browser Use
 * run. Surfaces the goal, current URL with favicon, status pill, and step
 * counters. The "Open" button focuses the live BrowserWindow if one exists.
 *
 * Designed to ride above the activity list inside ToolCallBanner so users get
 * an at-a-glance read of "what's the agent doing in the browser right now."
 */
import { useMemo, useState } from 'react';
import { Globe, ExternalLink, Loader2, CheckCircle2, XCircle, StopCircle } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { getOrCreateBrowserAppWindow, useAgentStore, type ChatMessage } from '@/stores/agentStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { stopBrowserRun, getBrowserRun, type BrowserRunSummary } from '@/services/api';

type RunPhase = 'live' | 'complete' | 'error';

function hostFromUrl(u: string | undefined): string | null {
  if (!u) return null;
  try { return new URL(u).host || null; } catch { return null; }
}

function faviconUrl(host: string | null): string | null {
  if (!host) return null;
  // Google's S2 favicon endpoint — public, cached, no auth.
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
  activities,
  subagentId = 'main',
}: {
  goal: string;
  startUrl?: string;
  activities: ChatMessage[];
  subagentId?: string;
}) {
  const windows = useWindowStore((s) => s.windows);
  const browserRuns = useAgentStore((s) => s.browserRuns);
  const [reopening, setReopening] = useState(false);

  // Locate the live BrowserWindow for this subagent (if any).
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
    const subagentRuns = browserRuns.filter((run) => (run.subagent_id || 'main') === subagentId);
    const inActivityWindow = activityWindow
      ? subagentRuns.find((run) => run.started_at >= activityWindow.first - 5_000 && run.started_at <= activityWindow.last + 60_000)
      : undefined;
    return inActivityWindow
      || subagentRuns.find((run) => run.status === 'running')
      || subagentRuns[0];
  }, [activityWindow, browserRuns, subagentId]);

  const runId = typeof win?.metadata?.browserRunId === 'string'
    ? win.metadata.browserRunId as string
    : durableRun?.run_id;
  const phase = (win?.metadata?.browserRunPhase as RunPhase | undefined) ?? phaseFromRun(durableRun);
  const stepCount = typeof win?.metadata?.browserStepCount === 'number'
    ? win.metadata.browserStepCount as number
    : durableRun?.step_count ?? undefined;

  const [stopping, setStopping] = useState(false);
  const onStop = async () => {
    if (!runId || stopping) return;
    setStopping(true);
    try {
      await stopBrowserRun(runId);
    } finally {
      // Polling loop will flip phase to error on next tick; leave button
      // disabled until that happens.
    }
  };

  // Latest URL: pick from the most recent activity that carries one.
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

  const shortGoal = goal.length > 110 ? goal.slice(0, 110) + '…' : goal;

  return (
    <div className="mb-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 flex items-start gap-2.5">
      <div className="shrink-0 w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.04] flex items-center justify-center overflow-hidden">
        {favicon ? (
          <img
            src={favicon}
            alt=""
            className="w-4 h-4"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Globe className="w-3.5 h-3.5 text-[var(--color-text-muted)]/50" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-medium border ${pill.cls}`}
          >
            {pill.icon}
            {pill.label}
          </span>
          {host && (
            <span className="text-[10px] text-[var(--color-text-muted)]/50 truncate">{host}</span>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-[10px] tabular-nums text-[var(--color-text-muted)]/40">
            {typeof stepCount === 'number' && (
              <span>{stepCount} step{stepCount === 1 ? '' : 's'}</span>
            )}
          </span>
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)]/70 leading-snug truncate">
          {shortGoal}
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-1">
        {phase === 'live' && runId && (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className="text-[10px] inline-flex items-center gap-1 px-1.5 py-1 rounded border border-red-500/20 bg-red-500/[0.06] text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Stop this browser run"
          >
            <StopCircle className="w-3 h-3" />
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
        {win ? (
          <button
            type="button"
            onClick={() => getOrCreateBrowserAppWindow({
              title: 'Browser',
              metadata: {
                browserSubagentId: subagentId,
                ...(runId ? { browserRunId: runId } : {}),
              },
            })}
            className="text-[10px] inline-flex items-center gap-1 px-1.5 py-1 rounded border border-white/[0.06] bg-white/[0.03] text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors"
            title="Show browser window"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </button>
        ) : runId && (
          <button
            type="button"
            onClick={async () => {
              if (reopening) return;
              setReopening(true);
              try {
                const res = await getBrowserRun(runId);
                const liveUrl = durableRun?.live_url || (res.success && res.data ? res.data.run.live_url : null);
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
                getOrCreateBrowserAppWindow({
                  title: 'Web Agent',
                  metadata: {
                    browserSubagentId: subagentId,
                    browserStreamUrl: liveUrl,
                    browserRunId: runId,
                    browserRunPhase: phase,
                    ...(typeof stepCount === 'number' ? { browserStepCount: stepCount } : {}),
                  },
                });
              } finally {
                setReopening(false);
              }
            }}
            disabled={reopening}
            className="text-[10px] inline-flex items-center gap-1 px-1.5 py-1 rounded border border-white/[0.06] bg-white/[0.03] text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Reopen live preview"
          >
            {reopening ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
            Open
          </button>
        )}
      </div>
    </div>
  );
}
