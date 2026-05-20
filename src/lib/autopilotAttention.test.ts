import { describe, expect, it } from 'vitest';
import {
  getAttentionItems,
  getPrimaryAttention,
  isAttentionSession,
  mergeAttentionSessions,
  withoutCancelledAuthAttention,
  withoutPassiveProviderAttention,
} from './autopilotAttention';
import type { AutopilotStatus, PendingUserAction } from '@/services/api';

const NOW = 1_700_000_000_000;

function pendingAction(overrides: Partial<PendingUserAction>): PendingUserAction {
  return {
    id: 'action_1',
    userId: 'user_1',
    kind: 'auth',
    sourceId: 'composio:gmail',
    sessionKey: 'session_1',
    title: 'Connect Gmail',
    body: 'Connect Gmail so the agent can continue.',
    actionUrl: 'https://auth.example.test',
    status: 'pending',
    metadata: {},
    notifyCount: 0,
    maxNotifyCount: 3,
    lastNotifiedAt: null,
    nextNotifyAt: null,
    expiresAt: null,
    createdAt: NOW - 1000,
    updatedAt: NOW,
    resolvedAt: null,
    ...overrides,
  };
}

function autopilotStatus(overrides: Partial<AutopilotStatus>): AutopilotStatus {
  return {
    mode: 'blocked',
    summary: 'Blocked',
    activeRunCount: 0,
    activeGoalCount: 0,
    openBlockerCount: 0,
    pendingActionCount: 0,
    retryingActionCount: 0,
    deadLetterCount: 0,
    verificationPendingCount: 0,
    unresolvedSideEffectCount: 0,
    blockedToolProviderCount: 0,
    degradedToolProviderCount: 0,
    activeDecisionCount: 0,
    activeTaskCount: 0,
    blockedTaskCount: 0,
    activeBackgroundAgentCount: 0,
    pendingApprovalCount: 0,
    runs: [],
    goals: [],
    actions: [],
    blockers: [],
    tasks: [],
    backgroundAgents: [],
    incidents: [],
    controlEvents: [],
    autonomyGates: [],
    workSideEffects: [],
    workVerifications: [],
    toolReliability: [],
    decisions: [],
    latestMessageAt: null,
    pausedSessionCount: 0,
    autonomyMode: 'standard',
    autopilotEnabled: true,
    generatedAt: NOW,
    ...overrides,
  };
}

describe('autopilot attention helpers', () => {
  it('turns a Gmail auth pending action into a connect CTA', () => {
    const attention = getPrimaryAttention({
      pendingActions: [
        pendingAction({
          metadata: { event: { name: 'Gmail', toolkit: 'gmail' } },
        }),
      ],
    });

    expect(attention?.kind).toBe('auth');
    expect(attention?.title).toBe('Connect Gmail');
    expect(attention?.ctaLabel).toBe('Connect Gmail');
    expect(attention?.destination).toBe('auth-url');
  });

  it('keeps multiple auth connection requests available together', () => {
    const items = getAttentionItems({
      pendingActions: [
        pendingAction({
          id: 'gmail',
          metadata: { event: { name: 'Gmail', toolkit: 'gmail' } },
        }),
        pendingAction({
          id: 'sheets',
          metadata: { event: { name: 'Google Sheets', toolkit: 'google_sheets' } },
        }),
      ],
    });

    expect(items.map((item) => item.ctaLabel)).toEqual(['Connect Gmail', 'Connect Google Sheets']);
  });

  it('adds a fallback sidebar row for an open blocker whose session is missing', () => {
    const status = autopilotStatus({
      openBlockerCount: 1,
      blockers: [{
        blockerId: 'blocker_1',
        goalId: 'goal_1',
        actionId: 'action_1',
        sessionKey: 'blocked_session',
        kind: 'awaiting_auth',
        status: 'open',
        summary: 'Waiting for Gmail connection before retrying.',
        requiredFrom: 'Gmail',
        sourceId: 'composio:gmail',
        sourceKind: 'auth_connect',
        createdAt: NOW - 500,
        resolvedAt: null,
      }],
    });

    const rows = mergeAttentionSessions(
      [{ key: 'default', title: 'Default', created: NOW - 5000, lastActivity: NOW - 5000 }],
      { status, pendingActions: [] },
    );

    const fallback = rows.find((row) => row.key === 'blocked_session');
    expect(fallback).toBeTruthy();
    expect(fallback && isAttentionSession(fallback)).toBe(true);
    expect(fallback?.title).toContain('Waiting for Gmail');
  });

  it('surfaces auth blockers as cancellable auth attention', () => {
    const attention = getPrimaryAttention({
      status: autopilotStatus({
        openBlockerCount: 1,
        blockers: [{
          blockerId: 'blocker_1',
          goalId: 'goal_1',
          actionId: 'action_1',
          sessionKey: 'blocked_session',
          kind: 'awaiting_auth',
          status: 'open',
          summary: 'Waiting for Gmail connection before retrying.',
          requiredFrom: 'Gmail',
          sourceId: 'composio:gmail',
          sourceKind: 'auth_connect',
          createdAt: NOW - 500,
          resolvedAt: null,
        }],
      }),
    });

    expect(attention?.kind).toBe('auth');
    expect(attention?.ctaLabel).toBe('Cancel request');
    expect(attention?.sourceId).toBe('composio:gmail');
  });

  it('keeps multiple auth blockers available together', () => {
    const items = getAttentionItems({
      status: autopilotStatus({
        openBlockerCount: 2,
        blockers: [
          {
            blockerId: 'blocker_gmail',
            goalId: 'goal_1',
            actionId: 'action_1',
            sessionKey: 'blocked_session',
            kind: 'awaiting_auth',
            status: 'open',
            summary: 'Waiting for Gmail connection before retrying.',
            requiredFrom: 'Gmail',
            sourceId: 'composio:gmail',
            sourceKind: 'auth_connect',
            createdAt: NOW - 500,
            resolvedAt: null,
          },
          {
            blockerId: 'blocker_docs',
            goalId: 'goal_1',
            actionId: 'action_2',
            sessionKey: 'blocked_session',
            kind: 'awaiting_auth',
            status: 'open',
            summary: 'Waiting for Google Docs connection.',
            requiredFrom: 'Google Docs',
            sourceId: 'composio:google_docs',
            sourceKind: 'auth_connect',
            createdAt: NOW - 400,
            resolvedAt: null,
          },
        ],
      }),
    });

    expect(items.filter((item) => item.kind === 'auth').map((item) => item.title)).toEqual([
      'Connect Google Docs',
      'Connect Gmail',
    ]);
  });

  it('suppresses cancelled auth provider degradation', () => {
    const status = withoutCancelledAuthAttention(
      autopilotStatus({
        mode: 'degraded',
        blockedToolProviderCount: 1,
        degradedToolProviderCount: 0,
        toolReliability: [{
          sessionKey: 'session_1',
          providerKey: 'composio:gmail',
          toolName: 'composio',
          operationKey: 'gmail_fetch_emails',
          status: 'blocked',
          problemCount: 1,
          errorClasses: ['auth_required'],
          summary: 'Gmail needs auth.',
          recoveryHint: null,
          createdAt: NOW,
        }],
      }),
      new Set(['composio:gmail']),
    );

    expect(status?.toolReliability).toEqual([]);
    expect(status?.blockedToolProviderCount).toBe(0);
    expect(status?.mode).toBe('idle');
    expect(getAttentionItems({ status }).map((item) => item.kind)).not.toContain('provider');
  });

  it('suppresses passive provider degradation when nothing is actionable', () => {
    const status = withoutPassiveProviderAttention(autopilotStatus({
      mode: 'degraded',
      blockedToolProviderCount: 0,
      degradedToolProviderCount: 1,
      toolReliability: [{
        sessionKey: 'session_1',
        providerKey: 'composio:gmail',
        toolName: 'composio',
        operationKey: 'gmail_fetch_emails',
        status: 'degraded',
        problemCount: 1,
        errorClasses: ['tool_runtime_error'],
        summary: 'Recent Gmail tool error.',
        recoveryHint: null,
        createdAt: NOW,
      }],
    }));

    expect(status?.toolReliability).toEqual([]);
    expect(status?.degradedToolProviderCount).toBe(0);
    expect(status?.mode).toBe('idle');
    expect(getAttentionItems({ status }).map((item) => item.kind)).not.toContain('provider');
  });

  it('suppresses passive provider degradation even when a recent incident exists', () => {
    const status = withoutPassiveProviderAttention(autopilotStatus({
      mode: 'degraded',
      blockedToolProviderCount: 1,
      toolReliability: [{
        sessionKey: 'session_1',
        providerKey: 'capability:docs.get',
        toolName: 'capability',
        operationKey: 'call',
        status: 'blocked',
        problemCount: 1,
        errorClasses: ['auth_required'],
        summary: 'Google Docs needed auth before the request was cancelled.',
        recoveryHint: null,
        createdAt: NOW,
      }],
      incidents: [{
        incidentId: 'inc_1',
        kind: 'degraded',
        severity: 'error',
        recoverability: 'degraded',
        message: 'Provider was degraded.',
        toolName: 'capability',
        sessionKey: 'session_1',
        createdAt: NOW,
      }],
    }));

    expect(status?.toolReliability).toEqual([]);
    expect(status?.blockedToolProviderCount).toBe(0);
    expect(status?.mode).toBe('idle');
    expect(getAttentionItems({ status }).map((item) => item.kind)).not.toContain('provider');
  });

  it('suppresses info-only degraded incidents when there is no actionable attention', () => {
    const status = withoutPassiveProviderAttention(autopilotStatus({
      mode: 'degraded',
      summary: 'Tool "composio" reported a limitation.',
      incidents: [{
        incidentId: 'inc_1',
        kind: 'capability_unavailable',
        severity: 'info',
        recoverability: 'degraded',
        message: 'Tool "composio" reported a limitation.',
        toolName: 'composio',
        sessionKey: 'session_1',
        createdAt: NOW,
      }],
    }));

    expect(status?.mode).toBe('idle');
    expect(status?.summary).toBe('Ready. No active task is running.');
    expect(getAttentionItems({ status }).map((item) => item.kind)).not.toContain('provider');
  });

  it('does not duplicate an existing session when it also needs attention', () => {
    const existing = { key: 'session_1', title: 'Inbox task', created: NOW - 5000, lastActivity: NOW - 500 };
    const rows = mergeAttentionSessions([existing], {
      pendingActions: [pendingAction({ sessionKey: 'session_1' })],
    });

    expect(rows.filter((row) => row.key === 'session_1')).toHaveLength(1);
    expect(isAttentionSession(rows[0])).toBe(false);
  });

  it('chooses destination types for approval, question, and app-registry auth', () => {
    expect(getPrimaryAttention({
      pendingActions: [pendingAction({ kind: 'approval', actionUrl: '', title: 'Approve tool' })],
    })?.destination).toBe('access-control');

    expect(getPrimaryAttention({
      pendingActions: [pendingAction({ kind: 'question', actionUrl: '', title: 'Input needed' })],
    })?.destination).toBe('spotlight-session');

    expect(getPrimaryAttention({
      pendingActions: [pendingAction({ kind: 'auth', actionUrl: '', title: 'Connect Gmail' })],
    })?.destination).toBe('app-registry');
  });
});
