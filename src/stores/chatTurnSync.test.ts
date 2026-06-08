import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './agentStore';
import {
  appendUserMessageForNewTurn,
  applyAgentTextDelta,
  liveUserMessagesAheadOfHistory,
  mergeLiveTailIntoHistory,
  shouldAppendAgentTextDelta,
  sortChatMessagesByTimestamp,
} from './chatTurnSync';

function user(content: string, clientId?: string, ts = Date.now()): ChatMessage {
  return { role: 'user', content, timestamp: new Date(ts), ...(clientId ? { clientId } : {}) };
}

function agent(content: string, ts = Date.now()): ChatMessage {
  return { role: 'agent', content, timestamp: new Date(ts) };
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

  it('keeps the full live thread when the server history snapshot is still empty', () => {
    const live = [user('hello'), agent('hi there'), user('again')];
    expect(mergeLiveTailIntoHistory([], live)).toEqual(live);
  });

  it('preserves streamed assistant rows missing from a lagging server snapshot', () => {
    const ts = 1_000;
    const history = [user('hello', undefined, ts)];
    const live = [user('hello', undefined, ts), agent('hi there', ts)];
    expect(mergeLiveTailIntoHistory(history, live)).toEqual([
      user('hello', undefined, ts),
      agent('hi there', ts),
    ]);
  });

  it('restores user-before-agent order when a live user merges onto assistant-only history', () => {
    const history = [agent('Hello!', 2000)];
    const live = [user('new chat', undefined, 1000), agent('Hello!', 2000)];
    expect(mergeLiveTailIntoHistory(history, live)).toEqual([
      user('new chat', undefined, 1000),
      agent('Hello!', 2000),
    ]);
  });

  it('sorts chat rows chronologically with user before agent on timestamp ties', () => {
    const ts = 5_000;
    expect(sortChatMessagesByTimestamp([
      agent('reply', ts),
      user('prompt', undefined, ts),
    ])).toEqual([
      user('prompt', undefined, ts),
      agent('reply', ts),
    ]);
  });

  it('preserves whitespace-only streaming deltas', () => {
    const messages = [user('hello')];
    const withDelta = applyAgentTextDelta(messages, ' ', (m) => m);
    expect(withDelta).toHaveLength(2);
    expect(withDelta[1]?.content).toBe(' ');
    const withWord = applyAgentTextDelta(withDelta, 'world', (m) => m);
    expect(withWord[1]?.content).toBe(' world');
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
