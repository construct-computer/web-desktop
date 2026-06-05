import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, Globe, Monitor, StopCircle, Loader2, PlayCircle, AlertTriangle, Terminal } from 'lucide-react';
import { captureBrowserScreenshot, stopBrowserRun } from '@/services/api';
import type { BrowserSessionRecord } from '@/stores/agentStore';
import { useComputerStore } from '@/stores/agentStore';
import { BrowserDashboardPanel } from './BrowserDashboardPanel';

type RunPhase = 'live' | 'complete' | 'error';

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
  progressLabel = '',
  goal = '',
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
      runId={runId}
      pageUrl={pageUrl}
      isDead={isDead}
      reloadKey={reloadKey}
      onLoad={onLoad}
      onError={onError}
      onManualReconnect={onManualReconnect}
      progressLabel={progressLabel}
      goal={goal}
      session={session}
    />
  );
});

function BrowserPreviewEmpty({ session, requestedUrl }: { session?: BrowserSessionRecord; requestedUrl?: string }) {
  const message = useMemo(() => {
    if (!session && requestedUrl) {
      return {
        title: 'Ready for browser session',
        body: `Ask Construct to open ${requestedUrl}. Live preview, screenshots, and downloaded files will appear here.`,
        icon: <PlayCircle className="w-10 h-10 text-[var(--color-accent)] opacity-40 animate-pulse" />,
      };
    }
    if (!session) {
      return {
        title: 'Waiting for browser session',
        body: 'When Construct opens a remote browser session, the live video stream will automatically attach here.',
        icon: <Monitor className="w-10 h-10 text-[var(--color-text-subtle)] opacity-20" />,
      };
    }
    if (session.status === 'complete') {
      return {
        title: 'Session finished',
        body: 'The browser run has completed successfully. Reopen a recent run from the Runs panel if the URL is still active.',
        icon: <Check className="w-10 h-10 text-emerald-400 opacity-40" />,
      };
    }
    if (session.status === 'idle') {
      return {
        title: 'Session stopped',
        body: 'This browser session has been stopped by the user or agent coordinator.',
        icon: <StopCircle className="w-10 h-10 text-[var(--color-text-subtle)] opacity-30" />,
      };
    }
    if (session.status === 'expired') {
      return {
        title: 'Preview URL expired',
        body: 'Live browser streaming links are short-lived. Session logs, screenshots, and files remain in the dashboard.',
        icon: <ClockIcon className="w-10 h-10 text-amber-500 opacity-30" />,
      };
    }
    if (session.status === 'error') {
      return {
        title: 'Browser run failed',
        body: session.error || 'The live preview could not be established. Check the activity history log for details.',
        icon: <AlertTriangle className="w-10 h-10 text-red-400 opacity-40 animate-bounce" />,
      };
    }
    return {
      title: 'Attaching live stream',
      body: 'Construct has spun up a secure Cloud Chromium instance. Attaching live stream preview...',
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

// Simple internal helper since Clock isn't imported
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const BrowserStreamOverlay = memo(function BrowserStreamOverlay({
  streamUrl, runPhase, runErrorDetail, stepCount, runId, pageUrl, isDead, reloadKey, onLoad, onError, onManualReconnect, progressLabel, goal, session,
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
  progressLabel?: string;
  goal?: string;
  session?: BrowserSessionRecord;
}) {
  const isLive = runPhase === 'live';
  const isComplete = runPhase === 'complete';
  const isErr = runPhase === 'error';
  const [stopping, setStopping] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const browserSessions = useComputerStore((s) => s.browserState.browserSessions);
  const sessions = useMemo(
    () => Object.values(browserSessions).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)),
    [browserSessions]
  );

  const onStop = useCallback(async () => {
    if (!runId || stopping) return;
    setStopping(true);
    try { await stopBrowserRun(runId); } catch { /* polling will surface error */ }
  }, [runId, stopping]);

  const [shotState, setShotState] = useState<'idle' | 'capturing' | 'saved' | 'error'>('idle');
  const [shotMessage, setShotMessage] = useState<string>('');
  const onCapture = useCallback(async () => {
    if (!pageUrl || shotState === 'capturing') return;
    setShotState('capturing');
    setShotMessage('');
    const res = await captureBrowserScreenshot(pageUrl);
    if (res.success) {
      setShotState('saved');
      setShotMessage(res.data.path);
      setTimeout(() => setShotState('idle'), 2500);
    } else {
      setShotState('error');
      setShotMessage(res.error || 'Capture failed');
      setTimeout(() => setShotState('idle'), 3500);
    }
  }, [pageUrl, shotState]);

  const headerLabel = isErr
    ? `Run failed${runErrorDetail ? `: ${runErrorDetail.slice(0, 140)}${runErrorDetail.length > 140 ? '...' : ''}` : ''}`
    : isComplete
      ? 'Run finished. Preview frozen after session termination.'
      : reloadKey > 0 && !isDead
        ? `Reconnecting stream, attempt ${reloadKey}...`
        : 'Live streaming. Agent is controlling browser';

  const barClass = isErr
    ? 'bg-red-500/[0.08] text-red-400 border-red-500/20 shadow-sm'
    : isComplete
      ? 'bg-emerald-500/[0.08] text-emerald-400 border-emerald-500/20 shadow-sm'
      : 'bg-amber-500/[0.08] text-amber-400 border-amber-500/20 shadow-sm';

  const stepBadge = typeof stepCount === 'number' ? `${stepCount} step${stepCount === 1 ? '' : 's'}` : null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-surface)]">
      <div className={`shrink-0 flex items-center gap-2.5 px-4 py-2 text-[11px] font-sans border-b select-none ${barClass}`}>
        {isLive && !isDead ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-warning)] shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
          </span>
        ) : (
          <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
        )}
        <span className="min-w-0 leading-snug flex-1 truncate font-medium">{headerLabel}</span>
        {stepBadge && (
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono tabular-nums opacity-85 px-1.5 py-0.5 rounded bg-white/[0.04]">
            {stepBadge}
          </span>
        )}
        
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowConsole(!showConsole)}
            className={[
              'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-all duration-150',
              showConsole
                ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10 font-semibold'
                : 'border-white/20 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.04]',
            ].join(' ')}
            title="Toggle execution logs, screenshots and downloaded files"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Console</span>
          </button>
          {pageUrl && (
            <button
              type="button"
              onClick={onCapture}
              disabled={shotState === 'capturing'}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-current/25 hover:bg-current/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
              title={
                shotState === 'saved' ? `Saved to ${shotMessage}`
                : shotState === 'error' ? shotMessage
                : 'Save a screenshot of this page to your workspace'
              }
            >
              {shotState === 'saved' ? <Check className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
              {shotState === 'capturing' ? 'Saving...'
                : shotState === 'saved' ? 'Saved'
                : shotState === 'error' ? 'Error'
                : 'Screenshot'}
            </button>
          )}
          {isLive && runId && (
            <button
              type="button"
              onClick={onStop}
              disabled={stopping}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
              title="Stop this browser run"
            >
              <StopCircle className="w-3 h-3" />
              {stopping ? 'Stopping...' : 'Stop'}
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 w-full relative min-h-0 flex bg-[var(--color-surface)]">
        <div className="flex-1 h-full relative min-h-0">
          {isDead ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)] z-20 select-none">
              <div className="text-center text-[var(--color-text-muted)] max-w-sm px-6 p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-xl backdrop-blur-md">
                <Monitor className="w-12 h-12 mx-auto mb-4 opacity-40 text-[var(--color-accent)] animate-pulse" />
                <p className="text-sm font-semibold text-[var(--color-text)]">Live stream disconnected</p>
                <p className="text-xs mt-1.5 text-[var(--color-text-subtle)] leading-relaxed">
                  The agent is still executing commands on remote Cloud Chromium, but the preview channel closed.
                </p>
                <button
                  type="button"
                  onClick={onManualReconnect}
                  className="mt-5 px-4 py-1.5 text-[11px] rounded-lg border border-[var(--color-border)]
                             bg-white/5 hover:bg-white/10 text-[var(--color-text)] transition-all duration-150 shadow-sm"
                >
                  Reconnect Live Preview
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

          {/* Floating progress and goal indicator overlay */}
          {isLive && (progressLabel || goal) && (
            <div className="absolute bottom-4 left-4 z-20 max-w-[280px] rounded-xl border border-white/[0.08] bg-black/85 backdrop-blur-md p-3.5 shadow-2xl flex flex-col gap-1.5 animate-[fadeIn_0.35s_ease-out] select-none text-left">
              {goal && (
                <div className="text-[9px] text-[var(--color-text-subtle)] font-bold uppercase tracking-wider font-sans">
                  Active Goal
                </div>
              )}
              {goal && (
                <div className="text-[11px] text-[var(--color-text-muted)] font-medium leading-relaxed line-clamp-3 font-sans">
                  {goal}
                </div>
              )}
              {progressLabel && (
                <div className="text-[9px] text-[var(--color-accent)] font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1.5 font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
                  <span>Agent Activity</span>
                </div>
              )}
              {progressLabel && (
                <div className="text-[11px] text-[var(--color-text)] font-sans leading-relaxed">
                  {progressLabel}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Console Details Panel */}
        {showConsole && (
          <BrowserDashboardPanel
            sessions={sessions}
            activeSessionId={session?.id || null}
            onClose={() => setShowConsole(false)}
          />
        )}
      </div>
    </div>
  );
});

