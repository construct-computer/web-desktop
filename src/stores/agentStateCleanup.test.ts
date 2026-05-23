import { describe, expect, it } from 'vitest';
import { clearDesktopAgentRuntime, shouldClearViewedAgentState } from './agentStateCleanup';

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
