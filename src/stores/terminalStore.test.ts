import { beforeEach, describe, expect, it } from 'vitest';
import { getRunTranscript, useTerminalStore } from './terminalStore';

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
});
