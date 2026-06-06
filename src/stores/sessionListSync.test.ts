import { describe, expect, it } from 'vitest';
import type { SessionInfo } from '@/services/api';
import { sessionInfoFromEvent, touchChatSession, upsertChatSession } from './sessionListSync';

function session(key: string, lastActivity: number, title = 'Chat'): SessionInfo {
  return { key, title, created: 1, lastActivity };
}

describe('sessionListSync', () => {
  it('prepends new sessions on upsert', () => {
    const result = upsertChatSession(
      [session('a', 10), session('b', 5)],
      session('c', 20, 'New'),
    );
    expect(result.map((row) => row.key)).toEqual(['c', 'a', 'b']);
  });

  it('merges and moves existing sessions to the top on upsert', () => {
    const result = upsertChatSession(
      [session('a', 10), session('b', 5)],
      { ...session('b', 99, 'Updated'), created: 2 },
    );
    expect(result[0]?.key).toBe('b');
    expect(result[0]?.title).toBe('Updated');
    expect(result[0]?.lastActivity).toBe(99);
  });

  it('bumps lastActivity and reorders on touch', () => {
    const result = touchChatSession(
      [session('a', 10), session('b', 5)],
      'b',
      50,
    );
    expect(result.map((row) => row.key)).toEqual(['b', 'a']);
    expect(result[0]?.lastActivity).toBe(50);
  });

  it('builds session info from websocket payloads', () => {
    const info = sessionInfoFromEvent({
      sessionKey: 'slack_t1_123',
      title: 'Slack thread',
      created: 100,
      lastActivity: 200,
    });
    expect(info).toEqual({
      key: 'slack_t1_123',
      title: 'Slack thread',
      created: 100,
      lastActivity: 200,
    });
  });
});
