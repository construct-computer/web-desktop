export type ComponentMentionDraft = {
  appId: string;
  componentId: string;
};

export function componentMentionSessionKey(sessionKey: string | undefined | null): string {
  return sessionKey || 'default';
}

export function componentMentionsForSession<T extends ComponentMentionDraft>(
  bySession: Record<string, T[]>,
  sessionKey: string | undefined | null,
): T[] {
  return bySession[componentMentionSessionKey(sessionKey)] || [];
}

export function upsertComponentMentionForSession<T extends ComponentMentionDraft>(
  bySession: Record<string, T[]>,
  sessionKey: string | undefined | null,
  mention: T,
): Record<string, T[]> {
  const key = componentMentionSessionKey(sessionKey);
  const current = componentMentionsForSession(bySession, key);
  const exists = current.some((item) => item.appId === mention.appId && item.componentId === mention.componentId);
  return {
    ...bySession,
    [key]: exists
      ? current.map((item) => (
          item.appId === mention.appId && item.componentId === mention.componentId ? mention : item
        ))
      : [...current, mention],
  };
}

export function removeComponentMentionForSession<T extends ComponentMentionDraft>(
  bySession: Record<string, T[]>,
  sessionKey: string | undefined | null,
  appId: string,
  componentId: string,
): Record<string, T[]> {
  const key = componentMentionSessionKey(sessionKey);
  const next = componentMentionsForSession(bySession, key)
    .filter((item) => !(item.appId === appId && item.componentId === componentId));
  const byNext = { ...bySession };
  if (next.length > 0) byNext[key] = next;
  else delete byNext[key];
  return byNext;
}

export function clearComponentMentionsForSession<T extends ComponentMentionDraft>(
  bySession: Record<string, T[]>,
  sessionKey: string | undefined | null,
): Record<string, T[]> {
  const byNext = { ...bySession };
  delete byNext[componentMentionSessionKey(sessionKey)];
  return byNext;
}

