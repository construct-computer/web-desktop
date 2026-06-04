import type { TerminalRun } from '@/stores/terminalStore';
import {
  formatBytes,
  formatClock,
  formatDuration,
  runMatches,
  statusClass,
} from './terminalTheme';

interface TerminalRunIndexProps {
  runs: TerminalRun[];
  filteredRuns: TerminalRun[];
  focusedRunId?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectRun: (runId: string) => void;
  className?: string;
}

export function TerminalRunIndex({
  runs,
  filteredRuns,
  focusedRunId,
  searchQuery,
  onSearchChange,
  onSelectRun,
  className = '',
}: TerminalRunIndexProps) {
  const totalBytes = runs.reduce((total, run) => total + run.outputBytes, 0);

  return (
    <aside className={`flex min-h-0 flex-col border-[var(--color-border)] ${className}`}>
      <div className="shrink-0 border-b border-[var(--color-border)] p-2">
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search commands and output"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-subtle)]"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--color-text-subtle)]">
          <span>{filteredRuns.length} shown</span>
          <span>{formatBytes(totalBytes)}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredRuns.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] p-3 text-[11px] text-[var(--color-text-muted)]">
            {searchQuery.trim()
              ? 'No commands match this filter.'
              : 'No commands yet. Output appears here when Construct runs shell commands.'}
          </div>
        ) : (
          filteredRuns.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelectRun(run.id)}
              className={`mb-1.5 w-full rounded-md border p-2 text-left transition-colors ${
                focusedRunId === run.id
                  ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)]/50 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${statusClass(run)}`}>
                  {run.status}
                </span>
                <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">
                  {formatClock(run.startedAt)}
                </span>
              </div>
              <div className="line-clamp-2 font-mono text-[11px] leading-snug text-[var(--color-text)]">
                $ {run.command}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--color-text-subtle)]">
                <span>{run.exitCode !== undefined ? `exit ${run.exitCode}` : 'running'}</span>
                <span>
                  {formatDuration(run.durationMs)} / {formatBytes(run.outputBytes)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

export function filterRunsByQuery(runs: TerminalRun[], searchQuery: string): TerminalRun[] {
  return runs.filter((run) => runMatches(run, searchQuery));
}
