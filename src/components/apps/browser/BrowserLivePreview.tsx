import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, Globe, Monitor, StopCircle } from 'lucide-react';
import { captureBrowserScreenshot, stopBrowserRun } from '@/services/api';
import type { BrowserSessionRecord } from '@/stores/agentStore';

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
}) {
  if (!streamUrl) {
    return <BrowserPreviewEmpty session={session} />;
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
    />
  );
});

function BrowserPreviewEmpty({ session }: { session?: BrowserSessionRecord }) {
  const message = useMemo(() => {
    if (!session) {
      return {
        title: 'Waiting for a Browser Use session',
        body: 'When the agent opens a remote browser, the live preview will appear here.',
      };
    }
    if (session.status === 'complete') {
      return {
        title: 'Session finished',
        body: 'The run has completed. Reopen a recent run from the Runs tab if its live URL is still available.',
      };
    }
    if (session.status === 'idle') {
      return {
        title: 'Session stopped',
        body: 'This browser session is no longer running.',
      };
    }
    if (session.status === 'expired') {
      return {
        title: 'Preview expired',
        body: 'Browser Use live URLs are intentionally short-lived. Results, screenshots, and files remain available in the dashboard.',
      };
    }
    if (session.status === 'error') {
      return {
        title: 'Browser run failed',
        body: session.error || 'The live preview could not be opened. Check the activity log for details.',
      };
    }
    return {
      title: 'Waiting for live URL',
      body: 'The agent has started a remote browser. The Browser Use preview will attach as soon as the live URL arrives.',
    };
  }, [session]);

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-[var(--color-text-subtle)] max-w-sm text-center px-4">
      <Globe className="w-10 h-10 opacity-20" />
      <p className="text-sm text-[var(--color-text-muted)]">{message.title}</p>
      <p className="text-xs opacity-70 leading-relaxed">{message.body}</p>
    </div>
  );
}

const BrowserStreamOverlay = memo(function BrowserStreamOverlay({
  streamUrl, runPhase, runErrorDetail, stepCount, runId, pageUrl, isDead, reloadKey, onLoad, onError, onManualReconnect,
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
}) {
  const isLive = runPhase === 'live';
  const isComplete = runPhase === 'complete';
  const isErr = runPhase === 'error';
  const [stopping, setStopping] = useState(false);
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
      ? 'Run finished. Preview may freeze after Browser Use ends the session.'
      : reloadKey > 0 && !isDead
        ? `Live preview reconnecting, attempt ${reloadKey}`
        : 'Live preview. Agent is controlling the browser';

  const barClass = isErr
    ? 'bg-[var(--color-error)]/10 text-[var(--color-error)] border-[var(--color-error)]/25'
    : isComplete
      ? 'bg-[var(--color-success-muted)] text-[var(--color-success)] border-[var(--color-success)]/20'
      : 'bg-[var(--color-warning-muted)] text-[var(--color-warning)] border-[var(--color-border)]';

  const stepBadge = typeof stepCount === 'number' ? `${stepCount} step${stepCount === 1 ? '' : 's'}` : null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <div className={`shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs border-b ${barClass}`}>
        {isLive && !isDead ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-warning)]" />
          </span>
        ) : (
          <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
        )}
        <span className="min-w-0 leading-snug flex-1 truncate">{headerLabel}</span>
        {stepBadge && (
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] tabular-nums opacity-80">
            <span>{stepBadge}</span>
          </span>
        )}
        {pageUrl && (
          <button
            type="button"
            onClick={onCapture}
            disabled={shotState === 'capturing'}
            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-current/30 hover:bg-current/10 disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-current/30 hover:bg-current/10 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Stop this browser run"
          >
            <StopCircle className="w-3 h-3" />
            {stopping ? 'Stopping...' : 'Stop'}
          </button>
        )}
      </div>
      {isDead ? (
        <div className="flex-1 flex items-center justify-center bg-[var(--color-surface)]">
          <div className="text-center text-[var(--color-text-muted)]">
            <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Live preview disconnected</p>
            <p className="text-xs mt-1 text-[var(--color-text-subtle)]">
              The browser may still be working in the background.
            </p>
            <button
              type="button"
              onClick={onManualReconnect}
              className="mt-4 px-3 py-1.5 text-xs rounded border border-[var(--color-border)]
                         bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface)]
                         text-[var(--color-text)] transition-colors"
            >
              Reconnect live preview
            </button>
          </div>
        </div>
      ) : (
        <iframe
          key={`${streamUrl}:${reloadKey}`}
          src={streamUrl}
          className="flex-1 w-full bg-white border-0"
          title="Browser Use live preview"
          allow="clipboard-read; clipboard-write"
          onLoad={onLoad}
          onError={onError}
        />
      )}
    </div>
  );
});
