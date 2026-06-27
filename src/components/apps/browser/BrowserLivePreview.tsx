import { memo, useMemo } from 'react';
import { Check, Monitor, StopCircle, Loader2, PlayCircle, AlertTriangle, Lock, Unlock } from 'lucide-react';
import type { BrowserSessionRecord } from '@/stores/agentStore';

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
  pageUrl,
  isDead,
  reloadKey,
  onLoad,
  onError,
  onManualReconnect,
  goal = '',
  interactive = false,
  onRequestUnlock,
  onLock,
}: {
  streamUrl: string | null;
  session?: BrowserSessionRecord;
  runPhase: RunPhase;
  runErrorDetail: string;
  stepCount?: number;
  pageUrl?: string;
  isDead: boolean;
  reloadKey: number;
  onLoad: () => void;
  onError: () => void;
  onManualReconnect: () => void;
  progressLabel?: string;
  goal?: string;
  interactive?: boolean;
  onRequestUnlock?: () => void;
  onLock?: () => void;
}) {
  if (!streamUrl) {
    return <BrowserPreviewEmpty session={session} requestedUrl={pageUrl} />;
  }

  return (
    <BrowserStreamOverlay
      streamUrl={streamUrl}
      runPhase={runPhase}
      runErrorDetail={runErrorDetail}
      stepCount={stepCount}
      pageUrl={pageUrl}
      isDead={isDead}
      reloadKey={reloadKey}
      onLoad={onLoad}
      onError={onError}
      onManualReconnect={onManualReconnect}
      goal={goal}
      session={session}
      interactive={interactive}
      onRequestUnlock={onRequestUnlock}
      onLock={onLock}
    />
  );
});

function BrowserPreviewEmpty({
  session,
  requestedUrl,
}: {
  session?: BrowserSessionRecord;
  requestedUrl?: string;
}) {
  const message = useMemo(() => {
    if (!session && requestedUrl) {
      return {
        title: 'Ready for browser session',
        body: `Ask Construct to open ${requestedUrl}. The live preview will appear here.`,
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
        body: 'Open Details for downloads from this run.',
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
        body: 'Run history remains in Details.',
        icon: <ClockIcon className="w-10 h-10 text-amber-500 opacity-30" />,
      };
    }
    if (session.status === 'error') {
      return {
        title: 'Browser run failed',
        body: session.error || 'Check Details for run logs.',
        icon: <AlertTriangle className="w-10 h-10 text-red-400 opacity-40" />,
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
  streamUrl, runPhase, runErrorDetail, stepCount, pageUrl, isDead, reloadKey, onLoad, onError, onManualReconnect, goal, session,
  interactive, onRequestUnlock, onLock,
}: {
  streamUrl: string;
  runPhase: RunPhase;
  runErrorDetail: string;
  stepCount?: number;
  pageUrl?: string;
  isDead: boolean;
  reloadKey: number;
  onLoad: () => void;
  onError: () => void;
  onManualReconnect: () => void;
  goal?: string;
  session?: BrowserSessionRecord;
  interactive?: boolean;
  onRequestUnlock?: () => void;
  onLock?: () => void;
}) {
  const isLive = runPhase === 'live';
  const isComplete = runPhase === 'complete';
  const isErr = runPhase === 'error';

  const statusLabel = isErr
    ? 'Failed'
    : isComplete
      ? 'Finished'
      : reloadKey > 0 && !isDead
        ? 'Reconnecting'
        : 'Live';

  const subtitle = hostLabel(pageUrl) || goal || session?.task || '';
  const dotClass = isErr ? 'bg-red-400' : isComplete ? 'bg-emerald-400' : 'bg-amber-400';
  const stepBadge = typeof stepCount === 'number' ? `${stepCount} step${stepCount === 1 ? '' : 's'}` : null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-surface)]">
      {isErr && runErrorDetail && (
        <p className="shrink-0 px-3 py-1 text-[10px] text-red-400/90 border-b border-red-500/10 truncate bg-red-500/[0.06]">
          {runErrorDetail}
        </p>
      )}

      <div className="flex-1 w-full relative min-h-0">
        {isDead ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)] z-20 select-none">
            <div className="text-center text-[var(--color-text-muted)] max-w-sm px-6 p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <Monitor className="w-12 h-12 mx-auto mb-4 opacity-40 text-[var(--color-accent)]" />
              <p className="text-sm font-semibold text-[var(--color-text)]">Stream disconnected</p>
              <p className="text-xs text-[var(--color-text-subtle)] mt-1">Session ended.</p>
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
          <>
            <iframe
              key={`${streamUrl}:${reloadKey}`}
              src={streamUrl}
              className={`w-full h-full bg-white border-0 ${interactive ? '' : 'pointer-events-none'}`}
              title="Live browser preview"
              allow="clipboard-read; clipboard-write"
              onLoad={onLoad}
              onError={onError}
            />

            {!interactive && (
              <button
                type="button"
                onClick={onRequestUnlock}
                className="absolute inset-0 z-10 cursor-default bg-transparent"
                aria-label="Live browser is view only. Unlock to interact."
                title="Live browser is view only"
              />
            )}

            {/* Slim floating status HUD — bottom-left, avoids covering the
                remote browser's own top chrome. */}
            <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 select-none">
              <div className="inline-flex items-center gap-2 h-7 px-2.5 rounded-lg text-[11px] font-sans
                              glass-popover border border-white/15 shadow-md text-[var(--color-text-muted)]">
                {isLive && !isDead ? (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                  </span>
                ) : (
                  <span className={`relative inline-flex h-2 w-2 shrink-0 rounded-full ${dotClass} opacity-80`} />
                )}
                <span className="font-semibold uppercase tracking-wide text-[10px] text-[var(--color-text)]">{statusLabel}</span>
                {subtitle && (
                  <span className="max-w-[200px] truncate text-[var(--color-text-subtle)]">· {subtitle}</span>
                )}
                {stepBadge && (
                  <span className="text-[10px] font-mono tabular-nums opacity-70">· {stepBadge}</span>
                )}
              </div>
              {interactive ? (
                <button
                  type="button"
                  onClick={onLock}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-sans
                             glass-popover border border-amber-400/35 text-amber-300
                             hover:bg-amber-400/10 transition-colors shadow-md"
                  title="Return live browser to view-only mode"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Lock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRequestUnlock}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-sans
                             glass-popover border border-white/15 text-[var(--color-text-muted)]
                             hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors shadow-md"
                  title="Unlock to interact with the live browser"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  View only · Unlock
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
