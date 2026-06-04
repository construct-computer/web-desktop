import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fmtClock, formatTool } from '@/lib/workStatusFormat';
import type { WorkOrderStepDetail } from '@/services/api';

const COLLAPSED_STEP_COUNT = 3;

function StepEvidence({ evidence }: { evidence: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsExpand = evidence.length > 120;

  return (
    <span className="block text-[var(--color-text-muted)] mt-0.5 break-words">
      <span className={expanded ? '' : 'line-clamp-2'}>{evidence}</span>
      {needsExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[9px] text-[var(--color-accent)] mt-0.5 hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </span>
  );
}

export function TaskTimeline({ steps, emptyMessage }: { steps: WorkOrderStepDetail[]; emptyMessage: string }) {
  const [showAll, setShowAll] = useState(false);

  if (steps.length === 0) {
    return <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">{emptyMessage}</p>;
  }

  const visible = showAll || steps.length <= COLLAPSED_STEP_COUNT
    ? steps
    : steps.slice(-COLLAPSED_STEP_COUNT);
  const hiddenCount = steps.length - visible.length;

  return (
    <div>
      {hiddenCount > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1 text-[9px] text-[var(--color-text-muted)] mb-1.5 hover:text-[var(--color-text)]"
        >
          <ChevronRight className="w-3 h-3" />
          Show {hiddenCount} earlier step{hiddenCount === 1 ? '' : 's'}
        </button>
      )}
      {showAll && steps.length > COLLAPSED_STEP_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="flex items-center gap-1 text-[9px] text-[var(--color-text-muted)] mb-1.5 hover:text-[var(--color-text)]"
        >
          <ChevronDown className="w-3 h-3" />
          Show latest only
        </button>
      )}
      <ul className="space-y-2">
        {visible.map((step) => (
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
              {step.evidence && <StepEvidence evidence={step.evidence} />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
