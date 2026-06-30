import { describe, expect, it } from 'vitest';
import {
  attachStreamingToolCallStart,
  describeToolFailure,
  finalizeRunningActivities,
  patchToolActivityFailure,
  patchToolActivitySuccess,
} from './agentStoreUtils';

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
      { role: 'activity', content: 'Running `ls -la`', tool: 'terminal', toolCallId: 'call_1', activityStatus: 'running' as const, errorDetail: undefined as string | undefined },
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
    expect(patched[0]?.errorDetail).toBe('Sandbox error: mount failed');
  });
});

describe('patchToolActivitySuccess', () => {
  it('supersedes prior failed rows for the same integration tool', () => {
    const messages = [
      { role: 'activity', content: 'polar · list deployments', tool: 'app', toolCallId: 'call_1', activityStatus: 'failed' as const, isError: true },
      { role: 'activity', content: 'polar · list deployments', tool: 'app', toolCallId: 'call_2', activityStatus: 'running' as const },
    ];
    const patched = patchToolActivitySuccess(messages, {
      toolCallId: 'call_2',
      tool: 'app',
      supersedeFailedForTool: 'app',
    });
    expect(patched[0]?.activityStatus).toBe('completed');
    expect(patched[0]?.isError).toBe(false);
    expect(patched[1]?.activityStatus).toBe('completed');
  });

  it('supersedes failed rows by integrationTool when display tool is an app hostname', () => {
    const messages = [
      {
        role: 'activity',
        content: 'polar.ankush.one · List recent deployments',
        tool: 'polar.ankush.one',
        integrationTool: 'app',
        toolCallId: 'call_1',
        activityStatus: 'failed' as const,
        isError: true,
      },
      {
        role: 'activity',
        content: 'polar.ankush.one · List recent deployments',
        tool: 'polar.ankush.one',
        integrationTool: 'app',
        toolCallId: 'call_2',
        activityStatus: 'running' as const,
      },
    ];
    const patched = patchToolActivitySuccess(messages, {
      toolCallId: 'call_2',
      tool: 'app',
      supersedeFailedForTool: 'app',
    });
    expect(patched[0]?.activityStatus).toBe('completed');
    expect(patched[1]?.activityStatus).toBe('completed');
  });

  it('completes all matching running rows and removes streaming orphans', () => {
    const messages = [
      {
        role: 'activity',
        content: 'Calling app...',
        tool: 'app',
        integrationTool: 'app',
        toolCallIndex: 0,
        streamingArgsPreview: '{"action":"call"',
        activityStatus: 'running' as const,
      },
      {
        role: 'activity',
        content: 'polar.ankush.one · List recent deployments',
        tool: 'polar.ankush.one',
        integrationTool: 'app',
        toolCallId: 'call_2',
        activityStatus: 'running' as const,
      },
    ];
    const patched = patchToolActivitySuccess(messages, {
      toolCallId: 'call_2',
      tool: 'app',
    });
    expect(patched).toHaveLength(1);
    expect(patched[0]?.activityStatus).toBe('completed');
    expect(patched[0]?.toolCallId).toBe('call_2');
  });
});

describe('attachStreamingToolCallStart', () => {
  it('merges a streaming app row into the final display tool row', () => {
    const messages = [
      {
        role: 'activity',
        content: 'Calling app...',
        tool: 'app',
        integrationTool: 'app',
        toolCallIndex: 0,
        streamingArgsPreview: '{"action":"call"',
        activityStatus: 'running' as const,
      },
    ];
    const attached = attachStreamingToolCallStart(messages, {
      tool: 'polar.ankush.one',
      integrationTool: 'app',
      toolCallId: 'call_1',
      content: 'polar.ankush.one · List recent deployments',
      activityType: 'tool',
    });
    expect(attached.merged).toBe(true);
    expect(attached.messages).toHaveLength(1);
    expect(attached.messages[0]?.tool).toBe('polar.ankush.one');
    expect(attached.messages[0]?.toolCallId).toBe('call_1');
    expect(attached.messages[0]?.integrationTool).toBe('app');
  });
});

describe('finalizeRunningActivities', () => {
  it('marks trailing running activities completed', () => {
    const messages = [
      { role: 'activity', content: 'Working', activityStatus: 'running' as const },
      { role: 'agent', content: 'Done', timestamp: new Date() },
    ];
    const patched = finalizeRunningActivities(messages);
    expect(patched[0]?.activityStatus).toBe('completed');
  });
});
