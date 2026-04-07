/**
 * TasksScreen — Mobile task tracker for the Telegram Mini App.
 * Shows agent tasks with filtering + background agents section.
 * Desktop parity with TrackerWindow, adapted for touch.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ListChecks,
  Bot,
  Square,
} from 'lucide-react';
import {
  MiniHeader,
  Card,
  Badge,
  useToast,
  haptic,
  SkeletonList,
  EmptyState,
  SectionLabel,
  IconBtn,
  apiJSON,
  textColor,
  accent,
  formatRelativeTime,
} from '../ui';
import { agentWS } from '@/services/websocket';

// ── Types ──────────────────────────────────────────────────────────────

interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  agent_id: string | null;
  parent_task_id: number | null;
  output: string | null;
  created_at: number;
  updated_at: number;
}

interface TaskDetail extends Task {
  dependencies: number[];
}

interface BackgroundAgent {
  child_id: string;
  agent_type: string;
  task: string;
  status: string; // pending | running | backgrounded | completed | failed | disposed
  result: string | null;
  error: string | null;
  created_at: number;
  completed_at: number | null;
}

type Filter = 'active' | 'completed' | 'all';

// ── Status Helpers ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  in_progress: '#3B82F6',  // blue
  running: '#3B82F6',
  backgrounded: '#3B82F6',
  completed: '#10B981',    // emerald
  complete: '#10B981',
  failed: '#EF4444',       // red
  pending: '#F59E0B',      // amber
  blocked: '#F59E0B',
  cancelled: '#6B7280',    // gray
  disposed: '#6B7280',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] || '#6B7280';
}

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
    case 'complete':
      return <CheckCircle2 size={16} className="text-emerald-400" />;
    case 'in_progress':
      return <Loader2 size={16} className="text-blue-400 animate-spin" />;
    case 'pending':
    case 'blocked':
      return <Circle size={16} className="text-amber-400" />;
    case 'failed':
      return <XCircle size={16} className="text-red-400" />;
    default:
      return <MinusCircle size={16} className="text-gray-400" />;
  }
}

function AgentStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
    case 'backgrounded':
      return (
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
        </span>
      );
    case 'completed':
    case 'complete':
      return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />;
    case 'failed':
      return <XCircle size={14} className="text-red-400 shrink-0" />;
    case 'cancelled':
    case 'disposed':
      return <MinusCircle size={14} className="text-gray-500 shrink-0" />;
    case 'pending':
      return <Circle size={14} className="text-amber-400 shrink-0" />;
    default:
      return <Circle size={14} className="text-gray-400 shrink-0" />;
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    in_progress: 'In Progress',
    running: 'Running',
    backgrounded: 'Running',
    completed: 'Completed',
    complete: 'Completed',
    failed: 'Failed',
    pending: 'Pending',
    blocked: 'Blocked',
    cancelled: 'Cancelled',
    disposed: 'Disposed',
  };
  return labels[status] || status;
}

// ── Elapsed Timer ──────────────────────────────────────────────────────

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const s = Math.floor(elapsed / 1000);
  if (s < 60) return <span className="tabular-nums text-[11px] opacity-40">{s}s</span>;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return <span className="tabular-nums text-[11px] opacity-40">{m}m {rem}s</span>;
}

// ── Duration Format ────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

// ── Task Card ──────────────────────────────────────────────────────────

function TaskCard({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const color = statusColor(task.status);

  const handleTap = useCallback(async () => {
    haptic('light');
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      const data = await apiJSON<{ task: Task; dependencies: number[] }>(`/agent/tasks/${task.id}`);
      if (data) {
        setDetail({ ...data.task, dependencies: data.dependencies });
      }
    }
  }, [expanded, detail, task.id]);

  return (
    <div
      className="rounded-xl overflow-hidden active:opacity-80 transition-opacity"
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderLeft: `3px solid ${color}`,
      }}
      onClick={handleTap}
    >
      <div className="flex items-start gap-2.5 p-3">
        <div className="mt-0.5 shrink-0">
          <TaskStatusIcon status={task.status} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium leading-tight" style={{ color: textColor() }}>
            {task.title || `Task #${task.id}`}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={color}>{statusLabel(task.status)}</Badge>
            <span className="text-[11px] opacity-30">{formatRelativeTime(task.updated_at)}</span>
          </div>
        </div>
        <div className="shrink-0 mt-1 opacity-40">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {task.description && (
            <p className="text-[12px] opacity-50 leading-relaxed">{task.description}</p>
          )}
          {task.output && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-30">Output</span>
              <p className="text-[12px] opacity-50 mt-0.5 leading-relaxed">{task.output}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-30">
            <span>Created: {new Date(task.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span>Updated: {new Date(task.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          {detail?.dependencies && detail.dependencies.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-30">Depends on:</span>
              {detail.dependencies.map(d => (
                <Badge key={d} color="#6B7280">#{d}</Badge>
              ))}
            </div>
          )}
          {task.parent_task_id && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-30">Parent:</span>
              <Badge color="#6B7280">#{task.parent_task_id}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Background Agent Card ──────────────────────────────────────────────

function BackgroundAgentCard({ agent, onCancel }: { agent: BackgroundAgent; onCancel: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(agent.status);
  const isRunning = agent.status === 'running' || agent.status === 'backgrounded' || agent.status === 'pending';

  return (
    <div
      className="rounded-xl overflow-hidden active:opacity-80 transition-opacity"
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderLeft: `3px solid ${color}`,
      }}
      onClick={() => { haptic('light'); setExpanded(!expanded); }}
    >
      <div className="flex items-center gap-2.5 p-3">
        <AgentStatusIcon status={agent.status} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium leading-tight truncate" style={{ color: textColor() }}>
            {agent.task}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={color}>{statusLabel(agent.status)}</Badge>
            {agent.agent_type && (
              <span className="text-[10px] opacity-30">{agent.agent_type}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isRunning && <ElapsedTime startedAt={agent.created_at} />}
          {!isRunning && agent.completed_at && agent.created_at && (
            <span className="text-[11px] opacity-30 tabular-nums">
              {fmtDuration(agent.completed_at - agent.created_at)}
            </span>
          )}
          <div className="opacity-40">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {agent.result && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-30">Result</span>
              <p className="text-[12px] opacity-50 mt-0.5 leading-relaxed line-clamp-4">{agent.result}</p>
            </div>
          )}
          {agent.error && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400/60">Error</span>
              <p className="text-[12px] text-red-400/80 mt-0.5 leading-relaxed">{agent.error}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-30">
            <span>Started: {new Date(agent.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            {agent.completed_at && (
              <span>Completed: {new Date(agent.completed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </div>
          {isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                haptic('warning');
                onCancel(agent.child_id);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-red-400 active:bg-red-500/10 mt-1"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
            >
              <Square size={12} className="fill-current" />
              Cancel Agent
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────

const POLL_INTERVAL = 10_000;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bgAgents, setBgAgents] = useState<BackgroundAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);

  // ── Fetch data ──

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const [tasksRes, agentsRes] = await Promise.all([
      apiJSON<{ tasks: Task[] }>('/agent/tasks?all=true'),
      apiJSON<{ agents: BackgroundAgent[] }>('/agent/background-agents'),
    ]);
    if (tasksRes?.tasks) setTasks(tasksRes.tasks);
    if (agentsRes?.agents) setBgAgents(agentsRes.agents);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(() => fetchAll(true), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAll]);

  // ── Actions ──

  const handleRefresh = useCallback(() => {
    haptic('light');
    fetchAll();
  }, [fetchAll]);

  const handleCancel = useCallback((childId: string) => {
    agentWS.sendCancelChild(childId);
    // Optimistic update
    setBgAgents(prev => prev.map(a =>
      a.child_id === childId ? { ...a, status: 'cancelled' } : a
    ));
    toast.show('Agent cancelled', 'info');
    haptic('success');
  }, [toast]);

  // ── Filtered tasks ──

  const filtered = tasks.filter(t => {
    if (filter === 'active') return t.status === 'pending' || t.status === 'in_progress' || t.status === 'blocked';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  // ── Background agents split ──

  const runningAgents = bgAgents.filter(a => a.status === 'running' || a.status === 'backgrounded' || a.status === 'pending');
  const doneAgents = bgAgents.filter(a => a.status === 'completed' || a.status === 'failed' || a.status === 'cancelled' || a.status === 'disposed');

  // ── Render ──

  return (
    <div className="flex flex-col h-full">
      <MiniHeader
        title="Tasks"
        actions={
          <IconBtn onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={16} className={`opacity-50 ${refreshing ? 'animate-spin' : ''}`} />
          </IconBtn>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pb-3">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { haptic('light'); setFilter(f.key); }}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{
              backgroundColor: filter === f.key ? accent() : 'rgba(255,255,255,0.06)',
              color: filter === f.key ? '#fff' : undefined,
              opacity: filter === f.key ? 1 : 0.5,
            }}
          >
            {f.label}
            {f.key === 'active' && filtered.length > 0 && filter !== 'active' ? '' : ''}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <SkeletonList count={5} />
        ) : (
          <div className="space-y-5">
            {/* Background Agents — Running */}
            {runningAgents.length > 0 && (
              <section>
                <SectionLabel>Running Agents ({runningAgents.length})</SectionLabel>
                <div className="space-y-2">
                  {runningAgents.map(a => (
                    <BackgroundAgentCard key={a.child_id} agent={a} onCancel={handleCancel} />
                  ))}
                </div>
              </section>
            )}

            {/* Tasks */}
            <section>
              <SectionLabel>
                Tasks {filtered.length > 0 ? `(${filtered.length})` : ''}
              </SectionLabel>
              {filtered.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  message={filter === 'active' ? 'No active tasks' : filter === 'completed' ? 'No completed tasks' : 'No tasks yet'}
                />
              ) : (
                <div className="space-y-2">
                  {filtered.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              )}
            </section>

            {/* Background Agents — Completed */}
            {doneAgents.length > 0 && (
              <section>
                <SectionLabel>Agent History ({doneAgents.length})</SectionLabel>
                <div className="space-y-2">
                  {doneAgents.map(a => (
                    <BackgroundAgentCard key={a.child_id} agent={a} onCancel={handleCancel} />
                  ))}
                </div>
              </section>
            )}

            {/* Global empty state */}
            {filtered.length === 0 && bgAgents.length === 0 && (
              <EmptyState icon={Bot} message="No tasks or agents" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
