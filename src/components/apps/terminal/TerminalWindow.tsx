import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  List,
  Pause,
  Play,
  Trash2,
  UnfoldVertical,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import {
  getRunTranscript,
  getSessionTranscript,
  useTerminalStore,
  type TerminalRun,
} from '@/stores/terminalStore';
import { useComputerStore } from '@/stores/agentStore';
import { InfoHint } from '@/components/ui';
import {
  downloadText,
  formatBytes,
  formatDuration,
} from './terminalTheme';
import {
  getCachedTerminal,
  getOrCreateTerminal,
  resetTranscriptState,
  scheduleDispose,
} from './terminalXtermCache';
import { useTerminalTranscript } from './useTerminalTranscript';
import { useTerminalHydration } from './useTerminalHydration';
import { TerminalRunIndex, filterRunsByQuery } from './TerminalRunIndex';

interface TerminalWindowProps {
  config: WindowConfig;
}

export function TerminalWindow({ config }: TerminalWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalId = (config.metadata?.terminalId as string) || 'main';
  const sessions = useTerminalStore((s) => s.sessions);
  const allRuns = useTerminalStore((s) => s.runs);
  const scrollToRun = useTerminalStore((s) => s.scrollToRun);
  const clearScrollTarget = useTerminalStore((s) => s.clearScrollTarget);
  const clearTerminal = useTerminalStore((s) => s.clearTerminal);
  const activeSessionKey = useComputerStore((s) => s.activeSessionKey);

  const [indexOpen, setIndexOpen] = useState(false);
  const [mobileIndexOpen, setMobileIndexOpen] = useState(false);
  const [footerOpen, setFooterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [foldOutput, setFoldOutput] = useState(false);

  const session = sessions[terminalId];
  const scrollTargetRunId = session?.scrollTargetRunId;

  const runs = useMemo(() => {
    const ids = session?.runIds || [];
    return ids
      .map((id) => allRuns[id])
      .filter((run): run is TerminalRun => Boolean(run))
      .filter((run) => !run.sessionKey || run.sessionKey === activeSessionKey)
      .sort((a, b) => a.startedAt - b.startedAt);
  }, [activeSessionKey, allRuns, session?.runIds]);

  const focusedRunId = session?.selectedRunId || session?.activeRunId || runs[runs.length - 1]?.id;
  const focusedRun = focusedRunId ? allRuns[focusedRunId] : undefined;
  const focusedRunResolved = focusedRun && (!focusedRun.sessionKey || focusedRun.sessionKey === activeSessionKey)
    ? focusedRun
    : runs[runs.length - 1];

  const filteredRuns = useMemo(
    () => filterRunsByQuery(runs, searchQuery),
    [runs, searchQuery],
  );

  const runningRun = runs.find((run) => run.status === 'running');
  const running = Boolean(runningRun);
  const failures = runs.filter((run) => run.status === 'failed').length;

  const { requestHydration } = useTerminalHydration(runs, activeSessionKey, terminalId);

  const handleScrollTargetHandled = useCallback(() => {
    clearScrollTarget(terminalId);
  }, [clearScrollTarget, terminalId]);

  useTerminalTranscript({
    terminalId,
    runs,
    scrollTargetRunId,
    autoscroll,
    foldOutput,
    onScrollTargetHandled: handleScrollTargetHandled,
  });

  const handleSelectRun = useCallback((runId: string) => {
    const run = allRuns[runId];
    if (run) requestHydration(run);
    scrollToRun(terminalId, runId);
    setMobileIndexOpen(false);
  }, [allRuns, requestHydration, scrollToRun, terminalId]);

  const handleClear = useCallback(() => {
    clearTerminal(terminalId);
    const cached = getCachedTerminal(terminalId);
    if (cached) resetTranscriptState(cached, terminalId);
  }, [clearTerminal, terminalId]);

  const handleCopySession = useCallback(() => {
    navigator.clipboard?.writeText(getSessionTranscript(runs));
  }, [runs]);

  const handleCopyRun = useCallback(() => {
    if (!focusedRunResolved) return;
    navigator.clipboard?.writeText(getRunTranscript(focusedRunResolved));
  }, [focusedRunResolved]);

  const handleDownloadRun = useCallback(async () => {
    if (!focusedRunResolved) return;
    if (focusedRunResolved.toolCallId) {
      const result = await api.getTerminalRunOutput(focusedRunResolved.toolCallId);
      if (result.success && result.data?.output) {
        downloadText(`terminal-${focusedRunResolved.toolCallId}.log`, result.data.output);
        return;
      }
    }
    downloadText(
      `terminal-${focusedRunResolved.toolCallId || focusedRunResolved.id}.log`,
      getRunTranscript(focusedRunResolved),
    );
  }, [focusedRunResolved]);

  useEffect(() => {
    if (!containerRef.current) return;

    const cached = getOrCreateTerminal(terminalId);
    containerRef.current.appendChild(cached.element);
    requestAnimationFrame(() => cached.fit.fit());

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => cached.fit.fit());
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (cached.element.parentNode) {
        cached.element.parentNode.removeChild(cached.element);
      }
      scheduleDispose(terminalId);
    };
  }, [terminalId]);

  useEffect(() => {
    if (focusedRunResolved) requestHydration(focusedRunResolved);
  }, [focusedRunResolved, requestHydration]);

  const indexPanel = (
    <TerminalRunIndex
      runs={runs}
      filteredRuns={filteredRuns}
      focusedRunId={focusedRunResolved?.id}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelectRun={handleSelectRun}
      className="h-full w-72 shrink-0 border-l bg-[var(--color-bg-elevated)]"
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden surface-app text-[var(--color-text)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] surface-toolbar px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              running ? 'animate-pulse bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-[var(--color-text-subtle)]'
            }`}
            title={running ? 'Command running' : 'Idle'}
          />
          {terminalId !== 'main' && (
            <span className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              {terminalId}
            </span>
          )}
          <span className="hidden truncate font-mono text-[var(--color-text-muted)] sm:inline">
            {runningRun?.command || focusedRunResolved?.command || 'Waiting for command'}
          </span>
          <InfoHint side="bottom" className="text-[var(--color-text-subtle)]">
            Read-only transcript of shell commands Construct runs in your workspace.
          </InfoHint>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 text-[10px]">
          <span className="mr-1 hidden font-mono text-[var(--color-text-subtle)] sm:inline">
            {runs.length} cmd{runs.length === 1 ? '' : 's'}
          </span>
          {failures > 0 && (
            <span className="mr-1 font-mono text-red-400">{failures} failed</span>
          )}

          <button
            type="button"
            onClick={() => setAutoscroll((v) => !v)}
            className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
              autoscroll
                ? 'text-green-600 dark:text-green-400'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]'
            }`}
            title={autoscroll ? 'Following output' : 'Paused — click to follow'}
          >
            {autoscroll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span className="hidden sm:inline">Follow</span>
          </button>

          <button
            type="button"
            onClick={() => setFoldOutput((v) => !v)}
            className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
              foldOutput
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]'
            }`}
            title="Fold verbose output in the view"
          >
            <UnfoldVertical className="h-3 w-3" />
            <span className="hidden sm:inline">Fold</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIndexOpen((v) => !v);
              setMobileIndexOpen(false);
            }}
            className={`hidden items-center gap-1 rounded px-2 py-1 transition-colors md:flex ${
              indexOpen
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]'
            }`}
            title="Command index"
          >
            <List className="h-3 w-3" />
            <span>Index</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileIndexOpen((v) => !v)}
            className={`flex items-center gap-1 rounded px-2 py-1 transition-colors md:hidden ${
              mobileIndexOpen
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            <List className="h-3 w-3" />
          </button>

          <button
            type="button"
            onClick={handleCopySession}
            className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text)]"
            title="Copy session transcript"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDownloadRun}
            disabled={!focusedRunResolved}
            className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text)] disabled:opacity-40"
            title="Download focused command log"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="rounded p-1.5 text-red-400/80 hover:bg-red-500/10 hover:text-red-400"
            title="Clear view"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 min-w-0 flex-1 bg-[#0a0a0a]">
            <div ref={containerRef} className="h-full min-h-0 px-2 py-2" />
          </div>
          {indexOpen && indexPanel}
        </div>

        {mobileIndexOpen && (
          <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[55%] flex-col rounded-t-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl md:hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
              <span className="text-[12px] font-medium">Commands</span>
              <button
                type="button"
                onClick={() => setMobileIndexOpen(false)}
                className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <TerminalRunIndex
              runs={runs}
              filteredRuns={filteredRuns}
              focusedRunId={focusedRunResolved?.id}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectRun={handleSelectRun}
              className="min-h-0 flex-1 border-0"
            />
          </div>
        )}
      </div>

      {focusedRunResolved && (
        <div className="shrink-0 border-t border-[var(--color-border)] surface-toolbar">
          <button
            type="button"
            onClick={() => setFooterOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <span className="font-mono truncate">
              {focusedRunResolved.status}
              {' · '}
              exit {focusedRunResolved.exitCode ?? '—'}
              {' · '}
              {formatDuration(focusedRunResolved.durationMs)}
              {' · '}
              {formatBytes(focusedRunResolved.outputBytes)}
            </span>
            {footerOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronUp className="h-3 w-3 shrink-0" />}
          </button>
          {footerOpen && (
            <div className="grid gap-2 border-t border-[var(--color-border)] px-3 py-2 font-mono text-[10px] text-[var(--color-text-subtle)] sm:grid-cols-2 lg:grid-cols-4">
              <span>action: {focusedRunResolved.toolCallId || 'n/a'}</span>
              <span>session: {focusedRunResolved.sessionKey || 'n/a'}</span>
              <span>workspace: {focusedRunResolved.sandboxInstanceId || 'active'}</span>
              <span>log: {focusedRunResolved.outputRef ? 'persisted' : 'live'}</span>
              <div className="flex gap-2 sm:col-span-2">
                <button
                  type="button"
                  onClick={handleCopyRun}
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 hover:bg-[var(--color-bg-elevated)]"
                >
                  Copy command
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRun}
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-accent)] hover:bg-[var(--color-bg-elevated)]"
                >
                  Download log
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
