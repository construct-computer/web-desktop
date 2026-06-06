import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './agentStore';
import {
  appendUserMessageForNewTurn,
  applyAgentTextDelta,
  liveUserMessagesAheadOfHistory,
  mergeLiveTailIntoHistory,
  shouldAppendAgentTextDelta,
} from './chatTurnSync';

function user(content: string, clientId?: string): ChatMessage {
  return { role: 'user', content, timestamp: new Date(), ...(clientId ? { clientId } : {}) };
}

function agent(content: string): ChatMessage {
  return { role: 'agent', content, timestamp: new Date() };
}

describe('chatTurnSync', () => {
  it('inserts a turn break before a new user message after an agent reply', () => {
    const next = appendUserMessageForNewTurn([user('hello'), agent('hi there')], user('again'));
    expect(next).toHaveLength(4);
    expect(next[2]?.role).toBe('system');
    expect(next[3]?.content).toBe('again');
  });

  it('starts a new agent bubble after a user message', () => {
    const messages = appendUserMessageForNewTurn([user('hello'), agent('first')], user('second'));
    expect(shouldAppendAgentTextDelta(messages)).toBe(false);
    const withDelta = applyAgentTextDelta(messages, 'second reply', (m) => m);
    expect(withDelta).toHaveLength(5);
    expect(withDelta[4]?.role).toBe('agent');
    expect(withDelta[4]?.content).toBe('second reply');
  });

  it('continues the current agent bubble while streaming the same turn', () => {
    const messages = [user('hello'), agent('hel')];
    expect(shouldAppendAgentTextDelta(messages)).toBe(true);
    const withDelta = applyAgentTextDelta(messages, 'lo', (m) => m);
    expect(withDelta[1]?.content).toBe('hello');
  });

  it('preserves optimistic user rows missing from server history', () => {
    const history = [user('schedule water'), agent('scheduled')];
    const optimistic = user('ok', 'client-ok');
    const live = [...history, optimistic];
    expect(liveUserMessagesAheadOfHistory(live, history)).toEqual([optimistic]);
    expect(mergeLiveTailIntoHistory(history, live)).toHaveLength(3);
  });

  it('does not stitch a new reply onto a prior turn once a turn break is present', () => {
    const messages = appendUserMessageForNewTurn(
      [user('first'), agent('first reply')],
      user('second'),
    );
    expect(shouldAppendAgentTextDelta(messages)).toBe(false);
    const withDelta = applyAgentTextDelta(messages, 'second reply', (m) => m);
    expect(withDelta[withDelta.length - 1]?.content).toBe('second reply');
  });
});
