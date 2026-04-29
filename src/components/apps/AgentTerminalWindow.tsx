import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import {
  getRunTranscript,
  useTerminalStore,
  type TerminalChunk,
  type TerminalRun,
} from '@/stores/terminalStore';
import { useAgentStore } from '@/stores/agentStore';

const TERMINAL_THEME = {
  background: 'transparent',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: '#000000',
  selectionBackground: '#3f3f46',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e4e4e7',
  brightBlack: '#71717a',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
};

const A = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  white: '\x1b[37m',
};

interface CachedTerminal {
  xterm: XTerm;
  fit: FitAddon;
  element: HTMLDivElement;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  renderedRunId: string | null;
  renderedChunkCount: number;
  renderedExitRunId: string | null;
  foldNoticeRunId: string | null;
  foldedBytes: number;
}

interface AgentTerminalWindowProps {
  config: WindowConfig;
}

const terminalCache = new Map<string, CachedTerminal>();

function ts(value = Date.now()): string {
  const now = new Date(value);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${A.gray}${h}:${m}:${s}${A.reset}`;
}

function writeWelcome(xterm: XTerm, terminalId: string) {
  xterm.writeln('');
  const lane = terminalId !== 'main' ? `  ${A.gray}${terminalId}${A.reset}` : '';
  xterm.writeln(`  ${A.cyan}${A.bold}Ready${A.reset}${lane}`);
  xterm.writeln('');
  xterm.writeln(`  ${A.gray}Read-only sandbox. Agent commands stream here automatically.${A.reset}`);
  xterm.writeln('');
}

function getOrCreateTerminal(terminalId: string): CachedTerminal {
  const existing = terminalCache.get(terminalId);
  if (existing) {
    if (existing.disposeTimer) {
      clearTimeout(existing.disposeTimer);
      existing.disposeTimer = null;
    }
    return existing;
  }

  const xterm = new XTerm({
    theme: TERMINAL_THEME,
    allowTransparency: true,
    fontFamily: 'var(--font-mono)',
    fontSize: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 15 : 13,
    lineHeight: 1.32,
    cursorBlink: false,
    cursorStyle: 'block',
    scrollback: 10000,
    convertEol: true,
    disableStdin: true,
  });

  const fit = new FitAddon();
  xterm.loadAddon(fit);

  const element = document.createElement('div');
  element.style.width = '100%';
  element.style.height = '100%';
  xterm.open(element);
  writeWelcome(xterm, terminalId);

  const entry: CachedTerminal = {
    xterm,
    fit,
    element,
    disposeTimer: null,
    renderedRunId: null,
    renderedChunkCount: 0,
    renderedExitRunId: null,
    foldNoticeRunId: null,
    foldedBytes: 0,
  };
  terminalCache.set(terminalId, entry);
  return entry;
}

function scheduleDispose(terminalId: string, delayMs = 5_000) {
  const entry = terminalCache.get(terminalId);
  if (!entry) return;
  if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
  entry.disposeTimer = setTimeout(() => {
    entry.xterm.dispose();
    terminalCache.delete(terminalId);
  }, delayMs);
}

function formatDuration(ms?: number) {
  if (!ms && ms !== 0) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClock(timestamp?: number) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function writeChunk(xterm: XTerm, chunk: TerminalChunk) {
  if (chunk.stream === 'stderr') {
    xterm.write(`${A.red}${chunk.data}${A.reset}`);
  } else {
    xterm.write(chunk.data);
  }
}

function writeExit(xterm: XTerm, run: TerminalRun, foldedBytes = 0) {
  if (foldedBytes > 0) {
    xterm.writeln(`${A.gray}[folded ${foldedBytes.toLocaleString()} bytes of output; transcript was captured]${A.reset}`);
  }
  if (typeof run.exitCode !== 'number') return;
  const duration = run.durationMs !== undefined ? ` in ${formatDuration(run.durationMs)}` : '';
  if (run.exitCode === 0) {
    xterm.writeln(`${A.gray}-- ${A.green}done${A.reset}${A.gray}${duration}${A.reset}`);
  } else {
    xterm.writeln(`${A.gray}-- ${A.red}exit ${run.exitCode}${A.reset}${A.gray}${duration}${A.reset}`);
  }
  xterm.writeln('');
}

function renderRun(xterm: XTerm, run: TerminalRun | undefined, terminalId: string) {
  xterm.clear();
  writeWelcome(xterm, terminalId);
  if (!run) return;

  xterm.writeln(`${ts(run.startedAt)}  ${A.green}${A.bold}>${A.reset} ${A.white}${run.command}${A.reset}`);
  if (run.chunks.length > 0) {
    for (const chunk of run.chunks) writeChunk(xterm, chunk);
  } else if (run.preview) {
    xterm.writeln(`${A.gray}[showing persisted preview; download full log for complete output]${A.reset}`);
    xterm.write(run.preview);
  }
  writeExit(xterm, run);
}

function runMatches(run: TerminalRun, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return run.command.toLowerCase().includes(q)
    || run.outputText.toLowerCase().includes(q)
    || (run.preview || '').toLowerCase().includes(q);
}

function statusClass(run?: TerminalRun) {
  if (!run) return 'text-white/35';
  if (run.status === 'running') return 'text-green-300';
  if (run.status === 'failed') return 'text-red-300';
  return 'text-zinc-300';
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AgentTerminalWindow({ config }: AgentTerminalWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalId = (config.metadata?.terminalId as string) || 'main';
  const sessions = useTerminalStore((s) => s.sessions);
  const allRuns = useTerminalStore((s) => s.runs);
  const selectRun = useTerminalStore((s) => s.selectRun);
  const clearTerminal = useTerminalStore((s) => s.clearTerminal);
  const activeSessionKey = useAgentStore((s) => s.activeSessionKey);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [foldOutput, setFoldOutput] = useState(false);
  const autoscrollRef = useRef(autoscroll);
  const foldOutputRef = useRef(foldOutput);

  useEffect(() => { autoscrollRef.current = autoscroll; }, [autoscroll]);
  useEffect(() => { foldOutputRef.current = foldOutput; }, [foldOutput]);

  const session = sessions[terminalId];
  const runs = useMemo(() => {
    const ids = session?.runIds || [];
    return ids
      .map((id) => allRuns[id])
      .filter((run): run is TerminalRun => Boolean(run))
      .filter((run) => !run.sessionKey || run.sessionKey === activeSessionKey)
      .sort((a, b) => a.startedAt - b.startedAt);
  }, [activeSessionKey, allRuns, session?.runIds]);

  const selectedRunId = session?.selectedRunId || session?.activeRunId || runs[runs.length - 1]?.id;
  const selectedRunCandidate = selectedRunId ? allRuns[selectedRunId] : undefined;
  const selectedRun = selectedRunCandidate && (!selectedRunCandidate.sessionKey || selectedRunCandidate.sessionKey === activeSessionKey)
    ? selectedRunCandidate
    : runs[runs.length - 1];
  const filteredRuns = useMemo(
    () => runs.filter((run) => runMatches(run, searchQuery)),
    [runs, searchQuery],
  );
  const running = runs.some((run) => run.status === 'running');
  const failures = runs.filter((run) => run.status === 'failed').length;

  const handleClear = useCallback(() => {
    clearTerminal(terminalId);
    const cached = terminalCache.get(terminalId);
    if (cached) {
      cached.renderedRunId = null;
      cached.renderedChunkCount = 0;
      cached.renderedExitRunId = null;
      cached.foldNoticeRunId = null;
      cached.foldedBytes = 0;
      cached.xterm.clear();
      writeWelcome(cached.xterm, terminalId);
    }
  }, [clearTerminal, terminalId]);

  const handleCopy = useCallback(() => {
    if (!selectedRun) return;
    navigator.clipboard?.writeText(getRunTranscript(selectedRun));
  }, [selectedRun]);

  const handleSaveVisible = useCallback(() => {
    if (!selectedRun) return;
    downloadText(`agent-terminal-${selectedRun.toolCallId || selectedRun.id}.log`, getRunTranscript(selectedRun));
  }, [selectedRun]);

  const handleDownloadFull = useCallback(async () => {
    if (!selectedRun?.toolCallId) {
      handleSaveVisible();
      return;
    }
    const result = await api.getTerminalRunOutput(selectedRun.toolCallId);
    if (result.success && result.data?.output) {
      downloadText(`agent-terminal-${selectedRun.toolCallId}-full.log`, result.data.output);
    } else {
      handleSaveVisible();
    }
  }, [handleSaveVisible, selectedRun]);

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
    const cached = terminalCache.get(terminalId);
    if (!cached) return;

    if (!selectedRun) {
      if (cached.renderedRunId !== null) {
        renderRun(cached.xterm, undefined, terminalId);
        cached.renderedRunId = null;
        cached.renderedChunkCount = 0;
        cached.renderedExitRunId = null;
        cached.foldNoticeRunId = null;
        cached.foldedBytes = 0;
      }
      return;
    }

    if (cached.renderedRunId !== selectedRun.id) {
      renderRun(cached.xterm, selectedRun, terminalId);
      cached.renderedRunId = selectedRun?.id || null;
      cached.renderedChunkCount = selectedRun?.chunks.length || 0;
      cached.renderedExitRunId = selectedRun?.exitCode !== undefined ? selectedRun.id : null;
      cached.foldNoticeRunId = null;
      cached.foldedBytes = 0;
      if (autoscrollRef.current) cached.xterm.scrollToBottom();
      return;
    }

    const nextChunks = selectedRun.chunks.slice(cached.renderedChunkCount);
    if (nextChunks.length > 0) {
      if (foldOutputRef.current) {
        cached.foldedBytes += nextChunks.reduce((total, chunk) => total + chunk.data.length, 0);
        if (cached.foldNoticeRunId !== selectedRun.id) {
          cached.xterm.writeln(`${A.gray}[output folded; transcript is still being captured]${A.reset}`);
          cached.foldNoticeRunId = selectedRun.id;
        }
      } else {
        for (const chunk of nextChunks) writeChunk(cached.xterm, chunk);
      }
      cached.renderedChunkCount = selectedRun.chunks.length;
    }

    if (selectedRun.exitCode !== undefined && cached.renderedExitRunId !== selectedRun.id) {
      writeExit(cached.xterm, selectedRun, cached.foldedBytes);
      cached.renderedExitRunId = selectedRun.id;
      cached.foldedBytes = 0;
    }

    if (autoscrollRef.current) cached.xterm.scrollToBottom();
  }, [selectedRun, selectedRun?.chunks.length, selectedRun?.exitCode, terminalId]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black text-white/90">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px)] bg-size-[auto,100%_26px]" />
      <div className="relative z-30 flex shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-zinc-950/80 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <span className={`h-2 w-2 rounded-full ${running ? 'bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]' : 'bg-zinc-600'}`} />
          {terminalId !== 'main' && (
            <span className="rounded border border-white/10 bg-white/4 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
              {terminalId}
            </span>
          )}
          <span className="hidden truncate font-mono text-white/35 sm:inline">
            {selectedRun?.command || 'waiting for agent command'}
          </span>
        </div>

        <div className="relative flex min-w-0 items-center gap-1 text-[10px]">
          <span className="hidden font-mono text-white/30 sm:inline">
            {runs.length} cmd{runs.length === 1 ? '' : 's'}
          </span>
          {failures > 0 && <span className="font-mono text-red-300/80">{failures} failed</span>}
          <button
            onClick={() => {
              setHistoryOpen((v) => !v);
              setMoreOpen(false);
            }}
            className={`rounded px-2 py-1 transition-colors ${historyOpen ? 'bg-white/10 text-white/80' : 'text-white/45 hover:bg-white/10 hover:text-white/80'}`}
          >
            Logs
          </button>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`rounded px-2 py-1 font-semibold tracking-widest transition-colors ${moreOpen ? 'bg-white/10 text-white/80' : 'text-white/45 hover:bg-white/10 hover:text-white/80'}`}
            title="Terminal actions"
          >
            ...
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-7 z-50 w-44 rounded-lg border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur">
              <button
                onClick={() => { setInspectorOpen((v) => !v); setMoreOpen(false); }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-white/65 hover:bg-white/10 hover:text-white/90"
              >
                <span>Inspector</span>
                <span className="text-white/30">{inspectorOpen ? 'on' : 'off'}</span>
              </button>
              <button
                onClick={() => { setAutoscroll((v) => !v); setMoreOpen(false); }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-white/65 hover:bg-white/10 hover:text-white/90"
              >
                <span>Follow output</span>
                <span className={autoscroll ? 'text-green-300/80' : 'text-white/30'}>{autoscroll ? 'on' : 'off'}</span>
              </button>
              <button
                onClick={() => { setFoldOutput((v) => !v); setMoreOpen(false); }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-white/65 hover:bg-white/10 hover:text-white/90"
              >
                <span>Fold output</span>
                <span className={foldOutput ? 'text-yellow-300/80' : 'text-white/30'}>{foldOutput ? 'on' : 'off'}</span>
              </button>
              <div className="my-1 h-px bg-white/10" />
              <button onClick={() => { handleCopy(); setMoreOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-white/65 hover:bg-white/10 hover:text-white/90">
                Copy transcript
              </button>
              <button onClick={() => { handleSaveVisible(); setMoreOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-white/65 hover:bg-white/10 hover:text-white/90">
                Save visible log
              </button>
              <button onClick={() => { handleDownloadFull(); setMoreOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-white/65 hover:bg-white/10 hover:text-white/90">
                Download full log
              </button>
              <div className="my-1 h-px bg-white/10" />
              <button onClick={() => { handleClear(); setMoreOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-red-200/75 hover:bg-red-500/15 hover:text-red-100">
                Clear terminal
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div ref={containerRef} className="h-full min-h-0 px-2 py-2" />
        </div>

        {historyOpen && (
          <aside className="hidden w-72 shrink-0 border-l border-white/8 bg-zinc-950/80 backdrop-blur md:flex md:flex-col">
            <div className="border-b border-white/8 p-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search commands and output"
                className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none placeholder:text-white/25 focus:border-cyan-300/40"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-white/30">
                <span>{filteredRuns.length} shown</span>
                <span>{formatBytes(runs.reduce((total, run) => total + run.outputBytes, 0))}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredRuns.length === 0 ? (
                <div className="rounded border border-dashed border-white/10 p-3 text-[11px] text-white/35">
                  No terminal commands match this filter yet.
                </div>
              ) : filteredRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => selectRun(terminalId, run.id)}
                  className={`mb-1.5 w-full rounded border p-2 text-left transition-colors ${
                    selectedRun?.id === run.id
                      ? 'border-cyan-300/30 bg-cyan-300/10'
                      : 'border-white/6 bg-white/2.5 hover:border-white/15 hover:bg-white/5'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${statusClass(run)}`}>
                      {run.status}
                    </span>
                    <span className="font-mono text-[10px] text-white/30">{formatClock(run.startedAt)}</span>
                  </div>
                  <div className="line-clamp-2 font-mono text-[11px] leading-snug text-white/75">
                    $ {run.command}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-white/30">
                    <span>{run.exitCode !== undefined ? `exit ${run.exitCode}` : 'running'}</span>
                    <span>{formatDuration(run.durationMs)} / {formatBytes(run.outputBytes)}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {inspectorOpen && selectedRun && (
        <div className="relative z-20 border-t border-white/8 bg-zinc-950/95 px-3 py-2 font-mono text-[10px] text-white/45">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <span>tool: {selectedRun.toolCallId || 'n/a'}</span>
            <span>session: {selectedRun.sessionKey || 'n/a'}</span>
            <span>sandbox: {selectedRun.sandboxInstanceId || 'active user sandbox'}</span>
            <span>subagent: {selectedRun.subagentId || 'main'}</span>
            <span>duration: {formatDuration(selectedRun.durationMs)}</span>
            <span>stdout: {formatBytes(selectedRun.stdoutBytes)}</span>
            <span>stderr: {formatBytes(selectedRun.stderrBytes)}</span>
            <span>log: {selectedRun.outputRef ? 'persisted' : 'live only'}</span>
            <button onClick={handleDownloadFull} className="w-fit rounded border border-white/10 px-2 py-0.5 text-cyan-200/80 hover:bg-white/10">
              Download full log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
