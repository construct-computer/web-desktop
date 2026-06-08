import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/agentStore';
import { formatRepeatBadge, mergeBrowserRepeats } from './browserActivityUtils';

function activity(partial: Partial<ChatMessage> & Pick<ChatMessage, 'content'>): ChatMessage {
  return {
    role: 'activity',
    timestamp: new Date(),
    ...partial,
  };
}

describe('mergeBrowserRepeats', () => {
  it('collapses consecutive identical web_fetch rows', () => {
    const rows = Array.from({ length: 4 }, () =>
      activity({
        content: 'Fetching: www.zuzalu.city',
        activityType: 'web',
        tool: 'web_fetch',
      }),
    );

    const merged = mergeBrowserRepeats(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].repeat).toBe(4);
    expect(merged[0].act.content).toBe('Fetching: www.zuzalu.city');
  });

  it('keeps different searches as separate groups', () => {
    const rows = [
      activity({ content: 'Searching: Zuzalu cost', activityType: 'web', tool: 'web_search' }),
      activity({ content: 'Searching: Zuzalu popup', activityType: 'web', tool: 'web_search' }),
    ];

    const merged = mergeBrowserRepeats(rows);
    expect(merged).toHaveLength(2);
    expect(merged[0].repeat).toBe(1);
    expect(merged[1].repeat).toBe(1);
  });

  it('does not merge non-consecutive identical fetches', () => {
    const rows = [
      activity({ content: 'Fetching: www.zuzalu.city', activityType: 'web', tool: 'web_fetch' }),
      activity({ content: 'Searching: Zuzalu', activityType: 'web', tool: 'web_search' }),
      activity({ content: 'Fetching: www.zuzalu.city', activityType: 'web', tool: 'web_fetch' }),
    ];

    const merged = mergeBrowserRepeats(rows);
    expect(merged).toHaveLength(3);
    expect(merged.map((entry) => entry.repeat)).toEqual([1, 1, 1]);
  });

  it('still merges consecutive browser activities on the same host', () => {
    const rows = [
      activity({
        content: 'Clicking button',
        activityType: 'web',
        tool: 'browser',
        browserAction: { actionType: 'click', url: 'https://example.com/page' },
      }),
      activity({
        content: 'Typing text',
        activityType: 'web',
        tool: 'browser',
        browserAction: { actionType: 'type', url: 'https://example.com/page' },
      }),
    ];

    const merged = mergeBrowserRepeats(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].repeat).toBe(2);
  });

  it('merges consecutive memory activities with the same operation id', () => {
    const rows = [
      activity({
        content: 'Memory created',
        tool: 'memory',
        activityType: 'tool',
        memoryActivity: {
          provider: 'Construct Memory',
          action: 'stored',
          operationId: 'mem_op_1',
          items: [{ id: 'm1', event: 'ADD', memory: 'Same fact' }],
        },
      }),
      activity({
        content: 'Memory created',
        tool: 'memory',
        activityType: 'tool',
        memoryActivity: {
          provider: 'Construct Memory',
          action: 'stored',
          operationId: 'mem_op_1',
          items: [{ id: 'm1', event: 'ADD', memory: 'Same fact' }],
        },
      }),
    ];

    const merged = mergeBrowserRepeats(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].repeat).toBe(2);
  });

  it('merges consecutive activities in the same browser run', () => {
    const rows = [
      activity({
        content: 'Step 1',
        activityType: 'web',
        tool: 'browser',
        browserRunId: 'run_abc',
      }),
      activity({
        content: 'Step 2',
        activityType: 'web',
        tool: 'browser',
        browserRunId: 'run_abc',
      }),
    ];

    const merged = mergeBrowserRepeats(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].repeat).toBe(2);
  });
});

describe('formatRepeatBadge', () => {
  it('returns empty for single repeats', () => {
    expect(formatRepeatBadge(1)).toBe('');
  });

  it('caps display at x3+ for large repeat counts', () => {
    expect(formatRepeatBadge(4)).toBe('×3+');
    expect(formatRepeatBadge(3)).toBe('×3');
    expect(formatRepeatBadge(2)).toBe('×2');
  });
});
