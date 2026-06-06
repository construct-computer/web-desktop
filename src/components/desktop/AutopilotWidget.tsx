import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Loader2,
  ListChecks,
  Mail,
  MessageCircle,
  RefreshCw,
  Repeat,
  ShieldAlert,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useBillingStore } from '@/stores/billingStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useDraggableWidget } from '@/hooks/useDraggableWidget';
import { useUpcomingCalendarEvent } from '@/hooks/useUpcomingCalendarEvent';
import { openSettingsToSection } from '@/lib/settingsNav';
import { openSpotlightSession } from '@/lib/spotlightNav';
import { openAuthRedirect } from '@/lib/utils';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { InfoHint } from '@/components/ui';
import { authShieldStyle } from '@/components/ui/authActionStyles';
import * as api from '@/services/api';
import {
  getApprovalQueue,
  type ApprovalQueueEntry,
} from '@/services/access-control';
import { formatLearnedPolicyDisplay } from '@/lib/learnedPolicyDisplay';
import { getAttentionItems, getPrimaryAttention, withoutCancelledAuthAttention, withoutPassiveProviderAttention, type AttentionItem } from '@/lib/autopilotAttention';
import {
  AUTH_REQUEST_CANCELLED_EVENT,
  AUTH_REQUEST_STATE_CHANGED_EVENT,
  type AuthRequestCancelledDetail,
  type AuthRequestStateChangedDetail,
} from '@/lib/authRequestState';
import {
  AGENT_HISTORY_CLEARED_EVENT,
  WORK_ORDER_UPDATED_EVENT,
  type AgentHistoryClearedDetail,
  type WorkOrderUpdatedDetail,
} from '@/lib/agentUiEvents';
import {
  cancelAuthRequest,
  startAuthRequestWatch,
  updateAuthRequest,
  useAuthRequests,
  type AuthRequestRecord,
} from '@/lib/authRequestCoordinator';

const IDLE_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 5_000;
const ACTIVE_WORK_ORDER_STATUSES = new Set(['active', 'waiting', 'blocked']);

/** Routine chat turns get a ledger work order on the backend — not background/autonomous work. */
function isAutonomousWorkOrder(order: api.AutopilotWorkOrderSnapshot): boolean {
  return order.sourceType !== 'user_message';
}

type ModeCopy = {
  label: string;
  color: string;
  background: string;
  Icon: LucideIcon;
  spin?: boolean;
};

type IdleGlanceItem = {
  id: string;
  Icon: LucideIcon;
  label: string;
  value: string;
  onClick?: () => void;
};

type ActiveTraceItem = {
  id: string;
  Icon: LucideIcon;
  label: string;
  value: string;
};

const MODE_COPY: Record<api.AutopilotMode, ModeCopy> = {
  idle: {
    label: 'Ready',
    color: '#94a3b8',
    background: 'rgba(148,163,184,0.12)',
    Icon: CheckCircle2,
  },
  running: {
    label: 'Working',
    color: '#22d3ee',
    background: 'rgba(34,211,238,0.12)',
    Icon: Activity,
  },
  blocked: {
    label: 'Needs you',
    color: '#60a5fa',
    background: 'rgba(96,165,250,0.14)',
    Icon: ShieldAlert,
  },
  recovering: {
    label: 'Working',
    color: '#a78bfa',
    background: 'rgba(167,139,250,0.14)',
    Icon: Loader2,
    spin: true,
  },
  degraded: {
    label: 'Issue',
    color: '#f87171',
    background: 'rgba(248,113,113,0.14)',
    Icon: AlertTriangle,
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

function cleanWidgetText(text: string | null | undefined, limit = 74): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clampText(clean, limit);
}

function canonicalTraceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|current|agent|run|task|work|goal)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDuplicateTraceValue(a: string, b: string): boolean {
  const left = canonicalTraceText(a);
  const right = canonicalTraceText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const min = Math.min(left.length, right.length);
  return min >= 32 && (left.startsWith(right.slice(0, min)) || right.startsWith(left.slice(0, min)));
}

function formatLedgerStatus(status: string | null | undefined): string {
  return (status || 'unknown')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatScheduleDue(value: string | null | undefined): string {
  if (!value) return 'no next run';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return 'scheduled';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const prefix = diff >= 0 ? 'in ' : 'due ';
  if (abs < 60_000) return diff >= 0 ? 'now' : 'due now';
  if (abs < 60 * 60_000) return `${prefix}${Math.round(abs / 60_000)}m`;
  if (abs < 24 * 60 * 60_000) return `${prefix}${Math.round(abs / 60 / 60_000)}h`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatPolicyFlags(policy: Record<string, unknown> | null | undefined): string {
  if (!policy) return '';
  return Object.entries(policy)
    .filter(([, value]) => value === true || typeof value === 'string')
    .map(([key, value]) => value === true ? key : `${key}:${String(value)}`)
    .slice(0, 2)
    .join(', ')
    .replace(/[_-]/g, ' ');
}

function isGenericActionTitle(text: string | null | undefined): boolean {
  return /^(complete|continue|resume)\s+(the\s+)?(current\s+)?agent\s+run\.?$/i.test((text || '').trim());
}

function isNoisyProgressReason(text: string | null | undefined): boolean {
  return /^loop:(heartbeat|tick|poll)$/i.test((text || '').trim());
}

function formatEventTime(event: api.AgentCalendarEvent): string {
  if (event.allDay) return 'All day';
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return 'Upcoming';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const day = start.toDateString() === today.toDateString()
    ? 'Today'
    : start.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : start.toLocaleDateString(undefined, { weekday: 'short' });
  return `${day} ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function resetHint(usage: api.CurrentUsage | null): string | null {
  if (!usage) return null;
  const maxPct = Math.max(usage.weeklyPercentUsed || 0, usage.monthlyPercentUsed || 0, usage.sessionPercentUsed || 0);
  if (maxPct < 70) return null;
  if (usage.weeklyPercentUsed >= usage.monthlyPercentUsed && usage.weeklyPercentUsed >= usage.sessionPercentUsed) {
    return `Weekly usage ${Math.round(usage.weeklyPercentUsed)}%`;
  }
  if (usage.sessionPercentUsed >= usage.monthlyPercentUsed) {
    return `Session usage ${Math.round(usage.sessionPercentUsed)}%`;
  }
  return `Monthly usage ${Math.round(usage.monthlyPercentUsed)}%`;
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
      body: record.description || `Sign in to ${record.name} in chat, then Construct will continue automatically.`,
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
  const agentDisplayName = useComputerStore(
    (s) => s.computer?.config?.identityName?.trim() || 'Construct',
  );
  const activeSessionKey = useComputerStore((s) => s.activeSessionKey);
  const chatSessions = useComputerStore((s) => s.chatSessions);
  const emailUnreadCount = useComputerStore((s) => s.emailUnreadCount);
  const openWindow = useWindowStore((s) => s.openWindow);
  const updateWindow = useWindowStore((s) => s.updateWindow);
  const windows = useWindowStore((s) => s.windows);
  const unreadNotificationCount = useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);
  const openNotificationDrawer = useNotificationStore((s) => s.openDrawer);
  const usage = useBillingStore((s) => s.usage);
  const fetchUsage = useBillingStore((s) => s.fetchUsage);
  const authRequests = useAuthRequests();
  const [status, setStatus] = useState<api.AutopilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalQueueEntry | null>(null);
  const [pendingActions, setPendingActions] = useState<api.PendingUserAction[]>([]);
  const [refreshingActionId, setRefreshingActionId] = useState<string | null>(null);
  const [expiringPolicyId, setExpiringPolicyId] = useState<number | null>(null);
  const [expirePolicyError, setExpirePolicyError] = useState<string | null>(null);
  const [cancelledAuthSourceIds, setCancelledAuthSourceIds] = useState<Set<string>>(() => new Set());
  const nextEvent = useUpcomingCalendarEvent();

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
    const refreshWhenVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('online', poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('online', poll);
    };
  }, [agentRunning]);

  useEffect(() => {
    void fetchUsage();
    const interval = setInterval(() => void fetchUsage(), 60_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

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

  useEffect(() => {
    const onWorkOrderUpdated = (event: Event) => {
      const wo = (event as CustomEvent<WorkOrderUpdatedDetail>).detail;
      if (!wo?.id) return;
      setStatus((current) => {
        if (!current) return current;
        const previous = (current.workOrders || []).find((item) => item.id === wo.id);
        const merged = {
          ...(previous || {
            id: wo.id,
            sessionKey: wo.sessionKey,
            sourceType: 'user_message',
            sourceId: null,
            requesterRole: 'owner',
            objective: wo.objective,
            riskLevel: 'low',
            stepCount: 0,
            artifactCount: 0,
            deliveryCount: 0,
            verificationCount: 0,
            latestStepTitle: null,
            latestStepStatus: null,
            latestArtifactPath: null,
            latestDeliveryChannel: null,
            latestDeliveryStatus: null,
            latestVerificationStatus: null,
            createdAt: wo.updatedAt,
          }),
          status: wo.status,
          blockerReason: wo.blockerReason,
          activityHint: wo.activityHint,
          stalled: wo.stalled,
          updatedAt: wo.updatedAt,
          completedAt: wo.completedAt,
        };
        const workOrders = ['completed', 'failed', 'cancelled'].includes(wo.status)
          ? (current.workOrders || []).map((item) => (item.id === wo.id ? { ...item, ...merged } : item))
          : (current.workOrders || []).map((item) => (item.id === wo.id ? { ...item, ...merged } : item));
        return { ...current, workOrders };
      });
    };
    window.addEventListener(WORK_ORDER_UPDATED_EVENT, onWorkOrderUpdated);
    return () => window.removeEventListener(WORK_ORDER_UPDATED_EVENT, onWorkOrderUpdated);
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
    return displayStatus.runs.find((run) => (
      run.status === 'running'
      || (run.status === 'recovering' && run.completedAt === null)
    )) ?? displayStatus.runs[0] ?? null;
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

  const currentTask = useMemo(() => {
    if (!displayStatus) return null;
    return displayStatus.tasks.find((task) => task.status === 'in_progress')
      ?? displayStatus.tasks.find((task) => task.status === 'pending')
      ?? displayStatus.tasks.find((task) => task.status === 'blocked')
      ?? displayStatus.tasks[0]
      ?? null;
  }, [displayStatus]);

  const currentWorkOrder = useMemo(() => {
    if (!displayStatus?.workOrders?.length) return null;
    return displayStatus.workOrders.find((order) => (
      ACTIVE_WORK_ORDER_STATUSES.has(order.status) && isAutonomousWorkOrder(order)
    )) ?? null;
  }, [displayStatus]);

  const summary = lastError
    ? 'Status temporarily unavailable.'
    : displayStatus?.summary || (loading ? 'Checking current work.' : 'No active work.');
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
    ? { ...rawCopy, label: 'Needs you', color: '#60a5fa', background: 'rgba(96,165,250,0.14)' }
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

  const activeSessionForOpen = primaryRun?.sessionKey || currentAction?.sessionKey || currentGoal?.sessionKey || activeSessionKey;
  const showActiveTrace = !attention && hasActiveRun;
  const activeTraceItems = useMemo<ActiveTraceItem[]>(() => {
    if (!showActiveTrace || !displayStatus) return [];
    const items: ActiveTraceItem[] = [];
    const addTraceItem = (item: ActiveTraceItem) => {
      if (!item.value || items.some((existing) => isDuplicateTraceValue(existing.value, item.value))) return;
      items.push(item);
    };
    const sessionKey = activeSessionForOpen;
    const sameSession = <T extends { sessionKey: string }>(item: T) => !sessionKey || item.sessionKey === sessionKey;

    const actionTitle = cleanWidgetText(currentAction?.title, 72);
    const actionTool = formatTool(currentAction?.toolName || currentTool);
    if (actionTitle && !isGenericActionTitle(actionTitle)) {
      const isRetrying = Boolean(currentAction?.nextRunAt || currentAction?.lastError || (currentAction?.attemptCount ?? 0) > 1);
      addTraceItem({
        id: 'action',
        Icon: isRetrying ? RefreshCw : Wrench,
        label: isRetrying ? `Attempt ${Math.max(1, currentAction?.attemptCount ?? 1)}/${Math.max(1, currentAction?.maxAttempts ?? 1)}` : actionTool,
        value: actionTitle,
      });
    } else if (primaryRun?.progressReason && !isNoisyProgressReason(primaryRun.progressReason)) {
      addTraceItem({
        id: 'progress',
        Icon: Activity,
        label: 'Step',
        value: cleanWidgetText(primaryRun.progressReason, 72),
      });
    } else if (currentTool) {
      addTraceItem({
        id: 'tool',
        Icon: Wrench,
        label: 'Using',
        value: formatTool(currentTool),
      });
    }

    const workOrderObjective = cleanWidgetText(currentWorkOrder?.objective, 72);
    if (workOrderObjective && workOrderObjective !== actionTitle) {
      addTraceItem({
        id: 'work-order',
        Icon: ListChecks,
        label: currentWorkOrder?.status === 'blocked' ? 'Blocked' : 'Work',
        value: currentWorkOrder?.status === 'blocked'
          ? cleanWidgetText(currentWorkOrder.blockerReason || currentWorkOrder.objective, 72)
          : workOrderObjective,
      });
    }

    const goalTitle = cleanWidgetText(currentGoal?.title, 72);
    if (goalTitle && goalTitle !== actionTitle && goalTitle !== workOrderObjective) {
      addTraceItem({
        id: 'goal',
        Icon: ListChecks,
        label: 'Plan',
        value: goalTitle,
      });
    }

    const activeTask = currentTask && (currentTask.status === 'in_progress' || currentTask.status === 'pending' || currentTask.status === 'blocked')
      ? currentTask
      : null;
    const taskTitle = cleanWidgetText(activeTask?.title, 72);
    if (taskTitle && taskTitle !== actionTitle && taskTitle !== goalTitle && taskTitle !== workOrderObjective) {
      addTraceItem({
        id: 'task',
        Icon: CheckCircle2,
        label: activeTask?.status === 'in_progress' ? 'Task' : 'Next',
        value: taskTitle,
      });
    }

    const activeBackgroundAgents = displayStatus.backgroundAgents.filter((agent) => (
      agent.status === 'pending' || agent.status === 'running' || agent.status === 'backgrounded'
    ));
    if (activeBackgroundAgents.length > 0) {
      const lead = activeBackgroundAgents[0];
      addTraceItem({
        id: 'agents',
        Icon: MessageCircle,
        label: `${activeBackgroundAgents.length} helper${activeBackgroundAgents.length === 1 ? '' : 's'}`,
        value: cleanWidgetText(lead.task || lead.agentType, 72),
      });
    }

    const latestDecision = [...displayStatus.decisions]
      .filter(sameSession)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latestDecision?.summary) {
      addTraceItem({
        id: 'decision',
        Icon: Gauge,
        label: 'Plan',
        value: cleanWidgetText(latestDecision.summary, 72),
      });
    }

    const pendingVerification = [...displayStatus.workVerifications]
      .filter((verification) => verification.status === 'pending' && sameSession(verification))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (pendingVerification?.summary) {
      addTraceItem({
        id: 'verification',
        Icon: CheckCircle2,
        label: 'Verify',
        value: cleanWidgetText(pendingVerification.summary, 72),
      });
    }

    if (items.length > 0) return items.slice(0, 3);
    return [{
      id: 'summary',
      Icon: Activity,
      label: 'Working',
      value: cleanWidgetText(summary, 72) || 'Progressing current task',
    }];
  }, [
    activeSessionForOpen,
    currentAction,
    currentGoal,
    currentTask,
    currentTool,
    currentWorkOrder,
    displayStatus,
    primaryRun,
    showActiveTrace,
    summary,
  ]);

  const visibleLearnedPolicies = useMemo(() => (
    (displayStatus?.learnedPolicies || []).slice(0, 3)
  ), [displayStatus]);
  const visibleScheduledWork = useMemo(() => (
    (displayStatus?.scheduledWork || [])
      .filter((schedule) => schedule.status === 'active' || schedule.status === 'paused')
      .slice(0, 3)
  ), [displayStatus]);
  const showOperationalLedger = visibleScheduledWork.length > 0 || visibleLearnedPolicies.length > 0;

  const isIdleGlance = !attention && !hasActiveRun && mode === 'idle';
  const idleItems = useMemo<IdleGlanceItem[]>(() => {
    if (!isIdleGlance) return [];
    const items: IdleGlanceItem[] = [];

    if (nextEvent) {
      items.push({
        id: 'calendar',
        Icon: CalendarDays,
        label: formatEventTime(nextEvent),
        value: nextEvent.summary || 'Upcoming event',
        onClick: () => openWindow('calendar'),
      });
    }

    const commParts = [
      emailUnreadCount > 0 ? `${emailUnreadCount} email${emailUnreadCount === 1 ? '' : 's'}` : null,
      unreadNotificationCount > 0 ? `${unreadNotificationCount} alert${unreadNotificationCount === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    if (commParts.length > 0) {
      items.push({
        id: 'inbox',
        Icon: emailUnreadCount > 0 ? Mail : Bell,
        label: emailUnreadCount > 0 ? 'Inbox' : 'Notifications',
        value: commParts.join(' • '),
        onClick: () => {
          if (emailUnreadCount > 0) openWindow('email');
          else openNotificationDrawer();
        },
      });
    }

    const recentSession = [...chatSessions]
      .filter((session) => session.key !== 'overseer')
      .sort((a, b) => (b.lastActivity || b.created || 0) - (a.lastActivity || a.created || 0))[0];
    if (recentSession) {
      items.push({
        id: 'session',
        Icon: MessageCircle,
        label: recentSession.key === activeSessionKey ? 'Current chat' : 'Recent chat',
        value: recentSession.title || 'Untitled session',
        onClick: () => void openSpotlightSession(recentSession.key),
      });
    }

    const usageHint = resetHint(usage);
    if (usageHint) {
      items.push({
        id: 'usage',
        Icon: Gauge,
        label: 'Usage',
        value: usageHint,
        onClick: () => openSettingsToSection('billing', { subsection: 'usage' }),
      });
    }

    return items.slice(0, 3);
  }, [
    activeSessionKey,
    chatSessions,
    emailUnreadCount,
    isIdleGlance,
    nextEvent,
    openSpotlightSession,
    openNotificationDrawer,
    openWindow,
    unreadNotificationCount,
    usage,
  ]);

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
              openAuthRedirect(result.data.url);
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
          if (action.actionUrl) openAuthRedirect(action.actionUrl);
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
      openAuthRedirect(item.actionUrl);
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

  const openKnowledgeDefaults = useCallback((policyId?: number) => {
    const metadata = {
      tab: 'defaults',
      ...(policyId != null ? { highlightPolicyId: policyId } : {}),
    };
    const existing = windows.find((window) => window.type === 'memory');
    if (existing) {
      updateWindow(existing.id, { metadata });
      useWindowStore.getState().focusWindow(existing.id);
      if (useWindowStore.getState().activeWorkspaceId !== existing.workspaceId) {
        useWindowStore.getState().switchWorkspace(existing.workspaceId);
      }
      return;
    }
    openWindow('memory', { metadata });
  }, [openWindow, updateWindow, windows]);

  const handleExpirePolicy = (policy: api.AutopilotLearnedPolicySnapshot) => {
    if (expiringPolicyId !== null) return;
    setExpirePolicyError(null);
    setExpiringPolicyId(policy.id);
    api.expireLearnedPolicy(policy.id)
      .then((result) => {
        if (!result.success) {
          setExpirePolicyError(result.error || 'Could not forget this default');
          return;
        }
        setStatus((current) => {
          if (!current) return current;
          const learnedPolicies = (current.learnedPolicies || []).filter((item) => item.id !== policy.id);
          return {
            ...current,
            learnedPolicies,
            learnedPolicyCount: Math.max(0, (current.learnedPolicyCount ?? learnedPolicies.length + 1) - 1),
          };
        });
      })
      .finally(() => setExpiringPolicyId(null));
  };

  const applyWorkOrderUpdate = (updated: api.AutopilotWorkOrderControlSnapshot) => {
    setStatus((current) => {
      if (!current) return current;
      const previous = (current.workOrders || []).find((item) => item.id === updated.id);
      const previousWasActive = previous ? ['active', 'waiting', 'blocked'].includes(previous.status) : false;
      const nextIsActive = ['active', 'waiting', 'blocked'].includes(updated.status);
      const previousWasBlocked = previous?.status === 'blocked';
      const nextIsBlocked = updated.status === 'blocked';
      const merged = (current.workOrders || []).map((item) => (
        item.id === updated.id
          ? {
            ...item,
            ...updated,
            blockerReason: updated.blockerReason ?? null,
            activityHint: (updated as { activityHint?: string }).activityHint ?? item.activityHint,
            stalled: (updated as { stalled?: boolean }).stalled ?? item.stalled,
          }
          : item
      ));
      const workOrders = ['completed', 'failed', 'cancelled'].includes(updated.status)
        ? merged.filter((item) => item.id !== updated.id)
        : merged;
      const activeDelta = Number(nextIsActive) - Number(previousWasActive);
      const blockedDelta = Number(nextIsBlocked) - Number(previousWasBlocked);
      const activeWorkOrderCount = current.activeWorkOrderCount == null
        ? workOrders.filter((item) => item.status === 'active' || item.status === 'waiting' || item.status === 'blocked').length
        : Math.max(0, current.activeWorkOrderCount + activeDelta);
      const blockedWorkOrderCount = current.blockedWorkOrderCount == null
        ? workOrders.filter((item) => item.status === 'blocked').length
        : Math.max(0, current.blockedWorkOrderCount + blockedDelta);
      return {
        ...current,
        workOrders,
        activeWorkOrderCount,
        blockedWorkOrderCount,
      };
    });
  };

  return (
    <div
      onClick={isIdleGlance || showActiveTrace ? () => void openSpotlightSession(activeSessionForOpen) : undefined}
      className={`w-[260px] rounded-2xl glass-window border border-black/10 dark:border-white/10 shadow-[var(--shadow-window)] overflow-hidden ${isIdleGlance || showActiveTrace ? 'cursor-pointer' : ''}`}
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
              <div
                className="truncate text-[13px] font-semibold tracking-wide"
                style={{ color: 'rgba(255,255,255,0.82)' }}
                title={agentDisplayName}
              >
                {agentDisplayName}
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

        {isIdleGlance ? (
          <div className="mt-2 min-h-[46px] space-y-1">
            {idleItems.length > 0 ? (
              idleItems.map(({ id, Icon, label, value, onClick }) => (
                <button
                  key={id}
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClick?.();
                  }}
                  className="flex h-[20px] w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-left transition-colors hover:bg-white/[0.035]"
                  title={`${label}: ${value}`}
                >
                  <Icon size={12} strokeWidth={2.1} className="shrink-0 text-white/[0.42]" />
                  <span className="shrink-0 text-[10px] font-medium text-white/[0.42]">{label}</span>
                  <span className="min-w-0 truncate text-[11px] font-medium text-white/[0.70]">{value}</span>
                </button>
              ))
            ) : (
              <div className="flex h-[42px] items-center rounded-md px-1.5 text-[12px] leading-snug text-white/[0.62]">
                Ready for a new task.
              </div>
            )}
          </div>
        ) : showActiveTrace ? (
          <div className="mt-2 min-h-[46px] space-y-1">
            {activeTraceItems.map(({ id, Icon, label, value }) => (
              <div
                key={id}
                className="flex h-[20px] w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md px-1.5"
                title={`${label}: ${value}`}
              >
                <Icon size={12} strokeWidth={2.1} className="shrink-0 text-cyan-200/[0.52]" />
                <span className="max-w-[72px] shrink-0 truncate text-[10px] font-medium text-white/[0.42]">{label}</span>
                <span className="min-w-0 truncate text-[11px] font-medium text-white/[0.72]">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[12px] leading-snug min-h-[32px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
            {clampText(friendlySummary, 108)}
          </div>
        )}

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
                    <span className="truncate px-2 py-1.5 text-white/[0.76]">
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
                      className="flex min-h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-white/[0.46] transition-colors hover:bg-white/[0.045] hover:text-white/[0.76]"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {showOperationalLedger && (
          <div className="mt-2 space-y-2 border-t border-white/[0.055] pt-2">
            {visibleLearnedPolicies.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-1 text-[9px] font-semibold uppercase tracking-wide text-white/[0.30]">
                  <span className="inline-flex items-center gap-1">
                    Learned defaults
                    <InfoHint side="top" className="text-white/40 hover:text-white/80">
                      Habits Construct learned from successful scheduled tasks and reports. Forget any default you do not want.
                    </InfoHint>
                  </span>
                  <span>{displayStatus?.learnedPolicyCount ?? visibleLearnedPolicies.length}</span>
                </div>
                {expirePolicyError && (
                  <p className="px-1 text-[9.5px] text-rose-200/80">{expirePolicyError}</p>
                )}
                {visibleLearnedPolicies.map((policy) => {
                  const display = formatLearnedPolicyDisplay(policy);
                  return (
                    <div
                      key={policy.id}
                      className="group flex min-h-[30px] w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5"
                      title={display.description}
                    >
                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          openKnowledgeDefaults(policy.id);
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                      >
                        <Repeat size={13} strokeWidth={2.1} className="shrink-0 text-violet-200/[0.54]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium text-white/[0.70]">
                            {cleanWidgetText(display.title, 56)}
                          </span>
                          <span className="block truncate text-[9.5px] text-white/[0.38]">
                            {display.scopeLabel} · {display.strengthText}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Forget this default: ${display.title}`}
                        title="Forget this default"
                        disabled={expiringPolicyId !== null}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleExpirePolicy(policy);
                        }}
                        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-white/[0.28] opacity-0 transition hover:bg-white/[0.045] hover:text-white/[0.70] group-hover:opacity-100 disabled:cursor-default disabled:opacity-40"
                      >
                        {expiringPolicyId === policy.id ? (
                          <Loader2 size={11} strokeWidth={2.3} className="animate-spin" />
                        ) : (
                          <X size={11} strokeWidth={2.4} />
                        )}
                      </button>
                    </div>
                  );
                })}
                {(displayStatus?.learnedPolicyCount ?? 0) > visibleLearnedPolicies.length && (
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      openKnowledgeDefaults();
                    }}
                    className="px-1.5 text-left text-[9.5px] text-white/[0.42] transition hover:text-white/[0.68]"
                  >
                    View all {displayStatus?.learnedPolicyCount ?? visibleLearnedPolicies.length} defaults in Knowledge
                  </button>
                )}
              </div>
            )}

            {visibleScheduledWork.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-1 text-[9px] font-semibold uppercase tracking-wide text-white/[0.30]">
                  <span>Scheduled work</span>
                  <span>{displayStatus?.activeScheduledWorkCount ?? visibleScheduledWork.length}</span>
                </div>
                {visibleScheduledWork.map((schedule) => {
                  const delivery = schedule.deliveryChannel
                    ? `${schedule.deliveryChannel}${schedule.deliveryRecipient ? ` to ${schedule.deliveryRecipient}` : ''}`
                    : 'delivery auto';
                  const policy = formatPolicyFlags(schedule.verificationPolicy) || formatPolicyFlags(schedule.failurePolicy);
                  const detail = [
                    formatScheduleDue(schedule.nextFireTime),
                    delivery,
                    schedule.artifactRoot ? cleanWidgetText(schedule.artifactRoot, 46) : null,
                    policy || null,
                  ].filter(Boolean).join(' - ');
                  return (
                    <button
                      key={schedule.id}
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        openWindow('calendar');
                      }}
                      className="flex h-[30px] w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-white/[0.035]"
                      title={`${schedule.title}: ${schedule.objective}`}
                    >
                      <CalendarDays size={13} strokeWidth={2.1} className="shrink-0 text-emerald-200/[0.54]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-white/[0.70]">
                          {cleanWidgetText(schedule.title || schedule.objective, 74)}
                        </span>
                        <span className="block truncate text-[9.5px] text-white/[0.38]">
                          {formatLedgerStatus(schedule.status)} - {cleanWidgetText(detail, 86)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
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
