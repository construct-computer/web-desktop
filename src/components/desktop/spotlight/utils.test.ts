import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/agentStore';
import { groupMessages, isLikelyThinkingText } from './utils';

describe('isLikelyThinkingText', () => {
  it('does not hide normal markdown answers', () => {
    expect(isLikelyThinkingText('## Summary\n- Here is the verified answer.')).toBe(false);
  });

  it('detects internal planning-style text', () => {
    expect(
      isLikelyThinkingText(
        'I need to analyze the user request and my plan is to use spawn_agent before responding [3 steps]',
      ),
    ).toBe(true);
  });
});

describe('groupMessages', () => {
  it('keeps the active latest agent message even when it looks like thinking', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Help me', timestamp: new Date(1) },
      {
        role: 'agent',
        content: 'I need to analyze the user request and my plan is to use spawn_agent before responding [3 steps]',
        timestamp: new Date(2),
      },
    ];

    expect(groupMessages(messages, true)).toEqual([
      { type: 'message', msg: messages[0], index: 0 },
      { type: 'message', msg: messages[1], index: 1 },
    ]);
  });

  it('groups adjacent activities before the next message', () => {
    const messages: ChatMessage[] = [
      { role: 'activity', content: 'Reading file', timestamp: new Date(1), activityType: 'file' },
      { role: 'activity', content: 'Running command', timestamp: new Date(2), activityType: 'terminal' },
      { role: 'agent', content: 'Done', timestamp: new Date(3) },
    ];

    expect(groupMessages(messages, false)).toEqual([
      { type: 'activities', msgs: [messages[0], messages[1]] },
      { type: 'message', msg: messages[2], index: 2 },
    ]);
  });
});
