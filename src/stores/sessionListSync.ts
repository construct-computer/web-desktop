import type { SessionInfo } from '@/services/api';

export function upsertChatSession(sessions: SessionInfo[], session: SessionInfo): SessionInfo[] {
  const existingIndex = sessions.findIndex((row) => row.key === session.key);
  if (existingIndex === -1) {
    return [session, ...sessions];
  }
  const next = [...sessions];
  next[existingIndex] = { ...next[existingIndex], ...session };
  const [row] = next.splice(existingIndex, 1);
  return [row, ...next];
}

export function touchChatSession(
  sessions: SessionInfo[],
  sessionKey: string,
  lastActivity: number = Date.now(),
): SessionInfo[] {
  const index = sessions.findIndex((row) => row.key === sessionKey);
  if (index === -1) return sessions;
  const next = [...sessions];
  const [row] = next.splice(index, 1);
  return [{ ...row, lastActivity }, ...next];
}

export function sessionInfoFromEvent(data: Record<string, unknown> | undefined, fallbackTitle = 'New Chat'): SessionInfo | null {
  if (!data) return null;
  const sessionKey = typeof data.sessionKey === 'string' ? data.sessionKey : undefined;
  if (!sessionKey) return null;
  const now = Date.now();
  const created = typeof data.created === 'number' ? data.created : now;
  const lastActivity = typeof data.lastActivity === 'number' ? data.lastActivity : created;
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : fallbackTitle;
  const platform = typeof data.platform === 'string' ? data.platform : undefined;
  const readOnly = typeof data.readOnly === 'boolean' ? data.readOnly : undefined;
  const origin = data.origin && typeof data.origin === 'object' && !Array.isArray(data.origin)
    ? data.origin as Record<string, unknown>
    : null;
  const platformRef = data.platformRef && typeof data.platformRef === 'object' && !Array.isArray(data.platformRef)
    ? data.platformRef as Record<string, unknown>
    : null;
  return {
    key: sessionKey,
    title,
    ...(platform ? { platform } : {}),
    ...(readOnly !== undefined ? { readOnly } : {}),
    ...(origin ? { origin } : {}),
    ...(platformRef ? { platformRef } : {}),
    created,
    lastActivity,
  };
}
