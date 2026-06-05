import type { Terminal as XTerm } from '@xterm/xterm';
import type { TerminalChunk, TerminalRun } from '@/stores/terminalStore';
import {
  appendStdoutWithJsonColor,
  clearStdoutJsonColorBuffer,
  flushStdoutJsonColorBuffer,
} from '@/lib/terminalStructuredOutput';

export const TERMINAL_THEME = {
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

export const A = {
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

export function formatTimestamp(value = Date.now()): string {
  const now = new Date(value);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${A.gray}${h}:${m}:${s}${A.reset}`;
}

export function formatDuration(ms?: number): string {
  if (ms === undefined) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatBytes(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatClock(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function writeWelcome(xterm: XTerm, terminalId: string): void {
  xterm.writeln('');
  const lane = terminalId !== 'main' ? `  ${A.gray}${terminalId}${A.reset}` : '';
  xterm.writeln(`  ${A.cyan}${A.bold}Ready${A.reset}${lane}`);
  xterm.writeln('');
  xterm.writeln(`  ${A.gray}Read-only. Commands Construct runs appear here automatically.${A.reset}`);
  xterm.writeln('');
}

export function writeCommandPrompt(xterm: XTerm, run: TerminalRun): void {
  xterm.writeln(`${formatTimestamp(run.startedAt)}  ${A.green}${A.bold}$${A.reset} ${A.white}${run.command}${A.reset}`);
}

export function writeChunk(xterm: XTerm, chunk: TerminalChunk): void {
  if (chunk.stream === 'stderr') {
    xterm.write(`${A.red}${chunk.data}${A.reset}`);
    return;
  }
  const colored = appendStdoutWithJsonColor(chunk.runId, chunk.data);
  if (colored) xterm.write(colored);
}

export function flushRunStdoutColorBuffer(xterm: XTerm, run: TerminalRun): void {
  const tail = flushStdoutJsonColorBuffer(run.id);
  if (tail) xterm.write(tail);
}

export function clearRunStdoutColorBuffer(runId: string): void {
  clearStdoutJsonColorBuffer(runId);
}

export function writePreviewPlaceholder(xterm: XTerm): void {
  xterm.writeln(`${A.gray}[persisted preview — loading full log…]${A.reset}`);
}

export function writeExit(xterm: XTerm, run: TerminalRun, foldedBytes = 0): void {
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

export function runMatches(run: TerminalRun, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return run.command.toLowerCase().includes(q)
    || run.outputText.toLowerCase().includes(q)
    || (run.preview || '').toLowerCase().includes(q);
}

export function statusClass(run?: TerminalRun): string {
  if (!run) return 'text-[var(--color-text-subtle)]';
  if (run.status === 'running') return 'text-green-500';
  if (run.status === 'failed') return 'text-red-400';
  return 'text-[var(--color-text-muted)]';
}

export function downloadText(filename: string, text: string): void {
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
