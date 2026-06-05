import { useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { TerminalRun } from '@/stores/terminalStore';
import {
  getCachedTerminal,
  scrollToRunMarker,
  type CachedTerminal,
} from './terminalXtermCache';
import {
  A,
  writeChunk,
  writeCommandPrompt,
  writeExit,
  writePreviewPlaceholder,
  flushRunStdoutColorBuffer,
} from './terminalTheme';

export interface UseTerminalTranscriptOptions {
  terminalId: string;
  runs: TerminalRun[];
  scrollTargetRunId?: string | null;
  autoscroll: boolean;
  foldOutput: boolean;
  onScrollTargetHandled?: () => void;
}

function appendChunks(
  xterm: XTerm,
  cached: CachedTerminal,
  run: TerminalRun,
  foldOutput: boolean,
): void {
  const state = cached.transcript;
  const rendered = state.chunkCountByRun.get(run.id) ?? 0;
  const nextChunks = run.chunks.slice(rendered);
  if (nextChunks.length === 0) return;

  if (foldOutput) {
    const added = nextChunks.reduce((total, chunk) => total + chunk.data.length, 0);
    const prev = state.foldedBytesByRun.get(run.id) ?? 0;
    state.foldedBytesByRun.set(run.id, prev + added);
    if (state.foldNoticeRunId !== run.id) {
      xterm.writeln(`${A.gray}[output folded; transcript is still being captured]${A.reset}`);
      state.foldNoticeRunId = run.id;
    }
  } else {
    for (const chunk of nextChunks) writeChunk(xterm, chunk);
  }
  state.chunkCountByRun.set(run.id, run.chunks.length);
}

function appendPreviewIfNeeded(xterm: XTerm, cached: CachedTerminal, run: TerminalRun): void {
  const state = cached.transcript;
  if (run.chunks.length > 0) return;
  if (!run.preview) return;
  if (state.previewRenderedRunIds.has(run.id)) return;
  if (!state.promptRenderedRunIds.has(run.id)) return;

  writePreviewPlaceholder(xterm);
  xterm.write(run.preview);
  state.previewRenderedRunIds.add(run.id);
  state.chunkCountByRun.set(run.id, 0);
}

function appendExitIfNeeded(xterm: XTerm, cached: CachedTerminal, run: TerminalRun): void {
  const state = cached.transcript;
  if (typeof run.exitCode !== 'number') return;
  if (state.exitRenderedRunIds.has(run.id)) return;
  if (!state.promptRenderedRunIds.has(run.id)) return;

  flushRunStdoutColorBuffer(xterm, run);
  const foldedBytes = state.foldedBytesByRun.get(run.id) ?? 0;
  writeExit(xterm, run, foldedBytes);
  state.exitRenderedRunIds.add(run.id);
  state.foldedBytesByRun.delete(run.id);
  if (state.foldNoticeRunId === run.id) state.foldNoticeRunId = null;
}

function renderRunPrompt(xterm: XTerm, cached: CachedTerminal, run: TerminalRun): void {
  const state = cached.transcript;
  if (state.promptRenderedRunIds.has(run.id)) return;

  writeCommandPrompt(xterm, run);
  const marker = xterm.registerMarker(1);
  if (marker) state.runMarkers.set(run.id, marker);
  state.promptRenderedRunIds.add(run.id);
  state.chunkCountByRun.set(run.id, 0);
}

/** Append-only sync from terminal runs into the cached xterm instance. */
export function syncTranscriptToXterm(
  cached: CachedTerminal,
  runs: TerminalRun[],
  foldOutput: boolean,
): void {
  const sorted = [...runs].sort((a, b) => a.startedAt - b.startedAt);
  for (const run of sorted) {
    renderRunPrompt(cached.xterm, cached, run);
    appendPreviewIfNeeded(cached.xterm, cached, run);
    appendChunks(cached.xterm, cached, run, foldOutput);
    appendExitIfNeeded(cached.xterm, cached, run);
  }
}

export function useTerminalTranscript({
  terminalId,
  runs,
  scrollTargetRunId,
  autoscroll,
  foldOutput,
  onScrollTargetHandled,
}: UseTerminalTranscriptOptions): void {
  const autoscrollRef = useRef(autoscroll);
  const foldOutputRef = useRef(foldOutput);

  useEffect(() => { autoscrollRef.current = autoscroll; }, [autoscroll]);
  useEffect(() => { foldOutputRef.current = foldOutput; }, [foldOutput]);

  useEffect(() => {
    const cached = getCachedTerminal(terminalId);
    if (!cached) return;

    syncTranscriptToXterm(cached, runs, foldOutputRef.current);

    if (autoscrollRef.current) cached.xterm.scrollToBottom();
  }, [terminalId, runs, foldOutput]);

  useEffect(() => {
    if (!scrollTargetRunId) return;
    const cached = getCachedTerminal(terminalId);
    if (!cached) return;

    const scrolled = scrollToRunMarker(cached, scrollTargetRunId);
    if (scrolled) onScrollTargetHandled?.();
  }, [terminalId, scrollTargetRunId, runs, onScrollTargetHandled]);
}
