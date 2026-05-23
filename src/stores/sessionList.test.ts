import { describe, expect, it } from 'vitest';
import type { SessionInfo } from '@/services/api';
import { resolveLoadedSessions } from './sessionList';

function session(key: string, title = 'New Chat'): SessionInfo {
  return { key, title, created: 1, lastActivity: 1 };
}

describe('resolveLoadedSessions', () => {
  it('preserves a newly-created active session when the backend returns it', () => {
    const result = resolveLoadedSessions(
      [session('older', 'Older'), session('new-session')],
      'older',
      'new-session',
    );

    expect(result.activeKey).toBe('new-session');
    expect(result.sessions.map((s) => s.key)).toEqual(['older', 'new-session']);
  });

  it('ignores overseer and falls back to a visible session', () => {
    const result = resolveLoadedSessions(
      [session('overseer'), session('default')],
      'overseer',
    );

    expect(result.activeKey).toBe('default');
    expect(result.sessions.map((s) => s.key)).toEqual(['default']);
  });

  it('does not preserve a session key missing from the loaded list', () => {
    const result = resolveLoadedSessions(
      [session('existing')],
      'existing',
      'deleted-new-chat',
    );

    expect(result.activeKey).toBe('existing');
  });
});
