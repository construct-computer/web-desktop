import { useCallback, useState } from 'react';
import { Loader2, Play, Square, TimerReset } from 'lucide-react';
import { useComputerStore, type ChatMessage } from '@/stores/agentStore';

function planLabel(plan?: string): string {
  if (!plan) return 'your plan';
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
}

export function StepLimitCard({ msg, compact = false }: { msg: ChatMessage; compact?: boolean }) {
  const continueSession = useComputerStore(s => s.continueSession);
  const runningSessions = useComputerStore(s => s.runningSessions);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const [submitting, setSubmitting] = useState(false);
  const [stopped, setStopped] = useState(false);
  const limit = msg.iterationLimit?.limit;
  const canContinue = msg.iterationLimit?.canContinue !== false && !stopped;
  const isRunning = activeSessionKey ? runningSessions.has(activeSessionKey) : false;

  const handleContinue = useCallback(async () => {
    if (!canContinue || isRunning || submitting) return;
    setSubmitting(true);
    try {
      await continueSession(activeSessionKey);
    } finally {
      setSubmitting(false);
    }
  }, [activeSessionKey, canContinue, continueSession, isRunning, submitting]);

  // The run is already paused at the step limit, so "Stop" simply acknowledges
  // the prompt and collapses the Continue affordance.
  const handleStop = useCallback(() => setStopped(true), []);

  return (
    <div className={compact ? 'px-0 py-1' : 'px-3 sm:px-6 py-2'}>
      <div className="max-w-[560px] rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5 text-[13px] text-[var(--color-text)] shadow-sm">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-400/10 text-amber-300">
            <TimerReset className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-amber-100/90">Max steps reached</div>
            <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-text-muted)]">
              {msg.content}
              {limit ? ` ${planLabel(msg.iterationLimit?.plan)} allows ${limit} steps per cycle.` : ''}
            </p>
            {canContinue && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={submitting || isRunning}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-300 px-2.5 text-[12px] font-medium text-black transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting || isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {isRunning ? 'Continuing' : 'Continue'}
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={submitting || isRunning}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)]/40 bg-transparent px-2.5 text-[12px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              </div>
            )}
            {stopped && (
              <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">Stopped. Send a new message to pick up where you left off.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
