import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageSquare,
  Power,
  ShieldAlert,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useDraggableWidget } from '@/hooks/useDraggableWidget';
import * as api from '@/services/api';
import {
  getApprovalQueue,
  type ApprovalQueueEntry,
} from '@/services/access-control';

const IDLE_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 5_000;
const INCIDENT_ATTENTION_MS = 30 * 60_000;
const CONTROL_EVENT_ATTENTION_MS = 30 * 60_000;
const AUTONOMY_GATE_ATTENTION_MS = 30 * 60_000;

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
    label: 'Blocked',
    color: '#fb923c',
    background: 'rgba(251,146,60,0.14)',
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

function fmtCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function usagePercent(used: number, max: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (used / max) * 100));
}

function budgetNumber(budget: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = budget?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function verificationLabel(status: api.AutopilotVerificationStatus | undefined): string {
  if (status === 'verified') return 'verified';
  if (status === 'pending') return 'checking';
  if (status === 'blocked') return 'blocked';
  return 'ready';
}

function isToolApproval(req: ApprovalQueueEntry): boolean {
  return req.approvalKind === 'tool_permission' || req.mode === 'tool_permission' || req.platform === 'agent';
}

function approvalTitle(req: ApprovalQueueEntry): string {
  if (isToolApproval(req)) {
    return `${formatTool(req.toolName || 'tool')} needs approval`;
  }
  const who = req.senderName || req.senderHandle || req.senderId || 'Unknown sender';
  if (req.platform === 'email') return `Email from ${who}`;
  return `${who} via ${req.platform}`;
}

function approvalDetail(req: ApprovalQueueEntry): string {
  if (isToolApproval(req)) {
    return req.originalMessage || req.impactSummary || `${req.toolName || 'Tool'} is waiting.`;
  }
  return req.originalMessage || req.impactSummary || 'External access request';
}

function pendingActionTone(kind: api.PendingUserActionKind): string {
  if (kind === 'auth') return '#22d3ee';
  if (kind === 'question') return '#a78bfa';
  return '#fb923c';
}

function pendingActionKindLabel(kind: api.PendingUserActionKind): string {
  if (kind === 'auth') return 'Connect';
  if (kind === 'question') return 'Answer';
  return 'Approve';
}

function PendingActionKindIcon({ kind }: { kind: api.PendingUserActionKind }) {
  if (kind === 'auth') return <KeyRound size={10} strokeWidth={2.3} className="shrink-0" />;
  if (kind === 'question') return <MessageSquare size={10} strokeWidth={2.3} className="shrink-0" />;
  return <ShieldAlert size={10} strokeWidth={2.3} className="shrink-0" />;
}

function pendingActionBody(action: api.PendingUserAction): string {
  return action.body
    .replace(/^https?:\/\/\S+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    || 'The agent is waiting for the owner before it can continue.';
}

function autonomyModeLabel(mode: api.AutonomyMode): string {
  if (mode === 'conservative') return 'Careful';
  if (mode === 'aggressive') return 'Auto';
  return 'Standard';
}

export function AutopilotPanel() {
  const agentRunning = useComputerStore((s) => s.agentRunning);
  const todoList = useComputerStore((s) => s.todoList);
  const openWindow = useWindowStore((s) => s.openWindow);
  const spotlightOpen = useWindowStore((s) => s.spotlightOpen);
  const toggleSpotlight = useWindowStore((s) => s.toggleSpotlight);
  const [status, setStatus] = useState<api.AutopilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalQueueEntry | null>(null);
  const [pendingActions, setPendingActions] = useState<api.PendingUserAction[]>([]);
  const [usage, setUsage] = useState<api.CurrentUsage | null>(null);
  const [storage, setStorage] = useState<{ bytesUsed: number; maxBytes: number } | null>(null);

  async function loadSnapshot(isCancelled?: () => boolean) {
    const [result, pendingResult] = await Promise.all([
      api.getAutopilotStatus(),
      api.getPendingUserActions('pending', 8),
    ]);
    if (isCancelled?.()) return;
    setLoading(false);
    if (pendingResult.success) {
      setPendingActions(pendingResult.data.actions);
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
    let cancelled = false;

    const poll = async () => {
      const [usageResult, storageResult] = await Promise.all([
        api.getCurrentUsage(),
        api.getStorageUsage(),
      ]);
      if (cancelled) return;
      if (usageResult.success) setUsage(usageResult.data);
      if (storageResult.success) setStorage(storageResult.data);
    };

    void poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const mode = status?.mode ?? (lastError ? 'degraded' : 'idle');
  const copy = MODE_COPY[mode];
  const ModeIcon = copy.Icon;

  const primaryRun = useMemo(() => {
    if (!status) return null;
    return status.runs.find((run) => run.status === 'running' || run.status === 'recovering') ?? status.runs[0] ?? null;
  }, [status]);

  const currentGoal = useMemo(() => {
    if (!status) return null;
    return status.goals.find((goal) => (
      goal.status === 'active' || goal.status === 'blocked' || goal.status === 'pending'
    )) ?? status.goals[0] ?? null;
  }, [status]);

  const currentAction = useMemo(() => {
    if (!status) return null;
    if (!currentGoal) {
      return status.actions.find((action) => action.status === 'running' || action.status === 'blocked') ?? status.actions[0] ?? null;
    }
    return status.actions.find((action) => action.actionId === currentGoal.currentActionId)
      ?? status.actions.find((action) => action.goalId === currentGoal.goalId)
      ?? null;
  }, [status, currentGoal]);

  const latestBlocker = status?.blockers.find((blocker) => blocker.status === 'open') ?? null;
  const latestDeadLetter = status?.actions.find((action) => action.status === 'dead_lettered') ?? null;
  const snapshotNow = status?.generatedAt ?? 0;
  const latestAutonomyGate = status?.autonomyGates?.find((gate) => (
    snapshotNow - gate.createdAt <= AUTONOMY_GATE_ATTENTION_MS
    && (gate.decision === 'blocked' || gate.decision === 'approval_required')
  )) ?? null;
  const latestUnresolvedSideEffect = status?.workSideEffects?.find((item) => (
    (item.status === 'started' || item.status === 'uncertain')
    && !status.workVerifications.some((verification) => (
      verification.sessionKey === item.sessionKey
      && (verification.toolName === item.toolName || verification.toolName == null)
      && verification.createdAt >= (item.updatedAt ?? item.createdAt)
    ))
  )) ?? null;
  const latestSideEffect = status?.workSideEffects?.[0] ?? null;
  const latestVerification = status?.workVerifications?.[0] ?? null;
  const latestToolReliability = status?.toolReliability?.[0] ?? null;
  const latestDecision = status?.decisions?.[0] ?? null;
  const latestLedgerItem = latestSideEffect
    ? {
      label: latestSideEffect.status === 'succeeded'
        ? 'Completed'
        : latestSideEffect.status === 'uncertain'
          ? 'Uncertain'
          : latestSideEffect.status === 'started'
            ? 'Started'
            : 'Attempted',
      tone: latestSideEffect.status === 'succeeded'
        ? '#22c55e'
        : latestSideEffect.status === 'started'
          ? '#22d3ee'
          : '#fb923c',
      text: latestSideEffect.summary,
      createdAt: latestSideEffect.createdAt,
    }
    : latestVerification
      ? {
        label: 'Verified',
        tone: latestVerification.status === 'passed' ? '#22d3ee' : '#fb923c',
        text: latestVerification.summary,
        createdAt: latestVerification.createdAt,
      }
      : null;
  const latestIncident = status?.incidents.find((incident) => snapshotNow - incident.createdAt <= INCIDENT_ATTENTION_MS) ?? null;
  const latestControl = status?.controlEvents.find((event) => snapshotNow - event.createdAt <= CONTROL_EVENT_ATTENTION_MS) ?? null;
  const summary = lastError
    ? 'Status temporarily unavailable.'
    : status?.summary || (loading ? 'Checking autonomous work.' : 'No active autonomous work.');
  const currentTool = primaryRun?.activeToolName || primaryRun?.lastToolName || currentAction?.toolName || null;
  const approvalCount = status?.pendingApprovalCount ?? (pendingApproval ? 1 : 0);
  const primaryPendingAction = pendingActions[0] ?? null;
  const userActionCount = Math.max(pendingActions.length, approvalCount);
  const providerReliabilityCount = (status?.blockedToolProviderCount || 0) + (status?.degradedToolProviderCount || 0);
  const needsAttention = (
    userActionCount
    + (status?.blockedTaskCount || 0)
    + (status?.pausedSessionCount || 0)
    + (status?.openBlockerCount || 0)
    + (status?.deadLetterCount || 0)
    + (status?.verificationPendingCount || 0)
    + (status?.unresolvedSideEffectCount || 0)
    + providerReliabilityCount
    + (latestAutonomyGate ? 1 : 0)
  );
  const gateToolCalls = latestAutonomyGate
    ? [budgetNumber(latestAutonomyGate.budget, 'toolCallsUsed'), budgetNumber(latestAutonomyGate.budget, 'maxToolCalls')]
    : [null, null];
  const queueLabel = pendingActions.length
    ? `${pendingActions.length} owner action${pendingActions.length === 1 ? '' : 's'}`
    : status?.pendingApprovalCount
      ? `${status.pendingApprovalCount} approval${status.pendingApprovalCount === 1 ? '' : 's'}`
    : latestAutonomyGate
      ? `${latestAutonomyGate.risk.replace(/_/g, ' ')} gate`
      : status?.unresolvedSideEffectCount
        ? `${status.unresolvedSideEffectCount} uncertain side effect${status.unresolvedSideEffectCount === 1 ? '' : 's'}`
      : status?.verificationPendingCount
        ? `${status.verificationPendingCount} verification${status.verificationPendingCount === 1 ? '' : 's'}`
      : providerReliabilityCount
        ? `${providerReliabilityCount} provider${providerReliabilityCount === 1 ? '' : 's'} degraded`
      : status?.activeDecisionCount
        ? `${status.activeDecisionCount} default${status.activeDecisionCount === 1 ? '' : 's'}`
      : status?.deadLetterCount
        ? `${status.deadLetterCount} dead-letter${status.deadLetterCount === 1 ? '' : 's'}`
        : status?.openBlockerCount
          ? `${status.openBlockerCount} blocker${status.openBlockerCount === 1 ? '' : 's'}`
          : status?.retryingActionCount
            ? `${status.retryingActionCount} retry${status.retryingActionCount === 1 ? '' : 'ies'}`
            : 'No queued work';
  const hasActiveRun = !!primaryRun && (primaryRun.status === 'running' || primaryRun.status === 'recovering');
  const autonomyMode = status?.autonomyMode || 'standard';
  const autopilotEnabled = status?.autopilotEnabled ?? true;
  const taskDone = todoList?.items.filter((item) => item.status === 'done' || item.status === 'skipped').length ?? 0;
  const taskTotal = todoList?.items.length ?? 0;
  const friendlySummary = primaryPendingAction
    ? `Needs you: ${primaryPendingAction.title}`
    : pendingApproval
      ? `Needs approval: ${approvalTitle(pendingApproval)}`
      : hasActiveRun
        ? summary
        : mode === 'idle'
          ? 'Ready. No active task is running.'
          : summary;

  const handleReviewApprovals = () => {
    openWindow('access-control');
  };

  const handleOpenPendingAction = (action: api.PendingUserAction) => {
    if (action.kind === 'approval') {
      openWindow('access-control', { metadata: { approvalId: action.sourceId } });
      return;
    }
    if (action.kind === 'question') {
      if (!spotlightOpen) toggleSpotlight();
      return;
    }
    if (action.kind === 'auth') {
      if (action.actionUrl) {
        window.open(action.actionUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      openWindow('app-registry');
    }
  };

  return (
    <div
      className="w-full rounded-2xl glass-window border border-black/10 dark:border-white/10 shadow-[var(--shadow-window)] overflow-hidden overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 132px)' }}
    >
        <div className="px-4 pt-3 pb-3">
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
                <div className="text-[13px] font-medium truncate max-w-[170px]" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  {hasActiveRun ? formatTool(currentTool) : copy.label}
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
            {clampText(friendlySummary, 116)}
          </div>

          <UsageSummary usage={usage} storage={storage} />

          {currentGoal && hasActiveRun && (
            <div className="mt-2 rounded-lg px-2 py-1.5 min-w-0" style={{ background: 'rgba(255,255,255,0.055)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold uppercase" style={{ color: 'rgba(255,255,255,0.34)' }}>
                  Goal
                </span>
                <span className="text-[9px] font-medium capitalize shrink-0" style={{ color: copy.color }}>
                  {verificationLabel(currentGoal.verificationStatus)}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.62)' }}>
                {clampText(currentGoal.title || currentAction?.title || 'Autonomous work', 82)}
              </div>
            </div>
          )}

          <AgentPolicySummary autonomyMode={autonomyMode} enabled={autopilotEnabled} />

          <div className="grid grid-cols-3 gap-1.5 mt-3">
            <Metric label="Runs" value={status?.activeRunCount ?? 0} icon={Bot} />
            <Metric label="Goals" value={status?.activeGoalCount ?? 0} icon={Target} />
            <Metric label="Watch" value={needsAttention} icon={ShieldAlert} tone={needsAttention > 0 ? '#fb923c' : undefined} />
          </div>

          {todoList && taskTotal > 0 && (
            <TaskProgressCard
              goal={todoList.goal}
              done={taskDone}
              total={taskTotal}
              current={todoList.items.find((item) => item.status === 'in_progress')?.text
                ?? todoList.items.find((item) => item.status === 'pending')?.text
                ?? todoList.items[0]?.text
                ?? ''}
            />
          )}

          {latestDecision && hasActiveRun && (
            <div className="mt-2 rounded-lg px-2 py-1.5 min-w-0" style={{ background: 'rgba(34,211,238,0.075)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold uppercase" style={{ color: '#22d3ee' }}>
                  Learned
                </span>
                <span className="text-[9px] tabular-nums shrink-0" style={{ color: 'rgba(255,255,255,0.32)' }}>
                  {formatAge(latestDecision.updatedAt)} ago
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.62)' }}>
                {clampText(latestDecision.summary, 74)}
              </div>
            </div>
          )}

          {latestLedgerItem && hasActiveRun && (
            <div className="mt-2 rounded-lg px-2 py-1.5 min-w-0" style={{ background: 'rgba(255,255,255,0.045)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold uppercase" style={{ color: latestLedgerItem.tone }}>
                  {latestLedgerItem.label}
                </span>
                <span className="text-[9px] tabular-nums shrink-0" style={{ color: 'rgba(255,255,255,0.32)' }}>
                  {formatAge(latestLedgerItem.createdAt)} ago
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.58)' }}>
                {clampText(latestLedgerItem.text, 74)}
              </div>
            </div>
          )}

          {primaryRun && hasActiveRun && (
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.42)' }}>
              <span className="truncate">
                {primaryRun.sessionKey.replace(/^platform:/, '')}
              </span>
              <span className="tabular-nums shrink-0">
                {formatDuration(primaryRun.elapsedMs)}
              </span>
            </div>
          )}

          {latestControl && !latestIncident && (
            <div className="mt-2 text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.36)' }}>
              Last update: {formatTool(latestControl.action)} {formatAge(latestControl.createdAt)} ago
            </div>
          )}

          {pendingApproval && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
              style={{ color: 'rgba(255,255,255,0.62)', background: 'rgba(251,146,60,0.10)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate" style={{ color: '#fb923c' }}>
                  {clampText(approvalTitle(pendingApproval), 44)}
                </span>
                <span className="shrink-0 tabular-nums" style={{ color: 'rgba(255,255,255,0.34)' }}>
                  {formatAge(pendingApproval.requestedAt)}
                </span>
              </div>
              <div className="mt-0.5">
                {clampText(approvalDetail(pendingApproval), 82)}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <DecisionButton
                  label="Open"
                  icon={ExternalLink}
                  tone="#fb923c"
                  onClick={handleReviewApprovals}
                />
              </div>
            </div>
          )}

          {primaryPendingAction && !pendingApproval && (
            <PendingActionCard
              action={primaryPendingAction}
              onOpen={handleOpenPendingAction}
            />
          )}

          {latestBlocker && !latestIncident && !pendingApproval && !primaryPendingAction && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
              style={{ color: 'rgba(255,255,255,0.62)', background: 'rgba(251,146,60,0.10)' }}
            >
              <span style={{ color: '#fb923c' }}>{latestBlocker.requiredFrom || 'blocked'}</span>
              <span>: {clampText(latestBlocker.summary, 74)}</span>
            </div>
          )}

          {latestDeadLetter && !latestIncident && !latestBlocker && !pendingApproval && !primaryPendingAction && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
              style={{ color: 'rgba(255,255,255,0.62)', background: 'rgba(248,113,113,0.10)' }}
            >
              <span style={{ color: '#f87171' }}>retry limit</span>
              <span>: {clampText(latestDeadLetter.title, 74)}</span>
            </div>
          )}

          {latestUnresolvedSideEffect && !latestIncident && !latestBlocker && !latestDeadLetter && !pendingApproval && !primaryPendingAction && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
              style={{ color: 'rgba(255,255,255,0.62)', background: 'rgba(251,146,60,0.10)' }}
            >
              <span style={{ color: '#fb923c' }}>{latestUnresolvedSideEffect.status}</span>
              <span>: verify {formatTool(latestUnresolvedSideEffect.toolName)} before retrying</span>
            </div>
          )}

          {latestToolReliability && !latestIncident && !latestBlocker && !latestDeadLetter && !latestUnresolvedSideEffect && !pendingApproval && !primaryPendingAction && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
              style={{ color: 'rgba(255,255,255,0.62)', background: 'rgba(248,113,113,0.10)' }}
            >
              <span style={{ color: latestToolReliability.status === 'blocked' ? '#fb923c' : '#f87171' }}>
                {latestToolReliability.status}
              </span>
              <span>: {clampText(`${latestToolReliability.providerKey} ${latestToolReliability.recoveryHint || 'use a fallback path'}`, 74)}</span>
            </div>
          )}

          {latestAutonomyGate && !latestIncident && !latestBlocker && !latestDeadLetter && !latestUnresolvedSideEffect && !latestToolReliability && !pendingApproval && !primaryPendingAction && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
              style={{ color: 'rgba(255,255,255,0.62)', background: 'rgba(251,146,60,0.10)' }}
            >
              <span style={{ color: '#fb923c' }}>{latestAutonomyGate.decision.replace(/_/g, ' ')}</span>
              <span>: {clampText(`${formatTool(latestAutonomyGate.tool)} ${latestAutonomyGate.reason || ''}`, 74)}</span>
              {gateToolCalls[0] !== null && gateToolCalls[1] !== null && (
                <span style={{ color: 'rgba(255,255,255,0.38)' }}> ({gateToolCalls[0]}/{gateToolCalls[1]})</span>
              )}
            </div>
          )}

          {latestIncident && mode !== 'idle' && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
              style={{ color: 'rgba(255,255,255,0.62)', background: 'rgba(255,255,255,0.055)' }}
            >
              <span style={{ color: copy.color }}>{latestIncident.kind.replace(/_/g, ' ')}</span>
              <span>: {clampText(latestIncident.message, 74)}</span>
            </div>
          )}

        </div>

        <div className="px-4 py-2 flex items-center justify-between border-t border-white/[0.06] text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
          <span>{queueLabel}</span>
          <span className="tabular-nums">{status?.generatedAt ? `Updated ${formatAge(status.generatedAt)}` : 'Checking'}</span>
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

function UsageSummary({
  usage,
  storage,
}: {
  usage: api.CurrentUsage | null;
  storage: { bytesUsed: number; maxBytes: number } | null;
}) {
  const hasMonthlyUsd = usage?.monthlyUsedUsd !== undefined && usage?.monthlyCapUsd !== undefined && usage.monthlyCapUsd > 0;
  const monthlyPercent = Math.max(0, Math.min(100, usage?.monthlyPercentUsed ?? 0));
  const storagePercent = storage ? usagePercent(storage.bytesUsed, storage.maxBytes) : 0;

  const monthlyValue = hasMonthlyUsd
    ? `${fmtCost(usage.monthlyUsedUsd!)} / ${fmtCost(usage.monthlyCapUsd!)}`
    : usage
      ? `${monthlyPercent.toFixed(0)}% used`
      : 'Loading';
  const storageValue = storage
    ? `${fmtBytes(storage.bytesUsed)} / ${fmtBytes(storage.maxBytes)}`
    : 'Loading';

  return (
    <div className="mt-3 rounded-xl px-3 py-2.5 space-y-2" style={{ background: 'rgba(255,255,255,0.045)' }}>
      <UsageRow label="Monthly spend" value={monthlyValue} percent={monthlyPercent} tone={monthlyPercent >= 90 ? '#f87171' : monthlyPercent >= 70 ? '#fbbf24' : '#22d3ee'} />
      <UsageRow label="Storage" value={storageValue} percent={storagePercent} tone={storagePercent >= 90 ? '#f87171' : storagePercent >= 70 ? '#fbbf24' : '#22d3ee'} />
    </div>
  );
}

function UsageRow({
  label,
  value,
  percent,
  tone,
}: {
  label: string;
  value: string;
  percent: number;
  tone: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.42)' }}>
          {label}
        </span>
        <span className="text-[12px] font-medium tabular-nums whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.72)' }}>
          {value}
        </span>
      </div>
      <div className="mt-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.max(1, Math.min(100, percent))}%`,
            background: tone,
            boxShadow: `0 0 6px ${tone}66`,
          }}
        />
      </div>
    </div>
  );
}

function TaskProgressCard({
  goal,
  done,
  total,
  current,
}: {
  goal: string;
  done: number;
  total: number;
  current: string;
}) {
  const percent = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;

  return (
    <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.045)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.42)' }}>
          Task progress
        </span>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.72)' }}>
          {done}/{total}
        </span>
      </div>
      <div className="mt-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.max(1, percent)}%`, background: done === total ? '#22c55e' : '#60a5fa' }}
        />
      </div>
      <div className="mt-1.5 text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {clampText(current || goal || 'Working through task list', 92)}
      </div>
    </div>
  );
}

function AgentPolicySummary({
  autonomyMode,
  enabled,
}: {
  autonomyMode: api.AutonomyMode;
  enabled: boolean;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <div className="rounded-lg px-2 py-1.5 min-w-0" style={{ background: 'rgba(255,255,255,0.055)' }}>
        <div className="text-[9px] font-medium" style={{ color: 'rgba(255,255,255,0.34)' }}>
          Autonomy
        </div>
        <div className="mt-0.5 text-[12px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.72)' }}>
          {autonomyModeLabel(autonomyMode)}
        </div>
      </div>
      <div className="rounded-lg px-2 py-1.5 min-w-0" style={{ background: 'rgba(255,255,255,0.055)' }}>
        <div className="text-[9px] font-medium" style={{ color: 'rgba(255,255,255,0.34)' }}>
          Recovery
        </div>
        <div className="mt-0.5 text-[12px] font-semibold truncate" style={{ color: enabled ? '#22d3ee' : 'rgba(255,255,255,0.5)' }}>
          {enabled ? 'On' : 'Off'}
        </div>
      </div>
    </div>
  );
}

function PendingActionCard({
  action,
  onOpen,
}: {
  action: api.PendingUserAction;
  onOpen: (action: api.PendingUserAction) => void;
}) {
  const tone = pendingActionTone(action.kind);

  return (
    <div
      className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug"
      style={{ color: 'rgba(255,255,255,0.62)', background: `${tone}1a` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate inline-flex items-center gap-1.5 min-w-0" style={{ color: tone }}>
          <PendingActionKindIcon kind={action.kind} />
          <span className="truncate">{clampText(action.title || pendingActionKindLabel(action.kind), 44)}</span>
        </span>
        <span className="shrink-0 tabular-nums" style={{ color: 'rgba(255,255,255,0.34)' }}>
          {formatAge(action.createdAt)}
        </span>
      </div>
      <div className="mt-0.5">
        {clampText(pendingActionBody(action), 82)}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <DecisionButton
          label="Open"
          icon={ExternalLink}
          tone={tone}
          onClick={() => onOpen(action)}
        />
      </div>
    </div>
  );
}

function DecisionButton({
  label,
  icon: Icon,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tone: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex-1 min-w-0 rounded-md px-2 py-1 text-[10px] font-semibold flex items-center justify-center gap-1 transition-opacity disabled:opacity-45"
      style={{ color: tone, background: `${tone}1f` }}
    >
      <Icon size={10} strokeWidth={2.4} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: string;
}) {
  const color = tone || 'rgba(255,255,255,0.64)';
  return (
    <div className="rounded-lg px-2 py-1.5 min-w-0" style={{ background: 'rgba(255,255,255,0.055)' }}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.34)' }}>
          {label}
        </span>
        <Icon size={11} strokeWidth={2} style={{ color }} />
      </div>
      <div className="text-[15px] font-semibold tabular-nums leading-none mt-1" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
