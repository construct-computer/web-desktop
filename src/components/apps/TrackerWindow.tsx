import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useComputerStore, type PlatformAgentState } from '@/stores/agentStore';
import { getSwarmMetrics } from '@/lib/agentSwarm';
import { useWindowStore } from '@/stores/windowStore';
import {
  useAgentTrackerStore,
  type TrackedOperation,
  type TrackedSubAgent,
  type OperationType,
  type SubAgentStatus,
  type OperationStatus,
} from '@/stores/agentTrackerStore';
import {
  Bot,
  Network,
  Brain,
  Cog,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  MinusCircle,
  Trash2,
  Activity,
  Square,
  Wrench,
  MessageSquare,
} from 'lucide-react';
import type { WindowConfig } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function platformLabel(p: string): string {
  return { slack: 'Slack', telegram: 'Telegram', calendar: 'Calendar', email: 'Email', desktop: 'Desktop', chat: 'Desktop' }[p] || p;
}

function opLabel(t: OperationType): string {
  return { delegation: 'Delegation', consultation: 'Consultation', background: 'Background', orchestration: 'Orchestration' }[t] || t;
}

// ── Status Indicators ────────────────────────────────────────────────

function StatusDot({ status }: { status: SubAgentStatus | OperationStatus | 'idle' | 'working' }) {
  switch (status) {
    case 'running': case 'working':
      return <span className="relative flex h-2 w-2 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" /></span>;
    case 'complete':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    case 'cancelled':
      return <MinusCircle className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
    case 'aggregating':
      return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />;
    case 'pending':
      return <span className="inline-flex rounded-full h-2 w-2 bg-gray-500/50 shrink-0" />;
    default:
      return <span className="inline-flex rounded-full h-2 w-2 bg-gray-500/40 shrink-0" />;
  }
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="tabular-nums">{fmtDur(elapsed)}</span>;
}


// ── Agent Card ───────────────────────────────────────────────────────

function AgentCard({
  agent, thinking, taskProgress: _taskProgress, onStop, compact, operations, onCancelChild
}: {
  agent: PlatformAgentState;
  thinking?: string | null;
  taskProgress?: { step: number; maxSteps: number } | null;
  onStop?: () => void;
  compact?: boolean;
  operations?: TrackedOperation[];
  onCancelChild?: (childId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasContent = (agent.chatMessages?.length ?? 0) > 0 || !!agent.currentTask;
  const hasError = !!agent.error;
  const isDone = !agent.running && !!agent.completedAt;
  const isRunning = agent.running;
  const displayThinking = thinking || agent.thinking;

  const handleExpand = () => setExpanded(!expanded);

  return (
    <div
      className={`rounded-xl border transition-all ${
        isRunning
          ? 'border-blue-500/30 bg-[var(--color-surface)] shadow-sm shadow-blue-500/5'
          : hasError
            ? 'border-red-500/25 bg-[var(--color-surface)]/80'
            : isDone
              ? 'border-emerald-500/20 bg-[var(--color-surface)]/60'
              : 'border-[var(--color-border)] bg-[var(--color-surface)]/50'
      }`}
    >
      {/* ── Header (clickable to expand/collapse) ── */}
      <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer" onClick={handleExpand}>
        {/* Status + platform */}
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={isRunning ? 'working' : hasError ? 'failed' : isDone ? 'complete' : 'idle'} />
          <span className="text-xs font-semibold truncate">{platformLabel(agent.platform)}</span>
        </div>

        {/* Current tool pill */}
        {isRunning && agent.currentTool && (
          <span className="text-[10px] font-mono text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1.5 py-0.5 rounded truncate max-w-[100px]">
            {agent.currentTool}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Timer */}
        {isRunning && agent.startedAt && (
          <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums"><Elapsed startedAt={agent.startedAt} /></span>
        )}
        {isDone && agent.startedAt && agent.completedAt && (
          <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">{fmtDur(agent.completedAt - agent.startedAt)}</span>
        )}

        {/* Expand indicator */}
        {hasContent && (
          <span className="text-[var(--color-text-muted)]">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        )}

        {/* Stop */}
        {isRunning && onStop && (
          <button onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors" title="Stop">
            <Square className="w-3 h-3 fill-current" />
          </button>
        )}
      </div>

      {/* ── Thinking / Error ── */}
      {!compact && (displayThinking || hasError) && (
        <div className="px-3 pb-2 space-y-1.5">
          {displayThinking && (
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">{displayThinking}</p>
          )}
          {hasError && (
            <p className="text-[11px] text-red-400 truncate">Error: {agent.error}</p>
          )}
        </div>
      )}

      {/* ── Unified activity feed ── */}
      {expanded && hasContent && (
        <div className="border-t border-[var(--color-border)]/50">
          <div className="px-3 py-2 max-h-[250px] overflow-y-auto space-y-0.5">
            {(() => {
              const msgs = [...(agent.chatMessages ?? [])].filter(msg => msg.content || msg.role !== 'system').reverse();
              const usedOpIds = new Set<string>();
              
              const feed = msgs.map((msg, i) => {
                let opNode = null;
                if (msg.operationId && operations) {
                  const op = operations.find(o => o.id === msg.operationId);
                  if (op) {
                    usedOpIds.add(op.id);
                    opNode = (
                      <div className="flex-1 min-w-0 mt-1 mb-2">
                        <OperationCard operation={op} onCancelChild={onCancelChild} />
                      </div>
                    );
                  }
                }

                return (
                  <div key={i} className="flex items-start gap-2 py-0.5 text-[10px]">
                    {/* Timestamp */}
                    <span className="text-[9px] text-[var(--color-text-muted)] opacity-50 tabular-nums shrink-0 mt-px w-[52px]">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {/* Content by role */}
                    {opNode ? opNode : msg.role === 'user' ? (
                      <div className="flex-1 min-w-0">
                        <span className="text-blue-400 font-medium">User </span>
                        <span className="text-[var(--color-text)] break-words">{msg.content}</span>
                      </div>
                    ) : msg.role === 'agent' ? (
                      <div className="flex-1 min-w-0">
                        <span className="text-emerald-400 font-medium">Agent </span>
                        <span className="text-[var(--color-text)] break-words">{msg.content}</span>
                      </div>
                    ) : msg.role === 'activity' ? (
                      <div className="flex-1 min-w-0 flex items-start gap-1 text-[var(--color-text-muted)]">
                        <Wrench className="w-2.5 h-2.5 shrink-0 mt-px opacity-40" />
                        {msg.tool && <span className="font-mono text-[var(--color-accent)] shrink-0">{msg.tool}</span>}
                        <span className="break-words">{msg.content}</span>
                      </div>
                    ) : msg.isError || msg.isStopped ? (
                      <div className="flex-1 min-w-0">
                        <span className={`break-words ${msg.isStopped ? 'text-[var(--color-text-muted)]' : 'text-red-400'}`}>{msg.content}</span>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <span className="text-[var(--color-text-muted)] break-words">{msg.content}</span>
                      </div>
                    )}
                  </div>
                );
              });
              
              const orphanedOps = operations?.filter(o => !usedOpIds.has(o.id)) || [];
              
              return (
                <>
                  {orphanedOps.length > 0 && (
                    <div className="mb-2 space-y-1.5">
                      {orphanedOps.map(op => <OperationCard key={op.id} operation={op} onCancelChild={onCancelChild} />)}
                    </div>
                  )}
                  {feed}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SubAgent Row ─────────────────────────────────────────────────────

function SubAgentRow({ agent, onCancel }: { agent: TrackedSubAgent; onCancel?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = agent.status === 'running' || agent.status === 'pending';
  const isDone = agent.status === 'complete' || agent.status === 'failed' || agent.status === 'cancelled';
  const hasDetails = agent.error || agent.result || (agent.activities && agent.activities.length > 0);

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-3 text-xs transition-colors ${hasDetails ? 'cursor-pointer hover:bg-[var(--color-surface-hover)]/50' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <StatusDot status={agent.status} />
        <span className="min-w-0 flex-1 text-[var(--color-text-secondary)] line-clamp-3 break-words text-[11px] leading-snug">
          {agent.goal || agent.label}
        </span>
        
        {isActive && agent.currentActivity && (
          <span className="text-[10px] font-mono text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1 py-0.5 rounded shrink-0 max-w-[80px] truncate">
            {agent.currentActivity}
          </span>
        )}
        {isDone && agent.durationMs != null && (
          <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums shrink-0">{fmtDur(agent.durationMs)}</span>
        )}
        {isActive && <span className="text-[10px] text-[var(--color-text-muted)] shrink-0"><Elapsed startedAt={agent.startedAt} /></span>}
        {/* Per-child cancel button */}
        {isActive && onCancel && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(agent.id); }}
            className="p-0.5 rounded hover:bg-orange-500/20 text-[var(--color-text-muted)]/40 hover:text-orange-400 transition-colors shrink-0"
            title="Cancel this agent"
          >
            <Ban className="w-3 h-3" />
          </button>
        )}
        {hasDetails && (expanded ? <ChevronDown className="w-2.5 h-2.5 text-[var(--color-text-muted)] shrink-0" /> : <ChevronRight className="w-2.5 h-2.5 text-[var(--color-text-muted)] shrink-0" />)}
      </div>
      {/* Result preview (when done, not expanded) */}
      {!expanded && isDone && agent.result && (
        <p className="px-3 pl-8 text-[10px] text-[var(--color-text-muted)]/50 line-clamp-1 -mt-0.5 mb-0.5">{agent.result}</p>
      )}
      {expanded && (
        <div className="px-3 pl-8 pb-2 space-y-1">
          {agent.result && <p className="text-[10px] text-[var(--color-text-muted)] break-words line-clamp-4">{agent.result}</p>}
          {agent.error && <p className="text-[10px] text-red-400 break-words">Error: {agent.error}</p>}
          {agent.activities && agent.activities.length > 0 && (
            <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
              {agent.activities.slice(-10).reverse().map((a, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                  {a.activityType === 'text'
                    ? <MessageSquare className="w-2.5 h-2.5 shrink-0 opacity-40" />
                    : <Wrench className="w-2.5 h-2.5 shrink-0 opacity-40" />
                  }
                  <span className="truncate">{a.text}</span>
                  <span className="ml-auto text-[9px] opacity-50 tabular-nums shrink-0">
                    {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Operation Card ───────────────────────────────────────────────────

function OpIcon({ type, className }: { type: OperationType; className?: string }) {
  const cls = className || 'w-4 h-4';
  switch (type) {
    case 'delegation': return <Network className={`${cls} text-blue-400`} />;
    case 'consultation': return <Brain className={`${cls} text-purple-400`} />;
    case 'background': return <Cog className={`${cls} text-amber-400`} />;
    case 'orchestration': return <GitBranch className={`${cls} text-emerald-400`} />;
  }
}

const OP_BORDER: Record<OperationType, string> = {
  delegation: 'border-blue-500/25',
  consultation: 'border-purple-500/25',
  background: 'border-amber-500/25',
  orchestration: 'border-emerald-500/30',
};

const OP_BAR: Record<OperationType, string> = {
  delegation: 'bg-blue-400',
  consultation: 'bg-purple-400',
  background: 'bg-amber-400',
  orchestration: 'bg-emerald-400',
};

function OperationCard({ operation, onStop, onCancelChild }: { operation: TrackedOperation; onStop?: () => void; onCancelChild?: (childId: string) => void }) {
  const [expanded, setExpanded] = useState(operation.status === 'running' || operation.status === 'aggregating');
  const isActive = operation.status === 'running' || operation.status === 'aggregating';
  const done = operation.subAgents.filter(a => a.status === 'complete').length;
  const failed = operation.subAgents.filter(a => a.status === 'failed').length;
  const total = operation.subAgents.length;

  const b = OP_BORDER[operation.type];
  const bar = OP_BAR[operation.type];

  return (
    <div className={`rounded-xl border ${b} bg-[var(--color-surface)] overflow-hidden ${isActive ? '' : 'opacity-80'}`}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--color-surface-hover)]/50 transition-colors text-left">
        {expanded ? <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)] shrink-0 mt-0.5" />}
        <OpIcon type={operation.type} />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-text-muted)] mb-0.5">{opLabel(operation.type)}</p>
          <p className="text-xs text-[var(--color-text)] line-clamp-4 break-words leading-snug">{operation.goal}</p>
        </div>

        {total > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 tabular-nums pt-0.5">{done}/{total}</span>
        )}
        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 tabular-nums pt-0.5">
          {isActive ? <Elapsed startedAt={operation.startedAt} /> : operation.durationMs != null ? fmtDur(operation.durationMs) : null}
        </span>
        {isActive && onStop && (
          <button onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="p-0.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors shrink-0 mt-0.5" title="Stop all">
            <Square className="w-3 h-3 fill-current" />
          </button>
        )}
      </button>

      {/* Progress bar */}
      {isActive && total > 0 && (
        <div className="mx-3 mb-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full ${bar} transition-all duration-500`}
            style={{ width: `${Math.round(((done + failed) / total) * 100)}%` }}
          />
        </div>
      )}

      {/* SubAgents */}
      {expanded && operation.subAgents.length > 0 && (
        <div className="border-t border-[var(--color-border)]/30 py-0.5">
          {operation.subAgents.map(a => <SubAgentRow key={a.id} agent={a} onCancel={onCancelChild} />)}
        </div>
      )}
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{children}</span>
      <div className="flex-1 h-px bg-[var(--color-border)]/50" />
    </div>
  );
}

function SwarmSectionHeader({ hosts, workers }: { hosts: number; workers: number }) {
  if (hosts === 0 && workers === 0) return null;
  return (
    <div className="mb-3 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Agent swarm</span>
        <div className="flex-1 h-px bg-[var(--color-border)]/50" />
      </div>
      <p className="text-[10px] text-[var(--color-text-secondary)] pl-0.5">
        {hosts > 0 && <span>{hosts} host{hosts === 1 ? '' : 's'}</span>}
        {hosts > 0 && workers > 0 && <span> · </span>}
        {workers > 0 && <span>{workers} parallel worker{workers === 1 ? '' : 's'}</span>}
      </p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function TrackerWindow({ config: _config }: { config: WindowConfig }) {
  const [showHistory, setShowHistory] = useState(false);
  const [showAgentHistory, setShowAgentHistory] = useState(false);

  const agentRunning = useComputerStore(s => s.agentRunning);
  const agentThinking = useComputerStore(s => s.agentThinking);
  const taskProgress = useComputerStore(s => s.taskProgress);
  const platformAgents = useComputerStore(s => s.platformAgents);
  const stopChatSession = useComputerStore(s => s.stopChatSession);
  const stopPlatformAgent = useComputerStore(s => s.stopPlatformAgent);
  const sessionTokens = useComputerStore(s => s.sessionTokens);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const operations = useAgentTrackerStore(s => s.operations);
  const resetAll = useAgentTrackerStore(s => s.resetAll);

  const opInActiveChat = (o: TrackedOperation) =>
    !o.sessionKey || o.sessionKey === activeSessionKey;

  // Per-child cancel: send cancel_child message via WebSocket
  const handleCancelChild = useCallback((childId: string) => {
    import('@/services/websocket').then(({ agentWS }) => {
      agentWS.sendCancelChild(childId);
    });
    // Optimistic update
    const tracker = useAgentTrackerStore.getState();
    const opId = tracker.subagentIndex[childId];
    if (opId) tracker.updateSubAgent(opId, childId, { status: 'cancelled' });
  }, []);

  const allOps = Object.values(operations).filter(opInActiveChat);
  const active = allOps.filter(o => o.status === 'running' || o.status === 'aggregating');
  const history = allOps.filter(o => o.status !== 'running' && o.status !== 'aggregating');

  // ── Build unified agent lists ──
  const runningAgents: Array<{ agent: PlatformAgentState; thinking?: string | null; progress?: { step: number; maxSteps: number } | null; onStop?: () => void }> = [];
  const completedAgents: Array<{ agent: PlatformAgentState }> = [];

  const swarm = useMemo(
    () => getSwarmMetrics(platformAgents, agentRunning, operations),
    [platformAgents, agentRunning, operations],
  );

  for (const pa of Object.values(platformAgents)) {
    // Skip 'chat' platform — it's a ghost from old child agent events, treated as desktop
    if (pa.platform === 'chat') continue;
    const isRunning = pa.platform === 'desktop' ? (pa.running || agentRunning) : pa.running;
    if (isRunning) {
      runningAgents.push({
        agent: pa.platform === 'desktop' ? { ...pa, running: true } : pa,
        thinking: pa.platform === 'desktop' ? (agentThinking || pa.thinking) : pa.thinking,
        progress: pa.platform === 'desktop' ? (taskProgress || pa.stepProgress) : pa.stepProgress,
        onStop: pa.platform === 'desktop' ? stopChatSession : () => stopPlatformAgent(pa.platform),
      });
    } else if (pa.completedAt) {
      completedAgents.push({ agent: pa });
    }
  }

  // Desktop running but no platformAgents entry
  if (agentRunning && !platformAgents.desktop?.running && !runningAgents.some(a => a.agent.platform === 'desktop')) {
    runningAgents.unshift({
      agent: { platform: 'desktop', running: true, queueLength: 0 },
      thinking: agentThinking,
      progress: taskProgress,
      onStop: stopChatSession,
    });
  }

  const hasAnything = runningAgents.length > 0 || active.length > 0 || completedAgents.length > 0 || history.length > 0;
  const hasSwarmInProgress = runningAgents.length > 0 || active.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header (clear button only) ── */}
      {history.length > 0 && (
        <div className="flex items-center justify-end px-4 py-1">
          <button onClick={resetAll} className="p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]" title="Clear history">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Orchestrations + platform hosts: one “swarm” view (ops first — main visibility for parallel work) */}
        {hasSwarmInProgress && (
          <section>
            <SwarmSectionHeader hosts={swarm.hosts} workers={swarm.workers} />
            {(() => {
              const orphanedActive = active.filter(op => !runningAgents.some(a => a.agent.platform === op.platform || (op.sessionKey && a.agent.sessionKey === op.sessionKey)));
              return orphanedActive.length > 0 && (
                <div className="space-y-2.5 mb-4">
                  {orphanedActive.map(op => (
                    <OperationCard key={op.id} operation={op} onStop={stopChatSession} onCancelChild={handleCancelChild} />
                  ))}
                </div>
              );
            })()}
            {runningAgents.length > 0 && (
              <div className="space-y-2">
                {runningAgents.map(e => {
                  const agentOps = active.filter(op => op.platform === e.agent.platform || (op.sessionKey && op.sessionKey === e.agent.sessionKey));
                  return (
                    <AgentCard key={e.agent.platform} agent={e.agent} thinking={e.thinking} taskProgress={e.progress} onStop={e.onStop} operations={agentOps} onCancelChild={handleCancelChild} />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Agent History */}
        {completedAgents.length > 0 && (
          <section>
            <button onClick={() => setShowAgentHistory(!showAgentHistory)} className="flex items-center gap-1 mb-2 group w-full">
              {showAgentHistory ? <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" /> : <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]" />}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors">
                Agent History ({completedAgents.length})
              </span>
              <div className="flex-1 h-px bg-[var(--color-border)]/50" />
            </button>
            {showAgentHistory && (
              <div className="space-y-2">
                {completedAgents.sort((a, b) => (b.agent.completedAt || 0) - (a.agent.completedAt || 0)).map(e => {
                  const agentOps = history.filter(op => op.platform === e.agent.platform || (op.sessionKey && op.sessionKey === e.agent.sessionKey));
                  return (
                    <AgentCard key={`h-${e.agent.platform}-${e.agent.completedAt}`} agent={e.agent} compact operations={agentOps} />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Operation History */}
        {(() => {
          const orphanedHistory = history.filter(op => !completedAgents.some(a => a.agent.platform === op.platform || (op.sessionKey && a.agent.sessionKey === op.sessionKey)));
          return orphanedHistory.length > 0 && (
            <section>
              <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-1 mb-2 group w-full">
                {showHistory ? <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" /> : <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]" />}
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors">
                  Operation History ({orphanedHistory.length})
                </span>
                <div className="flex-1 h-px bg-[var(--color-border)]/50" />
              </button>
              {showHistory && (
                <div className="space-y-2">
                  {orphanedHistory.map(op => <OperationCard key={op.id} operation={op} />)}
                </div>
              )}
            </section>
          );
        })()}

        {/* Empty state */}
        {!hasAnything && (
          <div className="flex flex-col items-center justify-center h-full py-12 text-[var(--color-text-muted)]">
            <Bot className="w-8 h-8 opacity-20 mb-3" />
            <p className="text-xs opacity-50">No active agents</p>
          </div>
        )}
      </div>

      {/* Session token footer (dev only — prod users see % in billing) */}
      {import.meta.env.DEV && sessionTokens && sessionTokens.total > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)]/60">
            Session: {sessionTokens.total.toLocaleString()} tokens
          </span>
          {sessionTokens.cost > 0 && (
            <span className="text-[10px] text-[var(--color-text-muted)]/60">
              ${sessionTokens.cost.toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
