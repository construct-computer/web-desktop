import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useComputerStore } from '@/stores/agentStore';
import type { WindowConfig } from '@/types';

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

  const entry: CachedTerminal = { xterm, fit, element, disposeTimer: null };
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

export function TerminalWindow({ config }: TerminalWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalId = (config.metadata?.terminalId as string) || 'main';
  const [commandCount, setCommandCount] = useState(0);
  const [running, setRunning] = useState(false);

  const handleClear = useCallback(() => {
    const cached = terminalCache.get(terminalId);
    if (!cached) return;
    cached.xterm.clear();
    writeWelcome(cached.xterm);
    setCommandCount(0);
  }, [terminalId]);

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
      const command = (e as CustomEvent).detail as string;
      cached.xterm.writeln(`${ts()}  ${A.green}${A.bold}\u276f${A.reset} ${A.white}${command}${A.reset}`);
      setCommandCount((c) => c + 1);
      setRunning(true);
    };

    // Streaming output chunk
    const onOutput = (e: Event) => {
      const chunk = (e as CustomEvent).detail as string;
      if (chunk) cached.xterm.write(chunk);
    };

    // Command finished — show exit status
    const onExit = (e: Event) => {
      const { exitCode } = (e as CustomEvent).detail as { exitCode: number; command: string };
      setRunning(false);
      if (exitCode === 0) {
        cached.xterm.writeln(`${A.gray}\u2500\u2500 ${A.green}\u2713${A.reset}${A.gray} done${A.reset}`);
      } else {
        cached.xterm.writeln(`${A.gray}\u2500\u2500 ${A.red}\u2717 exit ${exitCode}${A.reset}`);
      }
      cached.xterm.writeln('');
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
    <div className="flex flex-col h-full overflow-hidden bg-black/70 backdrop-blur-[20px] text-white/90">
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
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          {running && (
            <span className="text-[10px] text-green-400/70 font-medium tracking-wide mr-1 animate-pulse">
              running
            </span>
          )}
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
