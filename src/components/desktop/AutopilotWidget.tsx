import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Power,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useDraggableWidget } from '@/hooks/useDraggableWidget';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { authShieldStyle } from '@/components/ui/authActionStyles';
import * as api from '@/services/api';
import {
  getApprovalQueue,
  type ApprovalQueueEntry,
} from '@/services/access-control';
import { getAttentionItems, getPrimaryAttention, withoutCancelledAuthAttention, withoutPassiveProviderAttention, type AttentionItem } from '@/lib/autopilotAttention';
import {
  AUTH_REQUEST_CANCELLED_EVENT,
  AUTH_REQUEST_STATE_CHANGED_EVENT,
  type AuthRequestCancelledDetail,
  type AuthRequestStateChangedDetail,
} from '@/lib/authRequestState';
import { AGENT_HISTORY_CLEARED_EVENT, type AgentHistoryClearedDetail } from '@/lib/agentUiEvents';
import {
  cancelAuthRequest,
  startAuthRequestWatch,
  updateAuthRequest,
  useAuthRequests,
  type AuthRequestRecord,
} from '@/lib/authRequestCoordinator';

const IDLE_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 5_000;

type ModeCopy = {
  label: string;
  color: string;
  background: string;
  Icon: LucideIcon;
  spin?: boolean;
};

const MODE_COPY: Record<api.AutopilotMode, ModeCopy> = {
  idle: {
    label: 'Idle',
    color: '#94a3b8',
    background: 'rgba(148,163,184,0.12)',
    Icon: CheckCircle2,
  },
  running: {
    label: 'Running',
    color: '#22d3ee',
    background: 'rgba(34,211,238,0.12)',
    Icon: Activity,
  },
  blocked: {
    label: 'Waiting',
    color: '#60a5fa',
    background: 'rgba(96,165,250,0.14)',
    Icon: ShieldAlert,
  },
  recovering: {
    label: 'Recovering',
    color: '#a78bfa',
    background: 'rgba(167,139,250,0.14)',
    Icon: Loader2,
    spin: true,
  },
  degraded: {
    label: 'Degraded',
    color: '#f87171',
    background: 'rgba(248,113,113,0.14)',
    Icon: AlertTriangle,
  },
  disabled: {
    label: 'Off',
    color: '#94a3b8',
    background: 'rgba(148,163,184,0.12)',
    Icon: Power,
  },
};

function formatTool(tool: string | null | undefined): string {
  if (!tool) return 'Thinking';
  return tool
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAge(ts: number | null | undefined): string {
  if (!ts) return 'now';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 1000) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function clampText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function authName(item: AttentionItem): string {
  return item.search || item.title.replace(/^Connect\s+/i, '').trim() || 'this account';
}

function authToolkit(item: AttentionItem): string {
  const sourceToolkit = item.sourceId?.split(':').pop()?.trim();
  return sourceToolkit || item.search || item.title.replace(/^Connect\s+/i, '').trim();
}

function attentionShieldStyle(item: AttentionItem, fallbackColor: string, fallbackBackground: string) {
  if (item.kind === 'auth') return authShieldStyle('primary');
  return {
    color: fallbackColor,
    background: fallbackBackground,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.11), inset 0 -1px 0 rgba(0,0,0,0.18)',
  };
}

function authRequestActions(records: AuthRequestRecord[], hiddenSourceIds: Set<string>): api.PendingUserAction[] {
  const actions: api.PendingUserAction[] = [];
  for (const record of records) {
    if (hiddenSourceIds.has(record.sourceId)) continue;
    if (record.status !== 'pending' && record.status !== 'connecting' && record.status !== 'expired') continue;
    actions.push({
      id: record.pendingActionId || `auth-card:${record.sourceId}`,
      userId: '',
      kind: 'auth',
      sourceId: record.sourceId,
      sessionKey: record.sessionKey || 'default',
      title: `Connect ${record.name}`,
      body: record.description || `Authorize ${record.name} in chat, then I'll continue automatically.`,
      actionUrl: record.actionUrl || '',
      status: record.status === 'expired' ? 'expired' : 'pending',
      metadata: { event: { name: record.name, toolkit: record.toolkit, appId: record.appId } },
      notifyCount: 0,
      maxNotifyCount: 3,
      lastNotifiedAt: null,
      nextNotifyAt: null,
      expiresAt: record.expiresAt ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      resolvedAt: null,
    });
  }
  return actions;
}

export function AutopilotPanel() {
  const agentRunning = useComputerStore((s) => s.agentRunning);
  const activeSessionKey = useComputerStore((s) => s.activeSessionKey);
  const loadSessions = useComputerStore((s) => s.loadSessions);
  const switchSession = useComputerStore((s) => s.switchSession);
  const openWindow = useWindowStore((s) => s.openWindow);
  const spotlightOpen = useWindowStore((s) => s.spotlightOpen);
  const toggleSpotlight = useWindowStore((s) => s.toggleSpotlight);
  const authRequests = useAuthRequests();
  const [status, setStatus] = useState<api.AutopilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalQueueEntry | null>(null);
  const [pendingActions, setPendingActions] = useState<api.PendingUserAction[]>([]);
  const [refreshingActionId, setRefreshingActionId] = useState<string | null>(null);
  const [cancelledAuthSourceIds, setCancelledAuthSourceIds] = useState<Set<string>>(() => new Set());

  async function loadSnapshot(isCancelled?: () => boolean) {
    const [result, pendingResult] = await Promise.all([
      api.getAutopilotStatus(),
      api.getPendingUserActions('all', 12),
    ]);
    if (isCancelled?.()) return;
    setLoading(false);
    if (pendingResult.success) {
      setPendingActions(pendingResult.data.actions.filter((action) => (
        action.status === 'pending' || (action.kind === 'auth' && action.status === 'expired')
      )));
    }
    if (result.success) {
      setStatus(result.data);
      setLastError(null);
      if ((result.data.pendingApprovalCount || 0) > 0) {
        try {
          const queue = await getApprovalQueue('pending');
          if (isCancelled?.()) return;
          setPendingApproval(queue[0] ?? null);
        } catch {
          if (isCancelled?.()) return;
          setPendingApproval(null);
        }
      } else {
        setPendingApproval(null);
      }
    } else {
      setLastError(result.error || 'Unavailable');
      setPendingApproval(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      await loadSnapshot(() => cancelled);
    };

    void poll();
    const interval = setInterval(poll, agentRunning ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agentRunning]);

  useEffect(() => {
    const cancelHandler = (event: Event) => {
      const detail = (event as CustomEvent<AuthRequestCancelledDetail>).detail;
      if (!detail?.sourceId) return;
      setCancelledAuthSourceIds((prev) => {
        if (prev.has(detail.sourceId)) return prev;
        const next = new Set(prev);
        next.add(detail.sourceId);
        return next;
      });
      setPendingActions((actions) => actions.filter((action) => action.sourceId !== detail.sourceId));
    };
    const stateHandler = (event: Event) => {
      const detail = (event as CustomEvent<AuthRequestStateChangedDetail>).detail;
      if (!detail?.sourceId) return;
      if (detail.state === 'pending') {
        setCancelledAuthSourceIds((prev) => {
          if (!prev.has(detail.sourceId)) return prev;
          const next = new Set(prev);
          next.delete(detail.sourceId);
          return next;
        });
        return;
      }
      setCancelledAuthSourceIds((prev) => {
        if (prev.has(detail.sourceId)) return prev;
        const next = new Set(prev);
        next.add(detail.sourceId);
        return next;
      });
      setPendingActions((actions) => actions.filter((action) => action.sourceId !== detail.sourceId));
    };
    const clearHistoryHandler = (event: Event) => {
      const detail = (event as CustomEvent<AgentHistoryClearedDetail>).detail;
      if (detail?.sessionKey) {
        setPendingActions((actions) => actions.filter((action) => action.sessionKey !== detail.sessionKey));
      } else {
        setPendingActions([]);
      }
      setStatus(null);
      setLastError(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_REQUEST_CANCELLED_EVENT, cancelHandler);
    window.addEventListener(AUTH_REQUEST_STATE_CHANGED_EVENT, stateHandler);
    window.addEventListener(AGENT_HISTORY_CLEARED_EVENT, clearHistoryHandler);
    return () => {
      window.removeEventListener(AUTH_REQUEST_CANCELLED_EVENT, cancelHandler);
      window.removeEventListener(AUTH_REQUEST_STATE_CHANGED_EVENT, stateHandler);
      window.removeEventListener(AGENT_HISTORY_CLEARED_EVENT, clearHistoryHandler);
    };
  }, []);

  const visiblePendingActions = useMemo(() => (
    pendingActions.filter((action) => action.kind !== 'auth' || !cancelledAuthSourceIds.has(action.sourceId))
  ), [cancelledAuthSourceIds, pendingActions]);
  const combinedPendingActions = useMemo(() => {
    const actions = [...visiblePendingActions];
    const seenSources = new Set(actions.map((action) => action.sourceId).filter(Boolean));
    for (const action of authRequestActions(authRequests, cancelledAuthSourceIds)) {
      if (seenSources.has(action.sourceId)) continue;
      seenSources.add(action.sourceId);
      actions.push(action);
    }
    return actions;
  }, [authRequests, cancelledAuthSourceIds, visiblePendingActions]);
  const displayStatus = useMemo(() => (
    withoutPassiveProviderAttention(withoutCancelledAuthAttention(status, cancelledAuthSourceIds))
  ), [cancelledAuthSourceIds, status]);

  const mode = displayStatus?.mode ?? (lastError ? 'degraded' : 'idle');
  const rawCopy = MODE_COPY[mode];

  const primaryRun = useMemo(() => {
    if (!displayStatus) return null;
    return displayStatus.runs.find((run) => run.status === 'running' || run.status === 'recovering') ?? displayStatus.runs[0] ?? null;
  }, [displayStatus]);

  const currentGoal = useMemo(() => {
    if (!displayStatus) return null;
    return displayStatus.goals.find((goal) => (
      goal.status === 'active' || goal.status === 'blocked' || goal.status === 'pending'
    )) ?? displayStatus.goals[0] ?? null;
  }, [displayStatus]);

  const currentAction = useMemo(() => {
    if (!displayStatus) return null;
    if (!currentGoal) {
      return displayStatus.actions.find((action) => action.status === 'running' || action.status === 'blocked') ?? displayStatus.actions[0] ?? null;
    }
    return displayStatus.actions.find((action) => action.actionId === currentGoal.currentActionId)
      ?? displayStatus.actions.find((action) => action.goalId === currentGoal.goalId)
      ?? null;
  }, [displayStatus, currentGoal]);

  const summary = lastError
    ? 'Status temporarily unavailable.'
    : displayStatus?.summary || (loading ? 'Checking autonomous work.' : 'No active autonomous work.');
  const currentTool = primaryRun?.activeToolName || primaryRun?.lastToolName || currentAction?.toolName || null;
  const hasActiveRun = !!primaryRun && (primaryRun.status === 'running' || primaryRun.status === 'recovering');
  const attention = getPrimaryAttention({
    status: displayStatus,
    pendingActions: combinedPendingActions,
    hasPendingApproval: Boolean(pendingApproval),
  });
  const attentionItems = getAttentionItems({
    status: displayStatus,
    pendingActions: combinedPendingActions,
    hasPendingApproval: Boolean(pendingApproval),
  });
  const authAttentionItems = attentionItems.filter((item) => item.kind === 'auth');
  const groupedAttentionItems = authAttentionItems.length > 1 ? authAttentionItems : attention ? [attention] : [];
  const hasGroupedAuth = authAttentionItems.length > 1;
  const isWaitingForUser = Boolean(attention && (mode === 'blocked' || combinedPendingActions.length > 0));
  const copy = isWaitingForUser
    ? { ...rawCopy, label: 'Waiting for you', color: '#60a5fa', background: 'rgba(96,165,250,0.14)' }
    : rawCopy;
  const ModeIcon = copy.Icon;
  const friendlySummary = attention
    ? hasGroupedAuth
      ? `${authAttentionItems.length} account connections are waiting.`
      : attention.summary
    : hasActiveRun
      ? summary
      : mode === 'idle'
        ? 'Ready. No active task is running.'
        : summary;
  const headline = attention
    ? hasGroupedAuth ? 'Connections needed' : attention.title
    : hasActiveRun
      ? formatTool(currentTool)
      : copy.label;
  const footerLabel = attention
    ? authAttentionItems.length
      ? `${authAttentionItems.length} action${authAttentionItems.length === 1 ? '' : 's'}`
      : combinedPendingActions.length
        ? `${combinedPendingActions.length} action${combinedPendingActions.length === 1 ? '' : 's'}`
        : displayStatus?.openBlockerCount
          ? `${displayStatus.openBlockerCount} blocker${displayStatus.openBlockerCount === 1 ? '' : 's'}`
        : 'Needs attention'
    : hasActiveRun && primaryRun
      ? formatDuration(primaryRun.elapsedMs)
      : loading
        ? 'Checking'
        : 'No blockers';

  const openSpotlightSession = async (sessionKey?: string) => {
    await loadSessions(true);
    if (sessionKey && sessionKey !== activeSessionKey) {
      await switchSession(sessionKey);
    }
    if (!spotlightOpen) toggleSpotlight();
  };

  const handleAttentionClick = (item: AttentionItem) => {
    if (item.kind === 'auth' && item.ctaLabel === 'Cancel request') {
      handleCancelAttention(item);
      return;
    }
    if (item.kind === 'auth' && item.status === 'expired') {
      setRefreshingActionId(item.id);
      const refresh = async () => {
        if (item.id.startsWith('auth-card:')) {
          const toolkit = authToolkit(item);
          if (item.sourceId?.startsWith('composio:')) {
            const result = await api.getComposioAuthUrl(toolkit, item.sessionKey);
            if (result.success && result.data.url) {
              updateAuthRequest(item.sourceId, {
                actionUrl: result.data.url,
                expiresAt: result.data.expiresAt ?? Date.now() + 10 * 60_000,
                status: 'pending',
              });
              startAuthRequestWatch({
                sourceId: item.sourceId,
                kind: 'composio',
                toolkit,
                name: authName(item),
                sessionKey: item.sessionKey || activeSessionKey || 'default',
              });
              window.open(result.data.url, '_blank', 'noopener,noreferrer');
              return;
            }
          }
          openWindow('app-registry', item.search ? { metadata: { view: 'integrations', search: item.search } } : undefined);
          return;
        }

        const result = await api.resendPendingUserAction(item.id);
        if (result.success) {
          const action = result.data.action;
          setPendingActions((actions) => [action, ...actions.filter((pending) => pending.id !== item.id)]);
          if (item.sourceId) {
            updateAuthRequest(item.sourceId, {
              actionUrl: action.actionUrl || undefined,
              expiresAt: action.expiresAt ?? null,
              pendingActionId: action.id,
              status: action.actionUrl && action.expiresAt && action.expiresAt <= Date.now() ? 'expired' : 'pending',
            });
          }
          if (action.actionUrl) {
            window.open(action.actionUrl, '_blank', 'noopener,noreferrer');
          }
        }
      };
      refresh()
        .finally(() => setRefreshingActionId(null));
      return;
    }
    if (item.destination === 'access-control') {
      openWindow('access-control', item.sourceId ? { metadata: { approvalId: item.sourceId } } : undefined);
      return;
    }
    if (item.destination === 'auth-url' && item.actionUrl) {
      if (item.kind === 'auth' && item.sourceId) {
        startAuthRequestWatch({
          sourceId: item.sourceId,
          kind: item.sourceId.startsWith('app:') ? 'app' : 'composio',
          toolkit: authToolkit(item),
          name: authName(item),
          appId: item.sourceId.startsWith('app:') ? authToolkit(item) : undefined,
          sessionKey: item.sessionKey || activeSessionKey || 'default',
        });
      }
      window.open(item.actionUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.destination === 'app-registry') {
      openWindow('app-registry', item.search ? { metadata: { view: 'integrations', search: item.search } } : undefined);
      return;
    }
    void openSpotlightSession(item.sessionKey);
  };

  const handleCancelAttention = (item: AttentionItem) => {
    if (item.kind !== 'auth') return;
    setPendingActions((actions) => actions.filter((action) => action.id !== item.id));
    if (item.sourceId) {
      setCancelledAuthSourceIds((prev) => {
        if (prev.has(item.sourceId!)) return prev;
        const next = new Set(prev);
        next.add(item.sourceId!);
        return next;
      });
    }
    const toolkit = authToolkit(item);
    if (item.sourceId) {
      cancelAuthRequest({
        sourceId: item.sourceId,
        kind: item.sourceId.startsWith('app:') ? 'app' : 'composio',
        toolkit,
        appId: item.sourceId.startsWith('app:') ? toolkit : undefined,
        sessionKey: item.sessionKey,
        name: authName(item),
      });
    } else {
      void api.resolvePendingUserAction(item.id, 'resolved').catch(() => {});
    }
  };

  return (
    <div
      className="w-[260px] rounded-2xl glass-window border border-black/10 dark:border-white/10 shadow-[var(--shadow-window)] overflow-hidden"
    >
      <div className="px-3.5 pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center min-w-0 gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: copy.background, color: copy.color }}
            >
              <ModeIcon size={15} strokeWidth={2.2} className={copy.spin ? 'animate-spin' : undefined} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wide" style={{ color: 'rgba(255,255,255,0.38)' }}>
                Agent
              </div>
              <div className="text-[13px] font-medium truncate max-w-[160px]" style={{ color: 'rgba(255,255,255,0.78)' }}>
                {clampText(headline, 46)}
              </div>
            </div>
          </div>
          <div
            className="px-2 py-1 rounded-full text-[10px] font-semibold shrink-0"
            style={{ color: copy.color, background: copy.background }}
          >
            {copy.label}
          </div>
        </div>

        <div className="mt-2 text-[12px] leading-snug min-h-[32px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
          {clampText(friendlySummary, 108)}
        </div>

        {groupedAttentionItems.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {groupedAttentionItems.map((item) => {
              const isAuth = item.kind === 'auth';
              const toolkit = authToolkit(item);
              return (
                <span
                  key={item.id}
                  className="group inline-flex max-w-full items-stretch overflow-hidden rounded-[9px] text-[10.5px] font-semibold transition-colors hover:bg-white/[0.035]"
                  style={attentionShieldStyle(item, copy.color, copy.background)}
                >
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleAttentionClick(item);
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-stretch overflow-hidden"
                  >
                    <span className="flex min-h-6 shrink-0 items-center justify-center pl-1.5 pr-0.5 text-current">
                      {isAuth ? (
                        <span className="flex h-[18px] w-[18px] items-center justify-center overflow-hidden bg-transparent">
                          <PlatformIcon platform={toolkit} size={15} className="bg-transparent" />
                        </span>
                      ) : (
                        <ModeIcon size={12} strokeWidth={2.4} />
                      )}
                    </span>
                    <span className="truncate px-2 py-1.5 text-white/76">
                      {refreshingActionId === item.id ? 'Refreshing...' : isAuth && item.status === 'expired' ? 'Retry' : item.ctaLabel}
                    </span>
                  </button>
                  {isAuth && (
                    <button
                      type="button"
                      aria-label={`Cancel ${authName(item)} connection request`}
                      title={`Cancel ${authName(item)} connection request`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCancelAttention(item);
                      }}
                      className="flex min-h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-white/46 transition-colors hover:bg-white/[0.045] hover:text-white/76"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3.5 py-2 flex items-center justify-between border-t border-white/[0.06] text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
        <span className="truncate">{footerLabel}</span>
        <span className="tabular-nums shrink-0">{displayStatus?.generatedAt ? `Updated ${formatAge(displayStatus.generatedAt)}` : loading ? 'Checking' : ''}</span>
      </div>
    </div>
  );
}

export function AutopilotWidget() {
  const { containerStyle, containerProps } = useDraggableWidget('autopilot', 'br');
  const { className: dragClassName, ...dragProps } = containerProps;

  return (
    <div style={containerStyle} {...dragProps} className={`flex flex-col items-center ${dragClassName || ''}`}>
      <AutopilotPanel />
    </div>
  );
}
