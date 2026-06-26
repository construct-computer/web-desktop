import { describe, expect, it } from 'vitest';
import {
  clearDesktopAgentRuntime,
  hasUserRunningSessions,
  isSubagentSessionKey,
  isSessionRunning,
  pruneStaleBackgroundRunningSessions,
  shouldClearViewedAgentState,
  stripSubagentSessions,
  subagentSessionKeyForChildId,
} from './agentStateCleanup';

describe('subagent session keys', () => {
  it('identifies child_* keys as internal subagent sessions', () => {
    expect(isSubagentSessionKey('child_abc')).toBe(true);
    expect(isSubagentSessionKey('desktop')).toBe(false);
    expect(isSubagentSessionKey('session_1')).toBe(false);
  });

  it('normalizes child session keys', () => {
    expect(subagentSessionKeyForChildId('abc')).toBe('child_abc');
    expect(subagentSessionKeyForChildId('child_abc')).toBe('child_abc');
  });

  it('strips subagent sessions and detects user sessions', () => {
    const mixed = new Set(['desktop', 'child_a', 'child_b']);
    const stripped = stripSubagentSessions(mixed);
    expect([...stripped]).toEqual(['desktop']);
    expect(hasUserRunningSessions(mixed)).toBe(true);
    expect(hasUserRunningSessions(new Set(['child_a', 'child_b']))).toBe(false);
  });

  it('checks running state for the requested session only', () => {
    expect(isSessionRunning('old_chat', new Set(['current_chat']), {})).toBe(false);
    expect(isSessionRunning('old_chat', new Set(['old_chat']), {})).toBe(true);
    expect(isSessionRunning('old_chat', new Set(), { old_chat: { status: 'thinking' } })).toBe(true);
    expect(isSessionRunning('old_chat', new Set(), { old_chat: { status: 'idle' } })).toBe(false);
  });
});

describe('shouldClearViewedAgentState', () => {
  it('clears stale main-agent tool state when hydration says the viewed chat is inactive', () => {
    expect(shouldClearViewedAgentState({
      activeSessionKey: 'session_1',
      liveSessionKeys: new Set(),
      desktopAgent: { running: true, currentTool: 'wait_for_agents', thinking: 'Waiting' },
    })).toBe(true);
  });

  it('keeps visible state when the viewed chat is still active', () => {
    expect(shouldClearViewedAgentState({
      activeSessionKey: 'session_1',
      liveSessionKeys: new Set(['session_1']),
      desktopAgent: { running: true, currentTool: 'wait_for_agents' },
    })).toBe(false);
  });

  it('prunes stale background sessions from runningSessions', () => {
    const now = Date.now();
    const pruned = pruneStaleBackgroundRunningSessions(
      new Set(['desktop', 'scheduled_tasks']),
      {
        desktop: { lastHeartbeatAt: now },
        scheduled_tasks: { lastHeartbeatAt: now - 60_000 },
      },
      'desktop',
      45_000,
      now,
    );
    expect(pruned.has('desktop')).toBe(true);
    expect(pruned.has('scheduled_tasks')).toBe(false);
  });

  it('clears the desktop agent runtime snapshot for a fresh chat', () => {
    expect(clearDesktopAgentRuntime({
      running: true,
      currentTool: 'local_app_guide',
      thinking: 'Loading guide',
      responseText: 'partial',
      toolHistory: [{ tool: 'local_app_guide' }],
      stepProgress: { step: 1, maxSteps: 3 },
    }, 123)).toEqual({
      running: false,
      currentTool: undefined,
      thinking: null,
      responseText: '',
      toolHistory: [],
      stepProgress: undefined,
      completedAt: 123,
    });
  });
});
