import type {
  AutopilotBlockerSnapshot,
  AutopilotStatus,
  PendingUserAction,
  SessionInfo,
} from '@/services/api';

export type AttentionDestination =
  | 'access-control'
  | 'app-registry'
  | 'auth-url'
  | 'spotlight-session'
  | 'spotlight';

export interface AttentionItem {
  id: string;
  kind: 'approval' | 'auth' | 'question' | 'blocker' | 'dead-letter' | 'verification' | 'side-effect' | 'provider' | 'gate';
  title: string;
  summary: string;
  ctaLabel: string;
  destination: AttentionDestination;
  sessionKey?: string;
  actionUrl?: string;
  sourceId?: string;
  search?: string;
  createdAt: number;
  expiresAt?: number | null;
  status?: PendingUserAction['status'];
}

export interface AttentionSessionRow extends SessionInfo {
  attention: true;
  attentionLabel: string;
}

const DEFAULT_BLOCKED_TITLE = 'Blocked task';

function clampText(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function textFromMetadata(action: PendingUserAction, key: string): string | undefined {
  const event = action.metadata?.event;
  if (event && typeof event === 'object' && key in event) {
    const value = (event as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
  const value = action.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function authDisplayName(action: PendingUserAction): string {
  const fromTitle = action.title.replace(/^connect\s+/i, '').trim();
  return textFromMetadata(action, 'name')
    || textFromMetadata(action, 'toolkit')
    || textFromMetadata(action, 'appId')
    || fromTitle
    || 'account';
}

function actionSummary(action: PendingUserAction): string {
  return clampText(
    action.body
      .replace(/^https?:\/\/\S+$/gm, '')
      .replace(/\n{2,}/g, ' ')
      .trim()
      || action.title
      || 'The agent needs your attention before it can continue.',
    110,
  );
}

function openBlockers(status: AutopilotStatus | null | undefined): AutopilotBlockerSnapshot[] {
  return [...(status?.blockers?.filter((blocker) => blocker.status === 'open') ?? [])]
    .sort((a, b) => b.createdAt - a.createdAt);
}

function blockerAuthName(blocker: AutopilotBlockerSnapshot): string {
  const fromRequired = blocker.requiredFrom?.trim();
  if (fromRequired) return fromRequired;
  const sourceName = blocker.sourceId?.replace(/^(app|composio):/i, '').replace(/[_-]+/g, ' ').trim();
  if (sourceName) return sourceName.replace(/\b\w/g, (char) => char.toUpperCase());
  return 'connection';
}

export function getPrimaryAttention(input: {
  status?: AutopilotStatus | null;
  pendingActions?: PendingUserAction[];
  hasPendingApproval?: boolean;
}): AttentionItem | null {
  return getAttentionItems(input)[0] ?? null;
}

function fallbackModeAfterAttentionRemoved(status: AutopilotStatus): AutopilotStatus['mode'] {
  if (
    status.activeRunCount > 0
    || status.activeGoalCount > 0
    || status.activeTaskCount > 0
    || status.activeBackgroundAgentCount > 0
  ) {
    return 'running';
  }
  return status.autopilotEnabled ? 'idle' : 'disabled';
}

export function withoutCancelledAuthAttention(
  status: AutopilotStatus | null,
  cancelledSourceIds: Set<string>,
): AutopilotStatus | null {
  if (!status || cancelledSourceIds.size === 0) return status;

  const blockers = status.blockers.filter((blocker) => (
    blocker.kind !== 'awaiting_auth' || !blocker.sourceId || !cancelledSourceIds.has(blocker.sourceId)
  ));
  const toolReliability = status.toolReliability.filter((item) => !cancelledSourceIds.has(item.providerKey));
  const openBlockerCount = blockers.filter((blocker) => blocker.status === 'open').length;
  const blockedToolProviderCount = toolReliability.filter((item) => item.status === 'blocked').length;
  const degradedToolProviderCount = toolReliability.filter((item) => item.status === 'degraded').length;

  const removedOnlyOpenBlockers = status.openBlockerCount > 0 && openBlockerCount === 0;
  const removedOnlyProviderIssue = (
    status.toolReliability.length > 0
    && toolReliability.length === 0
    && status.deadLetterCount === 0
    && status.unresolvedSideEffectCount === 0
    && status.verificationPendingCount === 0
  );
  const shouldClearMode = (
    (status.mode === 'blocked' && removedOnlyOpenBlockers)
    || (status.mode === 'degraded' && removedOnlyProviderIssue)
  );

  return {
    ...status,
    blockers,
    toolReliability,
    openBlockerCount,
    blockedToolProviderCount,
    degradedToolProviderCount,
    mode: shouldClearMode ? fallbackModeAfterAttentionRemoved(status) : status.mode,
    summary: shouldClearMode ? 'Ready. No active task is running.' : status.summary,
  };
}

export function withoutPassiveProviderAttention(status: AutopilotStatus | null): AutopilotStatus | null {
  if (!status) return status;
  const hasActionableAttention = (
    status.openBlockerCount > 0
    || status.deadLetterCount > 0
    || status.unresolvedSideEffectCount > 0
    || status.verificationPendingCount > 0
    || status.pendingApprovalCount > 0
  );
  const hasPassiveDegradedIncident = status.mode === 'degraded' && status.incidents.some((incident) => (
    incident.severity === 'info' && incident.recoverability === 'degraded'
  ));
  if (status.toolReliability.length === 0 && !hasPassiveDegradedIncident) return status;
  if (hasActionableAttention) return status;
  return {
    ...status,
    toolReliability: [],
    blockedToolProviderCount: 0,
    degradedToolProviderCount: 0,
    mode: status.mode === 'degraded' ? fallbackModeAfterAttentionRemoved(status) : status.mode,
    summary: status.mode === 'degraded' ? 'Ready. No active task is running.' : status.summary,
  };
}

export function getAttentionItems(input: {
  status?: AutopilotStatus | null;
  pendingActions?: PendingUserAction[];
  hasPendingApproval?: boolean;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const seenAuthSources = new Set<string>();

  for (const pending of input.pendingActions ?? []) {
    if (pending.kind === 'auth') {
      const name = authDisplayName(pending);
      if (pending.sourceId) seenAuthSources.add(pending.sourceId);
      items.push({
        id: pending.id,
        kind: 'auth',
        title: `Connect ${name}`,
        summary: `Waiting for ${name} connection.`,
        ctaLabel: `Connect ${name}`,
        destination: pending.actionUrl ? 'auth-url' : 'app-registry',
        sessionKey: pending.sessionKey,
        actionUrl: pending.actionUrl || undefined,
        sourceId: pending.sourceId,
        search: name,
        createdAt: pending.updatedAt || pending.createdAt,
        expiresAt: pending.expiresAt,
        status: pending.status,
      });
      continue;
    }

    if (pending.kind === 'approval') {
      items.push({
        id: pending.id,
        kind: 'approval',
        title: pending.title || 'Approval needed',
        summary: actionSummary(pending),
        ctaLabel: 'Review approval',
        destination: 'access-control',
        sessionKey: pending.sessionKey,
        sourceId: pending.sourceId,
        createdAt: pending.updatedAt || pending.createdAt,
      });
      continue;
    }

    items.push({
      id: pending.id,
      kind: 'question',
      title: pending.title || 'Input needed',
      summary: actionSummary(pending),
      ctaLabel: 'Answer',
      destination: 'spotlight-session',
      sessionKey: pending.sessionKey,
      sourceId: pending.sourceId,
      createdAt: pending.updatedAt || pending.createdAt,
    });
  }

  if (input.hasPendingApproval || (input.status?.pendingApprovalCount ?? 0) > 0) {
    items.push({
      id: 'approval',
      kind: 'approval',
      title: 'Approval needed',
      summary: 'A request is waiting in Access Control.',
      ctaLabel: 'Review approval',
      destination: 'access-control',
      createdAt: input.status?.generatedAt ?? Date.now(),
    });
  }

  let fallbackBlocker: AutopilotBlockerSnapshot | null = null;
  for (const blocker of openBlockers(input.status)) {
    if (blocker.kind === 'awaiting_auth') {
      const key = blocker.sourceId || `blocker:${blocker.blockerId}`;
      if (seenAuthSources.has(key)) continue;
      seenAuthSources.add(key);
      const name = blockerAuthName(blocker);
      items.push({
        id: blocker.blockerId,
        kind: 'auth',
        title: name === 'connection' ? 'Connection request' : `Connect ${name}`,
        summary: clampText(blocker.summary || `Waiting for ${name}.`, 110),
        ctaLabel: 'Cancel request',
        destination: 'spotlight-session',
        sessionKey: blocker.sessionKey,
        sourceId: blocker.sourceId || undefined,
        search: name,
        createdAt: blocker.createdAt,
      });
      continue;
    }
    fallbackBlocker ??= blocker;
  }

  if (fallbackBlocker) {
    items.push({
      id: fallbackBlocker.blockerId,
      kind: 'blocker',
      title: fallbackBlocker.requiredFrom || DEFAULT_BLOCKED_TITLE,
      summary: clampText(fallbackBlocker.summary || 'The agent is blocked.', 110),
      ctaLabel: 'Open blocked chat',
      destination: 'spotlight-session',
      sessionKey: fallbackBlocker.sessionKey,
      sourceId: fallbackBlocker.sourceId || fallbackBlocker.actionId || undefined,
      createdAt: fallbackBlocker.createdAt,
    });
  }

  const deadLetter = input.status?.actions?.find((action) => action.status === 'dead_lettered');
  if (deadLetter) {
    items.push({
      id: deadLetter.actionId,
      kind: 'dead-letter',
      title: 'Retry limit reached',
      summary: clampText(deadLetter.title || deadLetter.lastError || 'An autonomous action stopped retrying.', 110),
      ctaLabel: 'Open blocked chat',
      destination: 'spotlight-session',
      sessionKey: deadLetter.sessionKey,
      sourceId: deadLetter.actionId,
      createdAt: deadLetter.updatedAt || deadLetter.createdAt,
    });
  }

  if ((input.status?.verificationPendingCount ?? 0) > 0) {
    items.push({
      id: 'verification',
      kind: 'verification',
      title: 'Verification needed',
      summary: 'A completed action is waiting for verification.',
      ctaLabel: 'Open chat',
      destination: 'spotlight',
      createdAt: input.status?.generatedAt ?? Date.now(),
    });
  }

  if ((input.status?.unresolvedSideEffectCount ?? 0) > 0) {
    items.push({
      id: 'side-effect',
      kind: 'side-effect',
      title: 'Check recent action',
      summary: 'The agent needs confirmation before retrying.',
      ctaLabel: 'Open chat',
      destination: 'spotlight',
      createdAt: input.status?.generatedAt ?? Date.now(),
    });
  }

  const providerCount = (input.status?.blockedToolProviderCount ?? 0) + (input.status?.degradedToolProviderCount ?? 0);
  if (providerCount > 0) {
    items.push({
      id: 'provider',
      kind: 'provider',
      title: 'Provider needs attention',
      summary: 'A connected provider is blocked or degraded.',
      ctaLabel: 'Open chat',
      destination: 'spotlight',
      createdAt: input.status?.generatedAt ?? Date.now(),
    });
  }

  return items;
}

export function mergeAttentionSessions(
  sessions: SessionInfo[],
  input: {
    status?: AutopilotStatus | null;
    pendingActions?: PendingUserAction[];
  },
): Array<SessionInfo | AttentionSessionRow> {
  const byKey = new Map<string, SessionInfo | AttentionSessionRow>();
  for (const session of sessions) byKey.set(session.key, session);

  const add = (sessionKey: string | undefined, title: string, createdAt: number) => {
    if (!sessionKey || sessionKey === 'overseer' || byKey.has(sessionKey)) return;
    byKey.set(sessionKey, {
      key: sessionKey,
      title: clampText(title || DEFAULT_BLOCKED_TITLE, 48),
      created: createdAt,
      lastActivity: createdAt,
      attention: true,
      attentionLabel: 'Needs attention',
    });
  };

  for (const action of input.pendingActions ?? []) {
    add(action.sessionKey, action.title || (action.kind === 'auth' ? `Connect ${authDisplayName(action)}` : 'Needs attention'), action.updatedAt || action.createdAt);
  }

  for (const blocker of input.status?.blockers ?? []) {
    if (blocker.status !== 'open') continue;
    add(blocker.sessionKey, blocker.summary || DEFAULT_BLOCKED_TITLE, blocker.createdAt);
  }

  for (const action of input.status?.actions ?? []) {
    if (action.status !== 'blocked' && action.status !== 'dead_lettered') continue;
    add(action.sessionKey, action.title || DEFAULT_BLOCKED_TITLE, action.updatedAt || action.createdAt);
  }

  return [...byKey.values()];
}

export function isAttentionSession(session: SessionInfo | AttentionSessionRow): session is AttentionSessionRow {
  return 'attention' in session && session.attention === true;
}
