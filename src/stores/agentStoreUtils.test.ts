import { describe, expect, it } from 'vitest';
import { describeToolFailure, patchToolActivityFailure } from './agentStoreUtils';

describe('describeToolFailure', () => {
  it('formats terminal sandbox failures with detail', () => {
    expect(describeToolFailure('terminal', { command: 'ls -la' }, {
      error: 'Sandbox error: InvalidMountConfigError: R2 binding mounts require exporting ContainerProxy',
    })).toContain('Failed `ls -la`');
  });

  it('formats skipped sibling failures with root cause', () => {
    expect(describeToolFailure('sandbox_write_file', { path: '/tmp/state.json' }, {
      error: 'Skipped because agent_schedule failed: Scheduled time must be in the future',
    })).toContain('Skipped (agent_schedule failed)');
  });
});

describe('patchToolActivityFailure', () => {
  it('updates the matching activity row by toolCallId', () => {
    const messages = [
      { role: 'activity', content: 'Running `ls -la`', tool: 'terminal', toolCallId: 'call_1', activityStatus: 'running' as const },
    ];
    const patched = patchToolActivityFailure(messages, {
      toolCallId: 'call_1',
      tool: 'terminal',
      params: { command: 'ls -la' },
      exitCode: 1,
      error: 'Sandbox error: mount failed',
    });
    expect(patched[0]?.activityStatus).toBe('failed');
    expect(patched[0]?.content).toContain('Failed `ls -la`');
  });
});
