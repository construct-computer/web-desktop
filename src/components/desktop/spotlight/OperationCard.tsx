import { useState } from 'react';
import { Network, CheckCircle2, XCircle, Square, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useAgentTrackerStore, type TrackedSubAgent } from '@/stores/agentTrackerStore';
import { useElapsed } from './hooks';

function SubAgentLine({ agent }: { agent: TrackedSubAgent }) {
  const isRunning = agent.status === 'running' || agent.status === 'pending';
  const isFailed = agent.status === 'failed';
  const isCancelled = agent.status === 'cancelled';
  const elapsed = useElapsed(agent.startedAt, isRunning);
  const duration = agent.durationMs ? `${Math.round(agent.durationMs / 1000)}s` : elapsed;
  const shortGoal = agent.goal.length > 50 ? agent.goal.slice(0, 50) + '...' : agent.goal;

  return (
    <div className="flex items-center gap-1.5 py-0.5 ml-1">
      {isRunning ? <Loader2 className="w-3 h-3 animate-spin text-[var(--color-accent)] shrink-0" />
        : isFailed ? <XCircle className="w-3 h-3 text-red-400 shrink-0" />
        : isCancelled ? <Square className="w-3 h-3 text-gray-500 shrink-0" />
        : <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
      <span className={`text-[11px] truncate flex-1 ${isRunning ? 'text-[var(--color-text-muted)]' : (isFailed || isCancelled) ? 'text-red-400/70' : 'text-[var(--color-text-muted)]/60'}`}>
        {shortGoal}
      </span>
      {duration && <span className="text-[10px] text-[var(--color-text-muted)]/40 shrink-0">{duration}</span>}
    </div>
  );
}

export function OperationCard({ operationId, label }: { operationId: string; label: string }) {
  const op = useAgentTrackerStore(s => s.operations[operationId]);
  const [expanded, setExpanded] = useState(true);
  if (!op) return null;
  const done = op.subAgents.filter(a => a.status === 'complete').length;
  const total = op.subAgents.length;

  return (
    <div className="mx-4 my-1 rounded-lg border border-emerald-500/15 bg-white/5 dark:bg-white/[0.02] overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5 transition-colors">
        {expanded ? <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" /> : <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />}
        <Network className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-[11px] text-[var(--color-text)] truncate flex-1">{label}</span>
        <span className="text-[10px] text-[var(--color-text-muted)]/50">{done}/{total}</span>
      </button>
      {expanded && op.subAgents.length > 0 && (
        <div className="px-2 pb-1.5 border-t border-white/5">
          {op.subAgents.map(a => <SubAgentLine key={a.id} agent={a} />)}
        </div>
      )}
    </div>
  );
}
