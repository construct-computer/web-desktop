import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Mail,
  MoreHorizontal,
  Send,
  X,
} from 'lucide-react';
import * as api from '@/services/api';
import { AttentionBanner } from '@/components/work-status/AttentionBanner';
import { TaskTimeline } from '@/components/work-status/TaskTimeline';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import {
  ACTIVE_WORK_ORDER_STATUSES,
  formatAge,
  formatDuration,
  formatScheduleDue,
  formatTool,
  listRowSubtitle,
  sourceLabel,
  statusLabel,
  statusTone,
} from '@/lib/workStatusFormat';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
      {children}
    </div>
  );
}

function StatusDot({ status, stalled }: { status: string; stalled?: boolean }) {
  const color =
    status === 'blocked' ? 'bg-amber-400'
      : status === 'failed' ? 'bg-red-400'
        : status === 'completed' ? 'bg-emerald-400'
          : status === 'waiting' ? 'bg-slate-400'
            : stalled ? 'bg-amber-400'
              : 'bg-blue-400';
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

type TaskRowProps = {
  task: api.AutopilotWorkOrderSnapshot & { activityHint: string; stalled: boolean };
  selected: boolean;
  onSelect: () => void;
};

function TaskListRow({ task, selected, onSelect }: TaskRowProps) {
  const subtitle = listRowSubtitle(task);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
        selected
          ? 'border-blue-500 bg-[var(--color-surface-hover)]'
          : 'border-transparent hover:bg-[var(--color-surface-hover)]/60'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={task.status} stalled={task.stalled} />
        <span className="text-[11px] font-medium truncate text-[var(--color-text)] flex-1">{task.objective}</span>
      </div>
      {subtitle && (
        <span className="block text-[9px] text-[var(--color-text-muted)] truncate mt-0.5 pl-3.5">
          {subtitle}
        </span>
      )}
    </button>
  );
}

export function WorkStatusTasksPanel() {
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const switchSession = useComputerStore((s) => s.switchSession);
  const toggleSpotlight = useWindowStore((s) => s.toggleSpotlight);
  const spotlightOpen = useWindowStore((s) => s.spotlightOpen);

  const { tasks, scheduledWork, loading: loadingList, refresh: loadTasks } = useWorkOrders();
  const [detail, setDetail] = useState<api.WorkOrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  const loadDetail = useCallback(async (workOrderId: string) => {
    setLoadingDetail(true);
    const result = await api.getAgentTaskDetail(workOrderId);
    setDetail(result.success ? result.data : null);
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (selectedWorkOrderId) {
      void loadDetail(selectedWorkOrderId);
    } else {
      setDetail(null);
    }
  }, [selectedWorkOrderId, loadDetail]);

  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current || selectedWorkOrderId || tasks.length === 0) return;
    const firstBlocked = tasks.find((t) => t.status === 'blocked');
    const firstActive = firstBlocked ?? tasks.find((t) => ACTIVE_WORK_ORDER_STATUSES.has(t.status));
    if (firstActive) {
      didAutoSelect.current = true;
      setSelectedWorkOrderId(firstActive.id);
    }
  }, [tasks, selectedWorkOrderId, setSelectedWorkOrderId]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => ACTIVE_WORK_ORDER_STATUSES.has(t.status)),
    [tasks],
  );
  const recentTasks = useMemo(
    () => tasks.filter((t) => !ACTIVE_WORK_ORDER_STATUSES.has(t.status)).slice(0, 8),
    [tasks],
  );

  const selected = tasks.find((t) => t.id === selectedWorkOrderId) ?? detail?.workOrder ?? null;
  const detailOpen = Boolean(selectedWorkOrderId);

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
    setShowCancel(false);
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
    const hint = wo.activityHint?.trim();
    if (hint && !['Completed', 'Failed', 'Cancelled', 'Blocked'].includes(hint)) return hint;
    return null;
  }, [run, wo]);

  const lastFailedStep = detail?.steps.filter((s) => s.status === 'failed').at(-1);
  const failureSummary = lastFailedStep?.evidence
    ? (lastFailedStep.evidence.length > 100 ? `${lastFailedStep.evidence.slice(0, 97)}…` : lastFailedStep.evidence)
    : detail?.verifications.find((v) => v.status === 'failed')?.evidence ?? null;

  const timelineEmpty = wo?.status === 'waiting'
    ? 'Waiting to resume — no steps recorded yet.'
    : run?.progressReason
      ? `No tool steps yet. Session reports: ${run.progressReason}`
      : 'No steps recorded yet. Progress will appear as tools run.';

  return (
    <div className="flex flex-1 min-h-0 h-full flex flex-col relative overflow-hidden">
      <div className="flex-1 min-h-0 relative">
      {/* List view */}
      <div
        className={`absolute inset-0 flex flex-col min-h-0 bg-[var(--color-surface)] transition-transform duration-200 ease-out ${
          detailOpen ? '-translate-x-full pointer-events-none opacity-0' : 'translate-x-0'
        }`}
      >
        <div className="px-3 py-2 border-b border-[var(--color-border)]/30 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <ListChecks className="w-3 h-3" />
            Tasks
          </div>
          <span className="text-[9px] text-[var(--color-text-muted)] tabular-nums">
            {activeTasks.length} active
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {loadingList && tasks.length === 0 && (
            <div className="flex items-center justify-center py-6 text-[var(--color-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          {activeTasks.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              selected={selectedWorkOrderId === task.id}
              onSelect={() => setSelectedWorkOrderId(task.id)}
            />
          ))}
          {recentTasks.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Recent
              </div>
              {recentTasks.map((task) => (
                <TaskListRow
                  key={task.id}
                  task={task}
                  selected={selectedWorkOrderId === task.id}
                  onSelect={() => setSelectedWorkOrderId(task.id)}
                />
              ))}
            </>
          )}
          {!loadingList && activeTasks.length === 0 && recentTasks.length === 0 && (
            <p className="px-3 py-4 text-[10px] text-[var(--color-text-muted)] leading-relaxed">
              No durable tasks yet. Long-running chat work and scheduled jobs appear here.
            </p>
          )}
        </div>
        {scheduledWork.filter((s) => s.status === 'active' || s.status === 'paused').length > 0 && (
          <div className="border-t border-[var(--color-border)]/30 px-3 py-2 max-h-[100px] overflow-y-auto shrink-0">
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

      {/* Detail slide-over */}
      <div
        className={`flex flex-col min-h-0 absolute inset-0 z-10 bg-[var(--color-surface)] transition-transform duration-200 ease-out ${
          detailOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {detailOpen && (
          <>
            <div className="flex items-center gap-2 px-2 py-2 border-b border-[var(--color-border)]/30 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedWorkOrderId(null)}
                className="p-1 rounded-md hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]"
                aria-label="Back to task list"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-medium text-[var(--color-text-muted)] truncate flex-1">
                Task detail
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
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
                      <span className="text-[9px] text-[var(--color-text-muted)]">{sourceLabel(wo.sourceType)}</span>
                    </div>
                    <h3 className="text-[12px] font-semibold text-[var(--color-text)] leading-snug">{wo.objective}</h3>
                    <p className="text-[9px] text-[var(--color-text-muted)] mt-1 tabular-nums">
                      Updated {formatAge(wo.updatedAt)}
                      {stepCount > 0 ? ` · ${stepCount} step${stepCount === 1 ? '' : 's'}` : ''}
                      {wo.completedAt ? ` · Finished ${formatAge(wo.completedAt)}` : ''}
                    </p>
                  </div>

                  <AttentionBanner
                    status={wo.status}
                    blockerReason={wo.blockerReason}
                    stalled={stalled}
                    idleMs={run?.idleMs}
                    failureMessage={wo.status === 'failed' ? failureSummary : null}
                  />

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
                    </div>
                  )}

                  {(currentActivity || run) && wo.status !== 'blocked' && wo.status !== 'failed' && (
                    <div className="rounded-md bg-[var(--color-surface-hover)]/50 px-2 py-1.5 space-y-1">
                      <SectionTitle>Right now</SectionTitle>
                      {currentActivity && (
                        <p className="text-[11px] text-[var(--color-text)] leading-snug">{currentActivity}</p>
                      )}
                      {run && (
                        <p className="text-[9px] text-[var(--color-text-muted)] tabular-nums">
                          Running {formatDuration(run.elapsedMs)}
                          {run.lastIteration > 0 ? ` · loop ${run.lastIteration}` : ''}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {wo.status === 'blocked' ? (
                      <button
                        type="button"
                        disabled={actionId !== null}
                        onClick={() => void handleResolve()}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-500 dark:bg-blue-500"
                      >
                        {actionId?.startsWith('resolve:') ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Resolve blocker
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={openChat}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium bg-[var(--color-surface-hover)] hover:opacity-90"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open chat
                      </button>
                    )}
                    {wo.status === 'blocked' && wo.sessionKey && (
                      <button
                        type="button"
                        onClick={openChat}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open chat
                      </button>
                    )}
                    {ACTIVE_WORK_ORDER_STATUSES.has(wo.status) && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowCancel((v) => !v)}
                          className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                          aria-label="More actions"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {showCancel && (
                          <button
                            type="button"
                            disabled={actionId !== null}
                            onClick={() => void handleCancel()}
                            className="absolute right-0 top-full mt-1 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-red-600 dark:text-red-300 bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm whitespace-nowrap"
                          >
                            {actionId?.startsWith('cancel:') ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            Cancel task
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <SectionTitle>Timeline</SectionTitle>
                    <TaskTimeline
                      steps={detail?.steps ?? []}
                      emptyMessage={timelineEmpty}
                    />
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

                  {wo.status === 'completed' && (
                    <div className="flex gap-2 text-[10px] text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {detail?.deliveries.length
                          ? `Completed with ${detail.deliveries.length} delivery${detail.deliveries.length === 1 ? '' : 'ies'}.`
                          : 'Task completed.'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
