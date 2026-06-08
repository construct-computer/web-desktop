import { memo, useCallback, useMemo } from 'react';
import { Check, Monitor, StopCircle, Loader2, PlayCircle, AlertTriangle, PanelRight, LayoutList, ChevronUp } from 'lucide-react';
import { stopBrowserRun } from '@/services/api';
import type { BrowserSessionRecord } from '@/stores/agentStore';
import { useState } from 'react';

type RunPhase = 'live' | 'complete' | 'error';

function hostLabel(url?: string): string {
  if (!url) return '';
  try { return new URL(url).hostname; } catch { return url; }
}

export const BrowserLivePreview = memo(function BrowserLivePreview({
  streamUrl,
  session,
  runPhase,
  runErrorDetail,
  stepCount,
  runId,
  pageUrl,
  isDead,
  reloadKey,
  onLoad,
  onError,
  onManualReconnect,
  goal = '',
  onOpenDetails,
  detailsOpen = false,
}: {
  streamUrl: string | null;
  session?: BrowserSessionRecord;
  runPhase: RunPhase;
  runErrorDetail: string;
  stepCount?: number;
  runId?: string;
  pageUrl?: string;
  isDead: boolean;
  reloadKey: number;
  onLoad: () => void;
  onError: () => void;
  onManualReconnect: () => void;
  progressLabel?: string;
  goal?: string;
  onOpenDetails?: () => void;
  detailsOpen?: boolean;
}) {
  if (!streamUrl) {
    return <BrowserPreviewEmpty session={session} requestedUrl={pageUrl} onOpenDetails={onOpenDetails} />;
  }

  return (
    <BrowserStreamOverlay
      streamUrl={streamUrl}
      runPhase={runPhase}
      runErrorDetail={runErrorDetail}
      stepCount={stepCount}
      runId={runId}
      pageUrl={pageUrl}
      isDead={isDead}
      reloadKey={reloadKey}
      onLoad={onLoad}
      onError={onError}
      onManualReconnect={onManualReconnect}
      goal={goal}
      session={session}
      onOpenDetails={onOpenDetails}
      detailsOpen={detailsOpen}
    />
  );
});

function BrowserPreviewEmpty({
  session,
  requestedUrl,
  onOpenDetails,
}: {
  session?: BrowserSessionRecord;
  requestedUrl?: string;
  onOpenDetails?: () => void;
}) {
  const message = useMemo(() => {
    if (!session && requestedUrl) {
      return {
        title: 'Ready for browser session',
        body: `Ask Construct to open ${requestedUrl}. Live preview and captures will appear here.`,
        icon: <PlayCircle className="w-10 h-10 text-[var(--color-accent)] opacity-40 animate-pulse" />,
      };
    }
    if (!session) {
      return {
        title: 'Waiting for browser session',
        body: 'When Construct opens a remote browser session, the live stream will attach here.',
        icon: <Monitor className="w-10 h-10 text-[var(--color-text-subtle)] opacity-20" />,
      };
    }
    if (session.status === 'complete') {
      return {
        title: 'Run finished',
        body: 'Open Details for captures and downloads from this run.',
        icon: <Check className="w-10 h-10 text-emerald-400 opacity-40" />,
      };
    }
    if (session.status === 'idle') {
      return {
        title: 'Session stopped',
        body: 'This remote browser session was stopped.',
        icon: <StopCircle className="w-10 h-10 text-[var(--color-text-subtle)] opacity-30" />,
      };
    }
    if (session.status === 'expired') {
      return {
        title: 'Preview expired',
        body: 'Captures and run history remain in Details.',
        icon: <ClockIcon className="w-10 h-10 text-amber-500 opacity-30" />,
      };
    }
    if (session.status === 'error') {
      return {
        title: 'Browser run failed',
        body: session.error || 'Check Details for run logs.',
        icon: <AlertTriangle className="w-10 h-10 text-red-400 opacity-40 animate-bounce" />,
      };
    }
    return {
      title: 'Connecting…',
      body: 'Attaching live stream from remote browser.',
      icon: <Loader2 className="w-10 h-10 text-[var(--color-accent)] animate-spin opacity-60" />,
    };
  }, [requestedUrl, session]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center px-6 max-w-sm h-full bg-[var(--color-surface)] select-none">
      <div className="mb-2">{message.icon}</div>
      <p className="text-sm font-semibold text-[var(--color-text-muted)]">{message.title}</p>
      <p className="text-xs text-[var(--color-text-subtle)] leading-relaxed">{message.body}</p>
      {onOpenDetails && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border border-white/20 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.04]"
        >
          <PanelRight className="w-3.5 h-3.5" />
          Open Details
        </button>
      )}
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const BrowserStreamOverlay = memo(function BrowserStreamOverlay({
  streamUrl, runPhase, runErrorDetail, stepCount, runId, pageUrl, isDead, reloadKey, onLoad, onError, onManualReconnect, goal, session,
  onOpenDetails, detailsOpen,
}: {
  streamUrl: string;
  runPhase: RunPhase;
  runErrorDetail: string;
  stepCount?: number;
  runId?: string;
  pageUrl?: string;
  isDead: boolean;
  reloadKey: number;
  onLoad: () => void;
  onError: () => void;
  onManualReconnect: () => void;
  goal?: string;
  session?: BrowserSessionRecord;
  onOpenDetails?: () => void;
  detailsOpen?: boolean;
}) {
  const isLive = runPhase === 'live';
  const isComplete = runPhase === 'complete';
  const isErr = runPhase === 'error';
  const [stopping, setStopping] = useState(false);

  const onStop = useCallback(async () => {
    if (!runId || stopping) return;
    setStopping(true);
    try { await stopBrowserRun(runId); } catch { /* WS will surface */ }
    finally { setStopping(false); }
  }, [runId, stopping]);

  const statusLabel = isErr
    ? 'Failed'
    : isComplete
      ? 'Finished'
      : reloadKey > 0 && !isDead
        ? 'Reconnecting'
        : 'Live';

  const subtitle = goal || session?.task || hostLabel(pageUrl);
  const barClass = isErr
    ? 'bg-red-500/[0.08] text-red-400 border-red-500/20'
    : isComplete
      ? 'bg-emerald-500/[0.08] text-emerald-400 border-emerald-500/20'
      : 'bg-amber-500/[0.08] text-amber-400 border-amber-500/20';

  const stepBadge = typeof stepCount === 'number' ? `${stepCount} step${stepCount === 1 ? '' : 's'}` : null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-surface)]">
      <div className={`shrink-0 flex items-center gap-2 px-3 py-1.5 text-[11px] font-sans border-b select-none min-h-[36px] ${barClass}`}>
        {isLive && !isDead ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-warning)]" />
          </span>
        ) : (
          <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
        )}
        <span className="shrink-0 font-semibold uppercase tracking-wide text-[10px] opacity-80">{statusLabel}</span>
        <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
          {subtitle}
          {pageUrl && hostLabel(pageUrl) ? ` · ${hostLabel(pageUrl)}` : ''}
        </span>
        {stepBadge && (
          <span className="shrink-0 text-[10px] font-mono tabular-nums opacity-70">{stepBadge}</span>
        )}
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className={[
              'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-all',
              detailsOpen
                ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                : 'border-white/20 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.04]',
            ].join(' ')}
            title="Run details, captures, and downloads"
          >
            <PanelRight className="w-3.5 h-3.5" />
            Details
          </button>
        )}
        {isLive && runId && (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40"
          >
            <StopCircle className="w-3 h-3" />
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </div>

      {isErr && runErrorDetail && (
        <p className="shrink-0 px-3 py-1 text-[10px] text-red-400/90 border-b border-red-500/10 truncate">{runErrorDetail}</p>
      )}

      <div className="flex-1 w-full relative min-h-0">
        {isDead ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)] z-20 select-none">
            <div className="text-center text-[var(--color-text-muted)] max-w-sm px-6 p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <Monitor className="w-12 h-12 mx-auto mb-4 opacity-40 text-[var(--color-accent)]" />
              <p className="text-sm font-semibold text-[var(--color-text)]">Stream disconnected</p>
              <p className="text-xs text-[var(--color-text-subtle)] mt-1">Session ended — open Details for captures.</p>
              <button
                type="button"
                onClick={onManualReconnect}
                className="mt-4 px-4 py-1.5 text-[11px] rounded-lg border border-[var(--color-border)] bg-white/5 hover:bg-white/10"
              >
                Retry stream
              </button>
            </div>
          </div>
        ) : (
          <iframe
            key={`${streamUrl}:${reloadKey}`}
            src={streamUrl}
            className="w-full h-full bg-white border-0"
            title="Live browser preview"
            allow="clipboard-read; clipboard-write"
            onLoad={onLoad}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
});
