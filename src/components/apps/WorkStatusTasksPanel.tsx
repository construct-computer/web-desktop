import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Mail,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import * as api from '@/services/api';
import { WORK_ORDER_UPDATED_EVENT, type WorkOrderUpdatedDetail } from '@/lib/agentUiEvents';
import { useNotificationStore } from '@/stores/notificationStore';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';

const ACTIVE_STATUSES = new Set(['active', 'waiting', 'blocked']);

function formatTool(tool: string | null | undefined): string | null {
  if (!tool) return null;
  return tool.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(status: string): string {
  return status.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAge(ts: number | null | undefined): string {
  if (!ts) return 'just now';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatScheduleDue(value: string | null | undefined): string {
  if (!value) return 'no next run';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return 'scheduled';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const prefix = diff >= 0 ? 'in ' : 'due ';
  if (abs < 60_000) return diff >= 0 ? 'soon' : 'due now';
  if (abs < 60 * 60_000) return `${prefix}${Math.round(abs / 60_000)}m`;
  if (abs < 24 * 60 * 60_000) return `${prefix}${Math.round(abs / 60 / 60_000)}h`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'scheduled_task': return 'Scheduled';
    case 'external_platform': return 'External';
    case 'autopilot': return 'Autopilot';
    case 'recovery': return 'Recovery';
    default: return 'Chat';
  }
}

function statusTone(status: string): string {
  if (status === 'blocked') return 'text-amber-600 dark:text-amber-300 bg-amber-500/15';
  if (status === 'failed') return 'text-red-600 dark:text-red-300 bg-red-500/15';
  if (status === 'completed') return 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/15';
  if (status === 'waiting') return 'text-slate-600 dark:text-slate-300 bg-slate-500/15';
  return 'text-blue-600 dark:text-blue-300 bg-blue-500/15';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
      {children}
    </div>
  );
}

function mergeTaskFromEvent(
  prev: Array<api.AutopilotWorkOrderSnapshot & { activityHint: string; stalled: boolean }>,
  wo: WorkOrderUpdatedDetail,
): Array<api.AutopilotWorkOrderSnapshot & { activityHint: string; stalled: boolean }> {
  const merged = {
    ...(prev.find((item) => item.id === wo.id) || {
      id: wo.id,
      sessionKey: wo.sessionKey,
      sourceType: 'user_message' as const,
      sourceId: null,
      requesterRole: 'owner' as const,
      objective: wo.objective,
      riskLevel: 'low' as const,
      blockerReason: wo.blockerReason,
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
      updatedAt: wo.updatedAt,
      completedAt: wo.completedAt,
      activityHint: wo.activityHint,
      stalled: wo.stalled,
    }),
    ...wo,
    activityHint: wo.activityHint,
    stalled: wo.stalled,
    status: wo.status,
    blockerReason: wo.blockerReason,
    updatedAt: wo.updatedAt,
    completedAt: wo.completedAt,
  };
  const without = prev.filter((item) => item.id !== wo.id);
  if (['completed', 'failed', 'cancelled'].includes(wo.status)) {
    return [merged, ...without].slice(0, 15);
  }
  return [merged, ...without.filter((item) => ACTIVE_STATUSES.has(item.status))].slice(0, 15);
}

export function WorkStatusTasksPanel() {
  const selectedWorkOrderId = useNotificationStore((s) => s.selectedWorkOrderId);
  const setSelectedWorkOrderId = useNotificationStore((s) => s.setSelectedWorkOrderId);
  const switchSession = useComputerStore((s) => s.switchSession);
  const toggleSpotlight = useWindowStore((s) => s.toggleSpotlight);
  const spotlightOpen = useWindowStore((s) => s.spotlightOpen);

  const [tasks, setTasks] = useState<Array<api.AutopilotWorkOrderSnapshot & { activityHint: string; stalled: boolean }>>([]);
  const [scheduledWork, setScheduledWork] = useState<api.AutopilotScheduledWorkSnapshot[]>([]);
  const [detail, setDetail] = useState<api.WorkOrderDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    const [tasksResult, autopilotResult] = await Promise.all([
      api.listAgentTasks('all'),
      api.getAutopilotStatus(),
    ]);
    if (tasksResult.success) {
      setTasks(tasksResult.data.tasks);
    }
    if (autopilotResult.success) {
      setScheduledWork(autopilotResult.data.scheduledWork || []);
    }
    setLoadingList(false);
  }, []);

  const loadDetail = useCallback(async (workOrderId: string) => {
    setLoadingDetail(true);
    const result = await api.getAgentTaskDetail(workOrderId);
    setDetail(result.success ? result.data : null);
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const wo = (event as CustomEvent<WorkOrderUpdatedDetail>).detail;
      if (!wo?.id) return;
      setTasks((prev) => mergeTaskFromEvent(prev, wo));
      if (selectedWorkOrderId === wo.id) {
        void loadDetail(wo.id);
      }
    };
    window.addEventListener(WORK_ORDER_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(WORK_ORDER_UPDATED_EVENT, onUpdate);
  }, [loadDetail, selectedWorkOrderId]);

  useEffect(() => {
    if (selectedWorkOrderId) {
      void loadDetail(selectedWorkOrderId);
    } else {
      setDetail(null);
    }
  }, [selectedWorkOrderId, loadDetail]);

  useEffect(() => {
    if (selectedWorkOrderId || tasks.length === 0) return;
    const firstActive = tasks.find((t) => ACTIVE_STATUSES.has(t.status));
    if (firstActive) {
      setSelectedWorkOrderId(firstActive.id);
    }
  }, [tasks, selectedWorkOrderId, setSelectedWorkOrderId]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => ACTIVE_STATUSES.has(t.status)),
    [tasks],
  );
  const recentTasks = useMemo(
    () => tasks.filter((t) => !ACTIVE_STATUSES.has(t.status)).slice(0, 8),
    [tasks],
  );

  const selected = tasks.find((t) => t.id === selectedWorkOrderId) ?? detail?.workOrder ?? null;

  const linkedSchedule = useMemo(() => {
    if (!selected?.sourceId || selected.sourceType !== 'scheduled_task') return null;
    return scheduledWork.find((s) => s.id === selected.sourceId) ?? null;
  }, [scheduledWork, selected]);

  const openChat = () => {
    if (!selected?.sessionKey) return;
    void switchSession(selected.sessionKey);
    if (!spotlightOpen) toggleSpotlight();
  };

  const handleCancel = async () => {
    if (!selectedWorkOrderId) return;
    setActionId(`cancel:${selectedWorkOrderId}`);
    const result = await api.cancelWorkOrder(selectedWorkOrderId);
    if (result.success) {
      await loadTasks();
      await loadDetail(selectedWorkOrderId);
    }
    setActionId(null);
  };

  const handleResolve = async () => {
    if (!selectedWorkOrderId) return;
    setActionId(`resolve:${selectedWorkOrderId}`);
    const result = await api.resolveWorkOrderBlocker(selectedWorkOrderId);
    if (result.success) {
      await loadTasks();
      await loadDetail(selectedWorkOrderId);
    }
    setActionId(null);
  };

  const wo = detail?.workOrder ?? selected;
  const run = detail?.linkedRun ?? null;
  const stalled = Boolean(wo && ('stalled' in wo ? wo.stalled : false));
  const stepCount = detail?.steps.length ?? wo?.stepCount ?? 0;

  const currentActivity = useMemo(() => {
    if (!wo) return null;
    if (run?.progressReason) return run.progressReason;
    const tool = formatTool(run?.activeToolName || run?.lastToolName);
    if (tool) return tool;
    return wo.activityHint || null;
  }, [run, wo]);

  const failedVerification = detail?.verifications.find((v) => v.status === 'failed');
  const lastFailedStep = detail?.steps.filter((s) => s.status === 'failed').at(-1);

  return (
    <div className="flex flex-col shrink-0 max-h-[min(52vh,420px)] border-b border-[var(--color-border)]/40">
      <div className="px-3 py-2 border-b border-[var(--color-border)]/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          <ListChecks className="w-3 h-3" />
          Tasks
        </div>
        <span className="text-[9px] text-[var(--color-text-muted)] tabular-nums">
          {activeTasks.length} active
        </span>
      </div>
      <div className="flex flex-1 min-h-[200px] max-h-[340px]">
        <div className="w-[38%] min-w-[120px] max-w-[168px] border-r border-[var(--color-border)]/30 overflow-y-auto py-1">
          {loadingList && tasks.length === 0 && (
            <div className="flex items-center justify-center py-6 text-[var(--color-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {activeTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedWorkOrderId(task.id)}
              className={`w-full text-left px-2.5 py-2 border-l-2 transition-colors ${
                selectedWorkOrderId === task.id
                  ? 'border-blue-500 bg-[var(--color-surface-hover)]'
                  : 'border-transparent hover:bg-[var(--color-surface-hover)]/60'
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                {task.stalled && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="May be stuck" />
                )}
                <span className="text-[11px] font-medium truncate text-[var(--color-text)]">{task.objective}</span>
              </div>
              <span className="block text-[9px] text-[var(--color-text-muted)] truncate mt-0.5">
                {task.activityHint}
              </span>
            </button>
          ))}
          {recentTasks.length > 0 && (
            <>
              <div className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Recent
              </div>
              {recentTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedWorkOrderId(task.id)}
                  className={`w-full text-left px-2.5 py-1.5 border-l-2 transition-colors ${
                    selectedWorkOrderId === task.id
                      ? 'border-blue-500/70 bg-[var(--color-surface-hover)]'
                      : 'border-transparent hover:bg-[var(--color-surface-hover)]/40'
                  }`}
                >
                  <span className="block text-[10px] truncate text-[var(--color-text-secondary)]">{task.objective}</span>
                  <span className="block text-[9px] text-[var(--color-text-muted)] truncate">{task.activityHint}</span>
                </button>
              ))}
            </>
          )}
          {!loadingList && activeTasks.length === 0 && recentTasks.length === 0 && (
            <p className="px-2.5 py-4 text-[10px] text-[var(--color-text-muted)] leading-relaxed">
              No durable tasks yet. Long-running chat work and scheduled jobs appear here.
            </p>
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto px-3 py-2">
          {!selected && !loadingDetail && (
            <p className="text-[11px] text-[var(--color-text-muted)] py-6 text-center leading-relaxed">
              Select a task to see what Construct is doing step by step.
            </p>
          )}
          {loadingDetail && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
            </div>
          )}
          {wo && !loadingDetail && (
            <div className="space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${statusTone(wo.status)}`}>
                    {statusLabel(wo.status)}
                  </span>
                  <span className="text-[9px] text-[var(--color-text-muted)]">
                    {sourceLabel(wo.sourceType)}
                  </span>
                </div>
                <h3 className="text-[12px] font-semibold text-[var(--color-text)] leading-snug">{wo.objective}</h3>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-1 tabular-nums">
                  Updated {formatAge(wo.updatedAt)}
                  {stepCount > 0 ? ` · ${stepCount} step${stepCount === 1 ? '' : 's'}` : ''}
                  {wo.completedAt ? ` · Finished ${formatAge(wo.completedAt)}` : ''}
                </p>
              </div>

              {stalled && (
                <div className="flex gap-2 text-[10px] text-amber-800 dark:text-amber-100 bg-amber-500/12 rounded-md px-2 py-1.5 border border-amber-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    No progress recently
                    {run ? ` (idle ${formatDuration(run.idleMs)})` : ''}. The agent may be stuck or waiting on a slow tool.
                  </span>
                </div>
              )}

              {wo.status === 'blocked' && wo.blockerReason && (
                <div className="flex gap-2 text-[10px] text-amber-800 dark:text-amber-100 bg-amber-500/10 rounded-md px-2 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{wo.blockerReason}</span>
                </div>
              )}

              {linkedSchedule && (
                <div className="rounded-md border border-[var(--color-border)]/40 bg-[var(--color-surface-hover)]/40 px-2 py-1.5 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    <CalendarClock className="w-3 h-3" />
                    Schedule
                  </div>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">{linkedSchedule.title || linkedSchedule.objective}</p>
                  {linkedSchedule.nextFireTime && (
                    <p className="text-[9px] text-[var(--color-text-muted)]">
                      Next run: {new Date(linkedSchedule.nextFireTime).toLocaleString()}
                    </p>
                  )}
                  {linkedSchedule.lastOccurrenceSummary && (
                    <p className="text-[9px] text-[var(--color-text-muted)]">
                      Last run: {linkedSchedule.lastOccurrenceStatus || 'unknown'} — {linkedSchedule.lastOccurrenceSummary}
                    </p>
                  )}
                  {linkedSchedule.lastOccurrenceError && (
                    <p className="text-[9px] text-red-500/90">{linkedSchedule.lastOccurrenceError}</p>
                  )}
                </div>
              )}

              {(currentActivity || run) && wo.status !== 'blocked' && (
                <div className="rounded-md bg-[var(--color-surface-hover)]/50 px-2 py-1.5 space-y-1">
                  <SectionTitle>Right now</SectionTitle>
                  {currentActivity && (
                    <p className="text-[11px] text-[var(--color-text)] leading-snug">{currentActivity}</p>
                  )}
                  {run && (
                    <p className="text-[9px] text-[var(--color-text-muted)] tabular-nums">
                      Running {formatDuration(run.elapsedMs)}
                      {run.lastIteration > 0 ? ` · loop ${run.lastIteration}` : ''}
                      {run.idleMs > 30_000 && !stalled ? ` · idle ${formatDuration(run.idleMs)}` : ''}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={openChat}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-[var(--color-surface-hover)] hover:opacity-90"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open chat
                </button>
                {wo.status === 'blocked' && (
                  <button
                    type="button"
                    disabled={actionId !== null}
                    onClick={() => void handleResolve()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-blue-600 dark:text-blue-300 bg-blue-500/10"
                  >
                    {actionId?.startsWith('resolve:') ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Resolve blocker
                  </button>
                )}
                {ACTIVE_STATUSES.has(wo.status) && (
                  <button
                    type="button"
                    disabled={actionId !== null}
                    onClick={() => void handleCancel()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-red-600 dark:text-red-300 bg-red-500/10"
                  >
                    {actionId?.startsWith('cancel:') ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    Cancel task
                  </button>
                )}
              </div>

              <div>
                <SectionTitle>Timeline</SectionTitle>
                {detail && detail.steps.length > 0 ? (
                  <ul className="space-y-2">
                    {detail.steps.map((step) => (
                      <li key={step.id} className="flex gap-2 text-[10px]">
                        <span className="text-[var(--color-text-muted)] tabular-nums shrink-0 w-[42px]">{fmtClock(step.createdAt)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1">
                            <span className={`font-medium ${
                              step.status === 'failed'
                                ? 'text-red-500'
                                : step.status === 'completed'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : step.status === 'in_progress'
                                    ? 'text-blue-600 dark:text-blue-300'
                                    : 'text-[var(--color-text)]'
                            }`}>
                              {step.title}
                            </span>
                            {step.toolName && (
                              <span className="text-[8px] px-1 py-px rounded bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]">
                                {formatTool(step.toolName)}
                              </span>
                            )}
                          </span>
                          {step.evidence && (
                            <span className="block text-[var(--color-text-muted)] mt-0.5 line-clamp-2 break-words">
                              {step.evidence}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                    {wo.status === 'waiting'
                      ? 'Waiting to resume — no steps recorded yet.'
                      : run?.progressReason
                        ? `No tool steps yet. Session reports: ${run.progressReason}`
                        : 'No steps recorded yet. Progress will appear as tools run.'}
                  </p>
                )}
              </div>

              {detail && detail.deliveries.length > 0 && (
                <div>
                  <SectionTitle>Deliveries</SectionTitle>
                  <ul className="space-y-1">
                    {detail.deliveries.map((d) => (
                      <li key={d.id} className="flex items-start gap-1.5 text-[10px] text-[var(--color-text-secondary)]">
                        <Send className="w-3 h-3 shrink-0 mt-0.5 opacity-60" />
                        <span>
                          <span className="font-medium capitalize">{d.channel}</span>
                          {d.recipient ? ` → ${d.recipient}` : ''}
                          <span className="text-[var(--color-text-muted)]"> ({d.status})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail && detail.artifacts.length > 0 && (
                <div>
                  <SectionTitle>Artifacts</SectionTitle>
                  <ul className="space-y-1">
                    {detail.artifacts.map((a) => (
                      <li key={a.id} className="flex items-start gap-1.5 text-[10px] text-[var(--color-text-secondary)] min-w-0">
                        <FileText className="w-3 h-3 shrink-0 mt-0.5 opacity-60" />
                        <span className="truncate" title={a.path}>{a.path}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail && detail.backgroundAgents.length > 0 && (
                <div>
                  <SectionTitle>Parallel helpers</SectionTitle>
                  <ul className="space-y-1.5">
                    {detail.backgroundAgents.map((agent) => (
                      <li key={agent.childId} className="text-[10px]">
                        <span className="font-medium text-[var(--color-text)]">{agent.task}</span>
                        <span className="text-[var(--color-text-muted)]">
                          {' '}— {statusLabel(agent.status)}
                          {agent.lastHeartbeatAt ? ` · ${formatAge(agent.lastHeartbeatAt)}` : ''}
                        </span>
                        {agent.error && (
                          <span className="block text-red-500/90 mt-0.5 line-clamp-2">{agent.error}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {wo.status === 'failed' && (
                <div className="flex gap-2 text-[10px] text-red-600 dark:text-red-300 bg-red-500/10 rounded-md px-2 py-1.5">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {lastFailedStep?.evidence || failedVerification?.evidence || 'This task ended without completing.'}
                  </span>
                </div>
              )}

              {wo.status === 'completed' && (
                <div className="flex gap-2 text-[10px] text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {detail?.deliveries.length
                      ? `Completed with ${detail.deliveries.length} delivery${detail.deliveries.length === 1 ? '' : 'ies'}.`
                      : wo.activityHint || 'Task completed.'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {scheduledWork.filter((s) => s.status === 'active' || s.status === 'paused').length > 0 && (
        <div className="border-t border-[var(--color-border)]/30 px-3 py-2 max-h-[100px] overflow-y-auto">
          <SectionTitle>Upcoming schedules</SectionTitle>
          <ul className="space-y-1">
            {scheduledWork
              .filter((s) => s.status === 'active' || s.status === 'paused')
              .slice(0, 4)
              .map((schedule) => (
                <li key={schedule.id} className="text-[9px] text-[var(--color-text-muted)] truncate flex items-center gap-1">
                  <Mail className="w-2.5 h-2.5 shrink-0 opacity-60" />
                  <span className="truncate">{schedule.title || schedule.objective}</span>
                  {schedule.nextFireTime && (
                    <span className="shrink-0 tabular-nums opacity-80">
                      · {formatScheduleDue(schedule.nextFireTime)}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
