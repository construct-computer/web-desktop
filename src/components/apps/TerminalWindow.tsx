import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { WindowConfig } from '@/types';

export { AgentTerminalWindow as TerminalWindow } from './AgentTerminalWindow';

// ── Theme ─────────────────────────────────────────────────────────

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

// ── ANSI helpers ──────────────────────────────────────────────────

const A = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function ts(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${A.gray}${h}:${m}:${s}${A.reset}`;
}

// ── Persistent terminal cache ─────────────────────────────────────

interface CachedTerminal {
  xterm: XTerm;
  fit: FitAddon;
  element: HTMLDivElement;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  transcript: string[];
  currentCommand: string | null;
  commandStartedAt: number | null;
  foldedBytes: number;
  foldNoticeWritten: boolean;
}

const terminalCache = new Map<string, CachedTerminal>();

function writeWelcome(xterm: XTerm) {
  xterm.writeln('');
  xterm.writeln(`  ${A.cyan}${A.bold}construct.computer${A.reset}  ${A.gray}sandbox terminal${A.reset}`);
  xterm.writeln('');
  xterm.writeln(`  ${A.gray}Agent commands and output stream here in real-time.${A.reset}`);
  xterm.writeln(`  ${A.gray}This terminal is read-only \u2014 the agent controls the sandbox.${A.reset}`);
  xterm.writeln('');
  xterm.writeln(`  ${A.gray}\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${A.reset}`);
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
    fontFamily: '"IBM Plex Mono", "Fira Code", "Cascadia Code", monospace',
    // Bump font on mobile so output is legible without pinch-zoom.
    fontSize: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 15 : 13,
    lineHeight: 1.3,
    cursorBlink: true,
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

  writeWelcome(xterm);

  const entry: CachedTerminal = {
    xterm,
    fit,
    element,
    disposeTimer: null,
    transcript: [],
    currentCommand: null,
    commandStartedAt: null,
    foldedBytes: 0,
    foldNoticeWritten: false,
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

// ── Component ─────────────────────────────────────────────────────

interface TerminalWindowProps {
  config: WindowConfig;
}

interface TerminalEventDetail {
  command?: string;
  data?: string;
  stream?: 'stdout' | 'stderr';
  exitCode?: number;
  terminalId?: string;
  toolCallId?: string;
  sessionKey?: string;
  subagentId?: string;
}

function normalizeDetail(detail: unknown, fallbackKey: 'command' | 'data'): TerminalEventDetail {
  if (typeof detail === 'string') return { [fallbackKey]: detail };
  if (detail && typeof detail === 'object') return detail as TerminalEventDetail;
  return {};
}

function matchesTerminal(detail: TerminalEventDetail, terminalId: string) {
  return !detail.terminalId || detail.terminalId === terminalId;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function LegacyTerminalWindow({ config }: TerminalWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalId = (config.metadata?.terminalId as string) || 'main';
  const [commandCount, setCommandCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [runningCommand, setRunningCommand] = useState('');
  const [lastExit, setLastExit] = useState<{ code: number; duration?: string } | null>(null);
  const [transcriptSeq, setTranscriptSeq] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [foldOutput, setFoldOutput] = useState(false);
  const autoscrollRef = useRef(autoscroll);
  const foldOutputRef = useRef(foldOutput);

  useEffect(() => { autoscrollRef.current = autoscroll; }, [autoscroll]);
  useEffect(() => { foldOutputRef.current = foldOutput; }, [foldOutput]);

  const handleClear = useCallback(() => {
    const cached = terminalCache.get(terminalId);
    if (!cached) return;
    cached.xterm.clear();
    cached.transcript = [];
    cached.foldedBytes = 0;
    cached.foldNoticeWritten = false;
    writeWelcome(cached.xterm);
    setCommandCount(0);
    setLastExit(null);
    setRunningCommand('');
    setTranscriptSeq((seq) => seq + 1);
  }, [terminalId]);

  const handleCopyTranscript = useCallback(() => {
    const cached = terminalCache.get(terminalId);
    if (!cached) return;
    navigator.clipboard?.writeText(cached.transcript.join(''));
  }, [terminalId]);

  const handleSaveTranscript = useCallback(() => {
    const cached = terminalCache.get(terminalId);
    if (!cached) return;
    const blob = new Blob([cached.transcript.join('')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `construct-terminal-${terminalId}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [terminalId]);

  const matchCount = useMemo(() => {
    void transcriptSeq;
    const cached = terminalCache.get(terminalId);
    if (!cached || !searchQuery.trim()) {
      return 0;
    }
    const haystack = cached.transcript.join('').toLowerCase();
    const needle = searchQuery.toLowerCase();
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      count += 1;
      index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
    }
    return count;
  }, [terminalId, searchQuery, transcriptSeq]);

  // ── 1. Attach xterm to DOM ──────────────────────────────────────
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

  // ── 2. Listen to backend events directly ────────────────────────
  useEffect(() => {
    const cached = terminalCache.get(terminalId);
    if (!cached) return;

    // Command started — show prompt
    const onCommand = (e: Event) => {
      const detail = normalizeDetail((e as CustomEvent).detail, 'command');
      if (!matchesTerminal(detail, terminalId)) return;
      const command = detail.command || '';
      cached.xterm.writeln(`${ts()}  ${A.green}${A.bold}\u276f${A.reset} ${A.white}${command}${A.reset}`);
      cached.transcript.push(`\n$ ${command}\n`);
      setTranscriptSeq((seq) => seq + 1);
      cached.currentCommand = command;
      cached.commandStartedAt = Date.now();
      cached.foldedBytes = 0;
      cached.foldNoticeWritten = false;
      setCommandCount((c) => c + 1);
      setRunning(true);
      setRunningCommand(command);
      setLastExit(null);
      if (autoscrollRef.current) cached.xterm.scrollToBottom();
    };

    // Streaming output chunk
    const onOutput = (e: Event) => {
      const detail = normalizeDetail((e as CustomEvent).detail, 'data');
      if (!matchesTerminal(detail, terminalId)) return;
      const chunk = detail.data || '';
      if (!chunk) return;
      cached.transcript.push(chunk);
      setTranscriptSeq((seq) => seq + 1);
      if (foldOutputRef.current) {
        cached.foldedBytes += chunk.length;
        if (!cached.foldNoticeWritten) {
          cached.xterm.writeln(`${A.gray}[output folded; transcript is still being captured]${A.reset}`);
          cached.foldNoticeWritten = true;
        }
        return;
      }
      if (detail.stream === 'stderr') {
        cached.xterm.write(`${A.red}${chunk}${A.reset}`);
      } else {
        cached.xterm.write(chunk);
      }
      if (autoscrollRef.current) cached.xterm.scrollToBottom();
    };

    // Command finished — show exit status
    const onExit = (e: Event) => {
      const detail = normalizeDetail((e as CustomEvent).detail, 'command');
      if (!matchesTerminal(detail, terminalId)) return;
      const exitCode = detail.exitCode ?? 0;
      setRunning(false);
      setRunningCommand('');
      if (cached.foldedBytes > 0 && cached.foldNoticeWritten) {
        cached.xterm.writeln(`${A.gray}[folded ${cached.foldedBytes.toLocaleString()} chars of output]${A.reset}`);
      }
      const durationMs = cached.commandStartedAt ? Date.now() - cached.commandStartedAt : 0;
      const duration = durationMs ? formatDuration(durationMs) : undefined;
      if (exitCode === 0) {
        cached.xterm.writeln(`${A.gray}\u2500\u2500 ${A.green}\u2713${A.reset}${A.gray} done${duration ? ` in ${duration}` : ''}${A.reset}`);
      } else {
        cached.xterm.writeln(`${A.gray}\u2500\u2500 ${A.red}\u2717 exit ${exitCode}${duration ? ` after ${duration}` : ''}${A.reset}`);
      }
      cached.xterm.writeln('');
      cached.transcript.push(`\n[exit ${exitCode}${duration ? `, ${duration}` : ''}]\n`);
      setTranscriptSeq((seq) => seq + 1);
      cached.currentCommand = null;
      cached.commandStartedAt = null;
      cached.foldedBytes = 0;
      cached.foldNoticeWritten = false;
      setLastExit({ code: exitCode, duration });
      if (autoscrollRef.current) cached.xterm.scrollToBottom();
    };

    window.addEventListener('terminal_command', onCommand);
    window.addEventListener('terminal_output', onOutput);
    window.addEventListener('terminal_exit', onExit);

    return () => {
      window.removeEventListener('terminal_command', onCommand);
      window.removeEventListener('terminal_output', onOutput);
      window.removeEventListener('terminal_exit', onExit);
    };
  }, [terminalId]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black/90 text-white/90">
      {/* ── Header bar ───────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.03]">
        {/* Left: status + label */}
        <div className="flex items-center gap-2 text-[11px] text-white/50">
          <span
            className={`inline-block w-[6px] h-[6px] rounded-full ${
              running ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'
            }`}
          />
          <span className="font-medium tracking-wide">Sandbox</span>
          {commandCount > 0 && (
            <span className="text-white/25">{commandCount} cmd{commandCount !== 1 ? 's' : ''}</span>
          )}
          {runningCommand && (
            <span className="hidden sm:inline max-w-[260px] truncate text-white/35 font-mono" title={runningCommand}>
              {runningCommand}
            </span>
          )}
          {!running && lastExit && (
            <span className={lastExit.code === 0 ? 'text-green-400/60' : 'text-red-400/70'}>
              exit {lastExit.code}{lastExit.duration ? ` / ${lastExit.duration}` : ''}
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 min-w-0">
          {searchOpen && (
            <div className="hidden sm:flex items-center gap-1 mr-1">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find"
                className="w-28 px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-[11px] outline-none focus:border-white/25"
              />
              <span className="text-[10px] text-white/35 min-w-8">{matchCount}</span>
            </div>
          )}
          {running && (
            <span className="text-[10px] text-green-400/70 font-medium tracking-wide mr-1 animate-pulse">
              running
            </span>
          )}
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="px-1.5 py-0.5 rounded hover:bg-white/10 text-[10px] text-white/35 hover:text-white/70 transition-colors"
            title="Search transcript"
          >
            Find
          </button>
          <button
            onClick={() => setFoldOutput((v) => !v)}
            className={`px-1.5 py-0.5 rounded hover:bg-white/10 text-[10px] transition-colors ${foldOutput ? 'text-yellow-300/80' : 'text-white/35 hover:text-white/70'}`}
            title="Fold future output while keeping transcript"
          >
            Fold
          </button>
          <button
            onClick={() => setAutoscroll((v) => !v)}
            className={`px-1.5 py-0.5 rounded hover:bg-white/10 text-[10px] transition-colors ${autoscroll ? 'text-green-300/70' : 'text-white/35 hover:text-white/70'}`}
            title="Toggle follow output"
          >
            Follow
          </button>
          <button
            onClick={handleCopyTranscript}
            className="px-1.5 py-0.5 rounded hover:bg-white/10 text-[10px] text-white/35 hover:text-white/70 transition-colors"
            title="Copy transcript"
          >
            Copy
          </button>
          <button
            onClick={handleSaveTranscript}
            className="px-1.5 py-0.5 rounded hover:bg-white/10 text-[10px] text-white/35 hover:text-white/70 transition-colors"
            title="Save transcript"
          >
            Save
          </button>
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
            title="Clear terminal"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4h10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Terminal canvas ──────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0 px-1 pt-1 overflow-hidden bg-transparent" />
    </div>
  );
}
