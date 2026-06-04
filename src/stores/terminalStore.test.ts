import { beforeEach, describe, expect, it } from 'vitest';
import { getRunTranscript, getSessionTranscript, useTerminalStore } from './terminalStore';

describe('terminalStore', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: {}, runs: {} });
  });

  it('captures command, output chunks, and exit status by tool call id', () => {
    const store = useTerminalStore.getState();
    store.ingestCommand({
      toolCallId: 'call-1',
      terminalId: 'main',
      sessionKey: 'default',
      command: 'pnpm test',
      timestamp: 1000,
    });
    store.ingestOutput({
      toolCallId: 'call-1',
      terminalId: 'main',
      data: 'ok\n',
      stream: 'stdout',
      timestamp: 1100,
    });
    store.ingestExit({
      toolCallId: 'call-1',
      terminalId: 'main',
      exitCode: 0,
      timestamp: 1500,
    });

    const run = useTerminalStore.getState().runs['call-1'];
    expect(run.command).toBe('pnpm test');
    expect(run.status).toBe('completed');
    expect(run.durationMs).toBe(500);
    expect(run.stdoutBytes).toBe(3);
    expect(run.chunks).toHaveLength(1);
    expect(getRunTranscript(run)).toContain('$ pnpm test');
    expect(getRunTranscript(run)).toContain('[exit 0]');
  });

  it('hydrates persisted terminal runs without dropping live chunks', () => {
    const store = useTerminalStore.getState();
    store.ingestCommand({
      toolCallId: 'call-2',
      terminalId: 'main',
      command: 'node script.js',
      timestamp: 1000,
    });
    store.ingestOutput({
      toolCallId: 'call-2',
      terminalId: 'main',
      data: 'live output',
      stream: 'stderr',
      timestamp: 1200,
    });

    useTerminalStore.getState().hydrateRuns([{
      tool_call_id: 'call-2',
      session_key: 'default',
      terminal_id: 'main',
      command: 'node script.js',
      status: 'failed',
      started_at: 1000,
      ended_at: 2000,
      exit_code: 1,
      duration_ms: 1000,
      stderr_bytes: 11,
      output_ref: 'r2:user/.construct/terminal-runs/call-2.jsonl',
      preview: 'persisted preview',
    }]);

    const run = useTerminalStore.getState().runs['call-2'];
    expect(run.status).toBe('failed');
    expect(run.outputRef).toContain('terminal-runs');
    expect(run.chunks[0].data).toBe('live output');
    expect(useTerminalStore.getState().sessions.main.runIds).toEqual(['call-2']);
  });

  it('scrollToRun sets selected and scroll target without removing runs', () => {
    const store = useTerminalStore.getState();
    store.ingestCommand({
      toolCallId: 'call-a',
      terminalId: 'main',
      command: 'first',
      timestamp: 1000,
    });
    store.ingestCommand({
      toolCallId: 'call-b',
      terminalId: 'main',
      command: 'second',
      timestamp: 2000,
    });
    store.scrollToRun('main', 'call-a');

    const session = useTerminalStore.getState().sessions.main;
    expect(session.selectedRunId).toBe('call-a');
    expect(session.scrollTargetRunId).toBe('call-a');
    expect(useTerminalStore.getState().runs['call-b']).toBeDefined();
  });

  it('mergeRunOutput hydrates full log into chunks once', () => {
    const store = useTerminalStore.getState();
    store.hydrateRuns([{
      tool_call_id: 'call-h',
      terminal_id: 'main',
      command: 'ls -la',
      status: 'completed',
      started_at: 1000,
      ended_at: 2000,
      exit_code: 0,
      output_ref: 'r2:key',
      preview: 'preview only',
    }]);

    useTerminalStore.getState().mergeRunOutput('call-h', 'full output\n');
    const run = useTerminalStore.getState().runs['call-h'];
    expect(run.hydratedFull).toBe(true);
    expect(run.chunks[0].data).toBe('full output\n');

    useTerminalStore.getState().mergeRunOutput('call-h', 'ignored');
    expect(useTerminalStore.getState().runs['call-h'].chunks).toHaveLength(1);
  });

  it('getSessionTranscript orders runs by startedAt', () => {
    const runs = {
      late: {
        id: 'late',
        terminalId: 'main',
        command: 'late',
        status: 'completed' as const,
        startedAt: 2000,
        stdoutBytes: 0,
        stderrBytes: 0,
        outputBytes: 0,
        chunks: [],
        outputText: '',
        outputTruncated: false,
      },
      early: {
        id: 'early',
        terminalId: 'main',
        command: 'early',
        status: 'completed' as const,
        startedAt: 1000,
        stdoutBytes: 0,
        stderrBytes: 0,
        outputBytes: 0,
        chunks: [],
        outputText: '',
        outputTruncated: false,
      },
    };
    const text = getSessionTranscript([runs.late, runs.early]);
    expect(text.indexOf('early')).toBeLessThan(text.indexOf('late'));
  });

  it('clears runs for one deleted chat session without touching others', () => {
    const store = useTerminalStore.getState();
    store.ingestCommand({
      toolCallId: 'deleted-call',
      terminalId: 'main',
      sessionKey: 'deleted-session',
      command: 'pnpm dev',
      timestamp: 1000,
    });
    store.ingestCommand({
      toolCallId: 'kept-call',
      terminalId: 'main',
      sessionKey: 'active-session',
      command: 'pnpm test',
      timestamp: 1100,
    });

    useTerminalStore.getState().clearSession('deleted-session');

    expect(useTerminalStore.getState().runs['deleted-call']).toBeUndefined();
    expect(useTerminalStore.getState().runs['kept-call']).toBeDefined();
    expect(useTerminalStore.getState().sessions.main.runIds).toEqual(['kept-call']);
  });
});
