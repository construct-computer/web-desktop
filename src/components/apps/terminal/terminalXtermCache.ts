import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { IMarker } from '@xterm/xterm';
import { TERMINAL_THEME, writeWelcome } from './terminalTheme';

export interface TranscriptRenderState {
  promptRenderedRunIds: Set<string>;
  chunkCountByRun: Map<string, number>;
  exitRenderedRunIds: Set<string>;
  previewRenderedRunIds: Set<string>;
  foldNoticeRunId: string | null;
  foldedBytesByRun: Map<string, number>;
  runMarkers: Map<string, IMarker>;
}

export interface CachedTerminal {
  xterm: XTerm;
  fit: FitAddon;
  element: HTMLDivElement;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  transcript: TranscriptRenderState;
}

const terminalCache = new Map<string, CachedTerminal>();

function createTranscriptState(): TranscriptRenderState {
  return {
    promptRenderedRunIds: new Set(),
    chunkCountByRun: new Map(),
    exitRenderedRunIds: new Set(),
    previewRenderedRunIds: new Set(),
    foldNoticeRunId: null,
    foldedBytesByRun: new Map(),
    runMarkers: new Map(),
  };
}

export function resetTranscriptState(cached: CachedTerminal, terminalId: string): void {
  cached.transcript = createTranscriptState();
  cached.xterm.clear();
  writeWelcome(cached.xterm, terminalId);
}

export function getOrCreateTerminal(terminalId: string): CachedTerminal {
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
    transcript: createTranscriptState(),
  };
  terminalCache.set(terminalId, entry);
  return entry;
}

export function getCachedTerminal(terminalId: string): CachedTerminal | undefined {
  return terminalCache.get(terminalId);
}

export function scheduleDispose(terminalId: string, delayMs = 5_000): void {
  const entry = terminalCache.get(terminalId);
  if (!entry) return;
  if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
  entry.disposeTimer = setTimeout(() => {
    entry.xterm.dispose();
    terminalCache.delete(terminalId);
  }, delayMs);
}

export function scrollToRunMarker(cached: CachedTerminal, runId: string): boolean {
  const marker = cached.transcript.runMarkers.get(runId);
  if (!marker || marker.isDisposed) return false;
  const line = marker.line;
  if (line === undefined || line < 0) return false;
  cached.xterm.scrollToLine(Math.max(0, line));
  return true;
}
