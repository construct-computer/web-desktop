import { ExternalLink, X } from 'lucide-react';
import { openSpotlightSession } from '@/lib/spotlightNav';
import {
  findNodeSpec,
  platformLabel,
  type AgentGraphNodeSpec,
} from '@/lib/agentGraphModel';
import type { TrackedOperation } from '@/stores/agentTrackerStore';

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const OP_LABELS: Record<string, string> = {
  delegation: 'Helper task',
  consultation: 'Review',
  background: 'Background task',
  orchestration: 'Parallel work',
};

interface AgentGraphSelectionPanelProps {
  selectedId: string | null;
  nodes: AgentGraphNodeSpec[];
  operations: Record<string, TrackedOperation>;
  onClose: () => void;
  onRelocateCluster: () => void;
}

export function AgentGraphSelectionPanel({
  selectedId,
  nodes,
  operations,
  onClose,
  onRelocateCluster,
}: AgentGraphSelectionPanelProps) {
  const spec = findNodeSpec(nodes, selectedId);
  if (!spec) return null;

  const op = spec.operationId ? operations[spec.operationId] : undefined;
  const elapsed = spec.startedAt ? fmtElapsed(Date.now() - spec.startedAt) : null;
  const sessionKey = spec.sessionKey || op?.sessionKey;

  const openSpotlight = () => {
    void openSpotlightSession(sessionKey);
  };

  return (
    <div
      className="fixed bottom-20 right-4 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl pointer-events-auto flex flex-col overflow-hidden"
      style={{ zIndex: 51 }}
    >
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center gap-2">
        <span className="text-xs font-medium truncate flex-1">{spec.label || 'Agent'}</span>
        <button
          type="button"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-0.5"
          onClick={onClose}
          aria-label="Clear selection"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-2 text-[11px] text-[var(--color-text-muted)]">
        {spec.depth === 0 && (
          <>
            <Row label="Platform" value={platformLabel(spec.platform || 'desktop')} />
            {spec.currentTool && <Row label="Tool" value={spec.currentTool} />}
            {elapsed && <Row label="Running" value={elapsed} />}
            {sessionKey && <Row label="Session" value={sessionKey.slice(0, 12)} mono />}
          </>
        )}

        {spec.depth === 1 && (
          <>
            {spec.opType && <Row label="Type" value={OP_LABELS[spec.opType] || spec.opType} />}
            <Row label="Status" value={spec.status} />
            {op && <Row label="Workers" value={String(op.subAgents.length)} />}
            {elapsed && <Row label="Elapsed" value={elapsed} />}
          </>
        )}

        {spec.depth === 2 && (
          <>
            <Row label="Status" value={spec.status} />
            {spec.currentTool && <Row label="Activity" value={spec.currentTool} />}
            {elapsed && <Row label="Elapsed" value={elapsed} />}
          </>
        )}

        {sessionKey && (
          <button
            type="button"
            onClick={openSpotlight}
            className="w-full mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium bg-[var(--color-accent-muted)] hover:bg-[var(--color-accent-muted)]/80 text-[var(--color-text)] transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open in Spotlight
          </button>
        )}

        {spec.depth === 0 && (
          <button
            type="button"
            onClick={onRelocateCluster}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent-muted)] transition-colors"
          >
            Center cluster on screen
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={`text-[var(--color-text)] truncate max-w-[55%] text-right ${mono ? 'font-mono text-[10px]' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  );
}
