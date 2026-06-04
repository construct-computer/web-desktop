import { describe, expect, it, vi } from 'vitest';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { TerminalRun } from '@/stores/terminalStore';
import type { CachedTerminal } from './terminalXtermCache';
import { syncTranscriptToXterm } from './useTerminalTranscript';

function makeRun(overrides: Partial<TerminalRun> & Pick<TerminalRun, 'id' | 'command'>): TerminalRun {
  return {
    terminalId: 'main',
    status: 'completed',
    startedAt: 1000,
    stdoutBytes: 0,
    stderrBytes: 0,
    outputBytes: 0,
    chunks: [],
    outputText: '',
    outputTruncated: false,
    ...overrides,
  };
}

function mockCached(): CachedTerminal {
  const lines: string[] = [];
  const xterm = {
    writeln: vi.fn((line: string) => { lines.push(line); }),
    write: vi.fn((text: string) => { lines.push(text); }),
    registerMarker: vi.fn(() => ({ line: lines.length, isDisposed: false })),
  } as unknown as XTerm;

  return {
    xterm,
    fit: {} as CachedTerminal['fit'],
    element: {} as HTMLDivElement,
    disposeTimer: null,
    transcript: {
      promptRenderedRunIds: new Set(),
      chunkCountByRun: new Map(),
      exitRenderedRunIds: new Set(),
      previewRenderedRunIds: new Set(),
      foldNoticeRunId: null,
      foldedBytesByRun: new Map(),
      runMarkers: new Map(),
    },
  };
}

describe('syncTranscriptToXterm', () => {
  it('appends multiple runs without clearing between them', () => {
    const cached = mockCached();

    syncTranscriptToXterm(cached, [
      makeRun({ id: 'a', command: 'echo one', startedAt: 1000, exitCode: 0, durationMs: 10 }),
      makeRun({ id: 'b', command: 'echo two', startedAt: 2000, exitCode: 0, durationMs: 20 }),
    ], false);

    const joined = (cached.xterm.writeln as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(joined).toContain('echo one');
    expect(joined).toContain('echo two');
    expect(cached.transcript.promptRenderedRunIds.has('a')).toBe(true);
    expect(cached.transcript.promptRenderedRunIds.has('b')).toBe(true);
  });

  it('appends incremental output chunks for a running command', () => {
    const cached = mockCached();
    const run = makeRun({
      id: 'live',
      command: 'pnpm test',
      status: 'running',
      chunks: [{ id: 'live:1', runId: 'live', data: 'ok', stream: 'stdout', timestamp: 1100, sequence: 1 }],
    });

    syncTranscriptToXterm(cached, [run], false);
    expect(cached.transcript.chunkCountByRun.get('live')).toBe(1);

    syncTranscriptToXterm(cached, [{
      ...run,
      chunks: [
        ...run.chunks,
        { id: 'live:2', runId: 'live', data: '\n', stream: 'stdout', timestamp: 1200, sequence: 2 },
      ],
    }], false);

    expect(cached.transcript.chunkCountByRun.get('live')).toBe(2);
    expect(cached.xterm.write).toHaveBeenCalled();
  });
});
