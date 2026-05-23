import { describe, expect, it, beforeEach } from 'vitest';
import { useAgentTrackerStore } from './agentTrackerStore';

describe('agentTrackerStore session idle cleanup', () => {
  beforeEach(() => {
    useAgentTrackerStore.getState().resetAll();
  });

  it('marks subagents with missing terminal events as cancelled, not complete', () => {
    const store = useAgentTrackerStore.getState();
    store.startOperation('op_1', 'orchestration', 'collect data', 3, 'desktop', 'session_1');
    store.addSubAgent('op_1', {
      id: 'child_running',
      type: 'subagent',
      label: 'Running child',
      goal: 'still running',
      status: 'running',
      startedAt: Date.now(),
      activities: [],
    });
    store.addSubAgent('op_1', {
      id: 'child_failed',
      type: 'subagent',
      label: 'Failed child',
      goal: 'already failed',
      status: 'failed',
      error: 'browser failed',
      startedAt: Date.now(),
      completedAt: Date.now(),
      activities: [],
    });

    useAgentTrackerStore.getState().completeOperationsForSessionIdle('session_1', false);

    const op = useAgentTrackerStore.getState().operations.op_1;
    expect(op.status).toBe('complete');
    expect(op.subAgents.find((s) => s.id === 'child_running')?.status).toBe('cancelled');
    expect(op.subAgents.find((s) => s.id === 'child_failed')?.status).toBe('failed');
  });

  it('drops operations for a deleted chat session only', () => {
    const store = useAgentTrackerStore.getState();
    store.startOperation('delete_me', 'orchestration', 'deleted session work', 1, 'desktop', 'deleted-session');
    store.startOperation('keep_me', 'orchestration', 'active session work', 1, 'desktop', 'active-session');
    store.addSubAgent('delete_me', {
      id: 'child_deleted',
      type: 'subagent',
      label: 'Deleted child',
      goal: 'deleted work',
      status: 'running',
      startedAt: Date.now(),
      activities: [],
    });

    useAgentTrackerStore.getState().dropOperationsForSession('deleted-session', false);

    expect(useAgentTrackerStore.getState().operations.delete_me).toBeUndefined();
    expect(useAgentTrackerStore.getState().operations.keep_me).toBeDefined();
    expect(useAgentTrackerStore.getState().subagentIndex.child_deleted).toBeUndefined();
  });
});
