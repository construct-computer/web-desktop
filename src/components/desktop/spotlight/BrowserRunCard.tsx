/**
 * BrowserRunCard — compact summary of an in-flight or finished Browser Use
 * run. Surfaces the goal, current URL with favicon, status pill, capture
 * thumbs, and a single Open Browser CTA.
 */
import { useEffect, useMemo, useState } from 'react';
import { Globe, ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { getOrCreateBrowserAppWindow, useComputerStore, type ChatMessage } from '@/stores/agentStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { getBrowserRun, type BrowserRunSummary } from '@/services/api';
import { fetchBrowserScreenshot } from '@/services/api';

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

function CaptureThumb({ shotKey }: { shotKey: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    fetchBrowserScreenshot(shotKey)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [shotKey]);
  if (!src) return null;
  return <img src={src} alt="" className="w-8 h-8 rounded object-cover border border-white/[0.06]" />;
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
  const browserScreenshots = useComputerStore((s) => s.browserScreenshots);
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

  const captureShots = useMemo(
    () => (runId ? browserScreenshots.filter((s) => s.run_id === runId).slice(0, 3) : []),
    [browserScreenshots, runId],
  );

  const host = hostFromUrl(latestUrl);
  const favicon = faviconUrl(host);

  const pill = phase === 'complete'
    ? { label: 'Done', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="w-3 h-3" /> }
    : phase === 'error'
      ? { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <XCircle className="w-3 h-3" /> }
      : { label: 'Running', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Loader2 className="w-3 h-3 animate-spin" /> };

  const shortGoal = goal.length > 110 ? goal.slice(0, 110) + '…' : goal;

  const openBrowser = () => {
    getOrCreateBrowserAppWindow({
      title: 'Browser',
      metadata: {
        browserAppWindow: true,
        browserSubagentId: subagentId,
        ...(runId ? { browserRunId: runId } : {}),
      },
    });
  };

  return (
    <div className="mb-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.04] flex items-center justify-center overflow-hidden">
          {favicon ? (
            <img src={favicon} alt="" className="w-4 h-4" referrerPolicy="no-referrer" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-[var(--color-text-muted)]/50" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-medium border ${pill.cls}`}>
              {pill.icon}
              {pill.label}
            </span>
            {host && <span className="text-[10px] text-[var(--color-text-muted)]/50 truncate">{host}</span>}
            {typeof stepCount === 'number' && (
              <span className="ml-auto text-[10px] tabular-nums text-[var(--color-text-muted)]/40">
                {stepCount} step{stepCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)]/70 leading-snug truncate">{shortGoal}</p>
          {captureShots.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              {captureShots.map((s) => <CaptureThumb key={s.key} shotKey={s.key} />)}
              <span className="text-[10px] text-[var(--color-text-subtle)]">{captureShots.length} capture{captureShots.length === 1 ? '' : 's'}</span>
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {win ? (
            <button
              type="button"
              onClick={openBrowser}
              className="text-[10px] inline-flex items-center gap-1 px-1.5 py-1 rounded border border-white/[0.06] bg-white/[0.03] text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open Browser
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
                        body: 'Live browser links expire after the 15-minute browser lifetime.',
                        source: 'Browser',
                        variant: 'info',
                      },
                      5000,
                    );
                    return;
                  }
                  getOrCreateBrowserAppWindow({
                    title: 'Construct Browser',
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
              className="text-[10px] inline-flex items-center gap-1 px-1.5 py-1 rounded border border-white/[0.06] bg-white/[0.03] text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors disabled:opacity-40"
            >
              {reopening ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
              Open Browser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
