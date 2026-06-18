import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/agentStore';
import { mergeBrowserRepeats } from './browserActivityUtils';

function activity(partial: Partial<ChatMessage> & Pick<ChatMessage, 'content'>): ChatMessage {
  return {
    role: 'activity',
    timestamp: new Date(),
    ...partial,
  };
}

describe('mergeBrowserRepeats', () => {
  it('prefers completed rows over stuck running duplicates', () => {
    const activities = [
      activity({
        content: 'polar.ankush.one · List recent deployments',
        tool: 'app',
        integrationTool: 'app',
        activityStatus: 'running',
      }),
      activity({
        content: 'polar.ankush.one · List recent deployments',
        tool: 'polar.ankush.one',
        integrationTool: 'app',
        activityStatus: 'completed',
      }),
    ];
    const merged = mergeBrowserRepeats(activities);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.repeat).toBe(2);
    expect(merged[0]?.act.activityStatus).toBe('completed');
    expect(merged[0]?.act.tool).toBe('polar.ankush.one');
  });

  it('merges by toolCallId even when display tool names differ', () => {
    const activities = [
      activity({
        content: 'polar.ankush.one · List recent deployments',
        tool: 'app',
        toolCallId: 'call_1',
        activityStatus: 'running',
      }),
      activity({
        content: 'polar.ankush.one · List recent deployments',
        tool: 'polar.ankush.one',
        integrationTool: 'app',
        toolCallId: 'call_1',
        activityStatus: 'completed',
      }),
    ];
    const merged = mergeBrowserRepeats(activities);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.repeat).toBe(2);
    expect(merged[0]?.act.activityStatus).toBe('completed');
  });
});
