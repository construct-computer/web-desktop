import type { SessionInfo } from '@/services/api';

const RESERVED_SESSION_KEY = 'overseer';

export function resolveLoadedSessions(
  sessions: SessionInfo[],
  serverActiveKey: string | undefined,
  preserveActiveKey?: string,
): { sessions: SessionInfo[]; activeKey: string } {
  const visibleSessions = sessions.filter((session) => session.key !== RESERVED_SESSION_KEY);
  let activeKey = serverActiveKey || visibleSessions[0]?.key || 'default';

  if (activeKey === RESERVED_SESSION_KEY) {
    activeKey = visibleSessions[0]?.key || 'default';
  }

  if (preserveActiveKey && visibleSessions.some((session) => session.key === preserveActiveKey)) {
    activeKey = preserveActiveKey;
  }

  if (!visibleSessions.some((session) => session.key === activeKey)) {
    activeKey = visibleSessions[0]?.key || 'default';
  }

  return { sessions: visibleSessions, activeKey };
}
