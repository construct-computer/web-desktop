import { useState, useEffect } from 'react';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useAgentTrackerStore } from '@/stores/agentTrackerStore';
import { SubAgentEntry } from './ToolCallBanner';
import { useElapsed } from './hooks';
import { formatDuration } from './utils';

/**
 * Standalone operation row when a spawn batch has no adjacent tool-activity
 * lines — still shows sub-agents and progress (mirrors the ToolCallBanner shell).
 */
export function OperationCard({ operationId, label }: { operationId: string; label: string }) {
  const op = useAgentTrackerStore(s => s.operations[operationId]);
  const isRunning = op ? op.status === 'running' || op.status === 'aggregating' : true;
  const [expanded, setExpanded] = useState(isRunning);

  const subAgents = op?.subAgents ?? [];
  const startTime = op?.startedAt ?? Date.now();
  const elapsed = useElapsed(startTime, isRunning);
  const totalMs = op?.durationMs ?? 0;
  const durationText = isRunning ? elapsed : totalMs > 0 ? formatDuration(totalMs) : '';

  useEffect(() => {
    if (op && (op.status === 'running' || op.status === 'aggregating')) setExpanded(true);
  }, [op?.status, op?.id]);

  const headline = op?.goal?.trim() || label;

  return (
    <div className="mx-4 my-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]/40 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]/40 shrink-0" />}
        <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]/50 shrink-0" />
        <span className="text-[12px] text-[var(--color-text-muted)]/60 font-medium truncate flex-1 min-w-0" title={headline}>
          {headline}
        </span>
        <span className="text-[12px] text-[var(--color-text-muted)]/50">
          {isRunning ? 'Working' : 'Done'}
          {durationText ? ` for ${durationText}` : ''}
        </span>
        {isRunning && (
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </button>

      {expanded && subAgents.length > 0 && (
        <div className="px-3.5 pb-2.5 border-t border-white/[0.04]">
          <div className="ml-1 mt-1.5 space-y-0.5 max-h-[200px] overflow-y-auto">
            {subAgents.map((a) => (
              <SubAgentEntry key={a.id} agent={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
