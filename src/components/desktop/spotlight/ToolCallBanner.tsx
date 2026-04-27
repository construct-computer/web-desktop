import { useState, useMemo, useRef, useEffect } from 'react';
import { Clock, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Square } from 'lucide-react';
import { useAgentTrackerStore, type TrackedSubAgent } from '@/stores/agentTrackerStore';
import { ActivityIcon } from './ActivityGroup';
import { BrowserActivityRow, mergeBrowserRepeats } from './BrowserActivityRow';
import { BrowserRunCard } from './BrowserRunCard';
import { useElapsed } from './hooks';
import { formatDuration } from './utils';
import type { ChatMessage } from '@/stores/agentStore';

const EMPTY_SUB_AGENTS: TrackedSubAgent[] = [];

/**
 * ToolCallBanner — Unified "Working/Worked for Xs" banner showing a timeline
 * of tool calls and sub-agent operations.
 *
 * When an operationId is present and sub-agents exist, renders a merged view:
 * - Main agent activities at the top level
 * - Sub-agents as expandable nested entries with their own tool calls
 * All in chronological order.
 */
export function ToolCallBanner({ activities, operationId, isActive }: { activities: ChatMessage[]; operationId?: string; isActive?: boolean }) {
  const op = useAgentTrackerStore(s => operationId ? s.operations[operationId] : undefined);
  const isRunning = isActive || (op ? op.status === 'running' : false);
  const [expanded, setExpanded] = useState(isRunning);
  const [fallbackStartTime] = useState(() => Date.now());

  // Compute total duration from activities or operation
  const totalMs = op?.durationMs ??
    (activities.length >= 2
      ? new Date(activities[activities.length - 1].timestamp).getTime() - new Date(activities[0].timestamp).getTime()
      : 0);

  const startTime = op?.startedAt ?? (activities.length > 0 ? new Date(activities[0].timestamp).getTime() : fallbackStartTime);
  const elapsed = useElapsed(startTime, isRunning);
  const durationText = isRunning ? elapsed : (totalMs > 0 ? formatDuration(totalMs) : '');

  const subAgents = op?.subAgents ?? EMPTY_SUB_AGENTS;
  const hasSubAgents = subAgents.length > 0;

  // Build unified timeline when sub-agents are present
  const timeline = useMemo(() => {
    if (!hasSubAgents) return null;

    // Collect all sub-agent activity texts for deduplication
    const subAgentTexts = new Set<string>();
    for (const agent of subAgents) {
      for (const act of agent.activities) {
        subAgentTexts.add(act.text);
      }
    }

    // Filter to main-agent-only activities (not duplicated in sub-agents)
    const mainActivities = activities.filter(a => !subAgentTexts.has(a.content));

    type TimelineEntry =
      | { kind: 'activity'; activity: ChatMessage; ts: number }
      | { kind: 'subagent'; agent: TrackedSubAgent; ts: number };

    const entries: TimelineEntry[] = [];
    for (const agent of subAgents) {
      entries.push({ kind: 'subagent', agent, ts: agent.startedAt });
    }
    for (const act of mainActivities) {
      entries.push({ kind: 'activity', activity: act, ts: new Date(act.timestamp).getTime() });
    }
    entries.sort((a, b) => a.ts - b.ts);
    return entries;
  }, [hasSubAgents, subAgents, activities]);

  // Flat activity durations (used when no sub-agents). Browser activities are
  // first collapsed: consecutive identical browser steps fold into one row
  // with a `×N` badge so the panel doesn't drown in repeats.
  const itemsWithDuration = useMemo(() => {
    if (hasSubAgents) return [];
    const merged = mergeBrowserRepeats(activities);
    // Per-row duration = gap to the next merged group's first activity.
    // Track original-index of the last-activity-in-group to compute that.
    let runningIdx = 0;
    return merged.map((entry, i) => {
      const groupEndIdx = runningIdx + entry.repeat - 1;
      let dur = '';
      const nextGroupStartIdx = groupEndIdx + 1;
      if (nextGroupStartIdx < activities.length) {
        const diff =
          new Date(activities[nextGroupStartIdx].timestamp).getTime() -
          new Date(activities[groupEndIdx].timestamp).getTime();
        if (diff > 500) dur = formatDuration(diff);
      }
      runningIdx += entry.repeat;
      return { act: entry.act, dur, repeat: entry.repeat, key: i };
    });
  }, [activities, hasSubAgents]);

  // Detect a browser run for the main agent so we can promote it to a
  // dedicated card above the activity list. We key on the first "Browsing X"
  // activity emitted by browser:start. Sub-agent banners skip this — their
  // browser context already shows up inside the SubAgentEntry tree.
  const browserRunMeta = useMemo(() => {
    if (hasSubAgents) return null;
    const start = activities.find(
      (a) => (a.tool === 'browser' || a.tool === 'remote_browser') && typeof a.content === 'string' && a.content.startsWith('Browsing '),
    );
    if (!start) return null;
    const startUrl = start.content.replace(/^Browsing\s+/, '').trim() || undefined;
    return { goal: startUrl ? `Browsing ${startUrl}` : 'Browsing the web', startUrl };
  }, [activities, hasSubAgents]);

  const stepCount = hasSubAgents
    ? subAgents.length + activities.length
    : activities.length;

  // Auto-scroll to bottom of the tool list when new items appear
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded, activities.length, subAgents.length]);

  if (activities.length === 0 && !op) return null;

  return (
    <div className="mx-4 my-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]/40 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]/40 shrink-0" />}
        <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]/50 shrink-0" />
        <span className="text-[12px] text-[var(--color-text-muted)]/60 font-medium">
          {isRunning ? 'Working' : 'Worked'}{durationText ? ` for ${durationText}` : ''}
        </span>
        {!expanded && (
          <span className="text-[10px] text-[var(--color-text-muted)]/30 ml-auto shrink-0">
            {hasSubAgents
              ? `${subAgents.length} agent${subAgents.length !== 1 ? 's' : ''}`
              : `${stepCount} step${stepCount !== 1 ? 's' : ''}`}
          </span>
        )}
        {isRunning && (
          <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 border-t border-white/[0.04]">
          {browserRunMeta && (
            <div className="mt-2">
              <BrowserRunCard
                goal={browserRunMeta.goal}
                startUrl={browserRunMeta.startUrl}
                activities={activities}
              />
            </div>
          )}
          <div ref={scrollRef} className="ml-1 mt-1.5 space-y-0.5 max-h-[200px] overflow-y-auto">
            {hasSubAgents && timeline ? (
              /* ── Merged timeline: sub-agents + main activities ── */
              timeline.map((entry, i) => {
                if (entry.kind === 'subagent') {
                  return <SubAgentEntry key={entry.agent.id} agent={entry.agent} />;
                }
                return <FlatActivityLine key={`main-${i}`} activity={entry.activity} />;
              })
            ) : (
              /* ── Flat activity list (no sub-agents) ── */
              itemsWithDuration.map(({ act, dur, repeat, key }) => {
                if (act.activityType === 'web' && act.browserAction) {
                  return (
                    <BrowserActivityRow
                      key={key}
                      message={act}
                      duration={dur || undefined}
                      repeatCount={repeat}
                    />
                  );
                }
                const isTerminal = act.activityType === 'terminal';
                return (
                  <div key={key} className="flex items-center gap-2.5 py-[2px]">
                    <div className="relative flex items-center justify-center w-5">
                      {key > 0 && (
                        <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-px h-[6px] bg-white/[0.06]" />
                      )}
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]/20" />
                    </div>
                    <div className="w-5 h-5 shrink-0 rounded-md flex items-center justify-center bg-white/[0.04] text-[var(--color-text-muted)]/40">
                      <ActivityIcon type={act.activityType} className="w-3 h-3" />
                    </div>
                    <span className={`text-[12px] text-[var(--color-text-muted)]/50 truncate flex-1 ${isTerminal ? 'font-mono' : ''}`}>
                      {act.content}
                    </span>
                    {dur && (
                      <span className="text-[10px] text-[var(--color-text-muted)]/25 shrink-0 tabular-nums">
                        {dur}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-agent entry (expandable with nested activities) ── */

export function SubAgentEntry({ agent }: { agent: TrackedSubAgent }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = agent.status === 'running' || agent.status === 'pending';
  const isFailed = agent.status === 'failed';
  const isCancelled = agent.status === 'cancelled';
  const elapsed = useElapsed(agent.startedAt, isRunning);
  const duration = agent.durationMs ? formatDuration(agent.durationMs) : elapsed;
  const shortGoal = agent.goal.length > 60 ? agent.goal.slice(0, 60) + '...' : agent.goal;
  const hasActivities = agent.activities.length > 0;

  return (
    <div>
      <button
        onClick={() => hasActivities && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 py-1 text-left rounded-md transition-colors ${hasActivities ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'}`}
      >
        {/* Expand chevron */}
        <div className="w-5 flex items-center justify-center shrink-0">
          {hasActivities ? (
            expanded
              ? <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]/30" />
              : <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]/30" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]/20" />
          )}
        </div>

        {/* Status icon */}
        {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)] shrink-0" />
          : isFailed ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          : isCancelled ? <Square className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}

        <span className={`text-[12px] truncate flex-1 ${isRunning ? 'text-[var(--color-text-muted)]/60' : isFailed || isCancelled ? 'text-red-400/60' : 'text-[var(--color-text-muted)]/50'}`}>
          {shortGoal}
        </span>
        {duration && <span className="text-[10px] text-[var(--color-text-muted)]/25 shrink-0 tabular-nums">{duration}</span>}
      </button>

      {expanded && hasActivities && (
        <div className="ml-7 pl-3 border-l border-white/[0.06] mb-1">
          {agent.activities.map((act, i) => (
            <div key={i} className="flex items-center gap-2.5 py-[2px]">
              <div className="w-5 h-5 shrink-0 rounded-md flex items-center justify-center bg-white/[0.04] text-[var(--color-text-muted)]/40">
                <ActivityIcon type={act.activityType as ChatMessage['activityType']} className="w-3 h-3" />
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)]/40 truncate flex-1">
                {act.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Flat activity line (for main-agent activities in merged timeline) ── */

function FlatActivityLine({ activity }: { activity: ChatMessage }) {
  const isTerminal = activity.activityType === 'terminal';
  return (
    <div className="flex items-center gap-2.5 py-[2px]">
      <div className="flex items-center justify-center w-5">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]/20" />
      </div>
      <div className="w-5 h-5 shrink-0 rounded-md flex items-center justify-center bg-white/[0.04] text-[var(--color-text-muted)]/40">
        <ActivityIcon type={activity.activityType} className="w-3 h-3" />
      </div>
      <span className={`text-[12px] text-[var(--color-text-muted)]/50 truncate flex-1 ${isTerminal ? 'font-mono' : ''}`}>
        {activity.content}
      </span>
    </div>
  );
}
