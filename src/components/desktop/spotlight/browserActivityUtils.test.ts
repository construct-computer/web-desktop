import { describe, expect, it } from 'vitest';
import { mergeBrowserRepeats, formatRepeatBadge } from './browserActivityUtils';
import type { ChatMessage } from '@/stores/agentStore';

function act(partial: Partial<ChatMessage> & { content: string }): ChatMessage {
  return {
    role: 'activity',
    timestamp: new Date(),
    activityType: 'web',
    tool: 'browser',
    ...partial,
  };
}

describe('mergeBrowserRepeats', () => {
  it('merges consecutive steps for the same run id', () => {
    const activities = [
      act({ content: 'Click button', browserRunId: 'run-1', browserAction: { actionType: 'click', url: 'https://news.ycombinator.com' } }),
      act({ content: 'Scroll', browserRunId: 'run-1', browserAction: { actionType: 'scroll', url: 'https://news.ycombinator.com' } }),
      act({ content: 'Done', browserRunId: 'run-1', browserAction: { actionType: 'screenshot', url: 'https://news.ycombinator.com' } }),
    ];
    const merged = mergeBrowserRepeats(activities);
    expect(merged).toHaveLength(1);
    expect(merged[0].repeat).toBe(3);
  });

  it('does not merge different hosts', () => {
    const activities = [
      act({ content: 'Open', browserAction: { actionType: 'open', url: 'https://a.com' } }),
      act({ content: 'Open', browserAction: { actionType: 'open', url: 'https://b.com' } }),
    ];
    expect(mergeBrowserRepeats(activities)).toHaveLength(2);
  });
});

describe('formatRepeatBadge', () => {
  it('caps display at ×3+', () => {
    expect(formatRepeatBadge(8)).toBe('×3+');
    expect(formatRepeatBadge(2)).toBe('×2');
    expect(formatRepeatBadge(1)).toBe('');
  });
});
