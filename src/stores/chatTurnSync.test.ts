import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './agentStore';
import { mergeLiveTailIntoHistory } from './chatTurnSync';

describe('mergeLiveTailIntoHistory', () => {
  it('skips live activity rows already present in history', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'how many deployments on polar?', timestamp: new Date(1) },
      {
        role: 'activity',
        content: 'polar.ankush.one · List recent deployments',
        tool: 'polar.ankush.one',
        integrationTool: 'app',
        toolCallId: 'call_1',
        activityStatus: 'completed',
        timestamp: new Date(2),
      },
    ];
    const live: ChatMessage[] = [
      ...history,
      {
        role: 'activity',
        content: 'polar.ankush.one · List recent deployments',
        tool: 'app',
        integrationTool: 'app',
        toolCallId: 'call_1',
        activityStatus: 'running',
        timestamp: new Date(3),
      },
    ];

    const merged = mergeLiveTailIntoHistory(history, live);
    const activityRows = merged.filter((m) => m.role === 'activity');
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0]?.toolCallId).toBe('call_1');
  });
});
