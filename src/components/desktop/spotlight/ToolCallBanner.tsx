import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Clock, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Square, Brain, Check, Copy } from 'lucide-react';
import { useAgentTrackerStore, type TrackedSubAgent } from '@/stores/agentTrackerStore';
import { ActivityIcon } from './ActivityIcon';
import { ACTIVITY_ICON_CLASS } from './activityStyles';
import { memoryActivityTitle, memoryActivitySummary } from './ChatEventRow';
import { BrowserActivityRow } from './BrowserActivityRow';
import { BrowserRunCard } from './BrowserRunCard';
import { mergeBrowserRepeats } from './browserActivityUtils';
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
    <div className="mx-4 my-1.5 rounded-lg border border-white/[0.06] bg-white/[0.025] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-white/[0.035] transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-blue-300/70 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-blue-300/70 shrink-0" />}
        <Clock className="w-3.5 h-3.5 text-blue-300/70 shrink-0" />
        <span className="text-[12px] text-[var(--color-text-muted)]/60 font-medium">
          {isRunning ? 'Working' : 'Worked'}{durationText ? ` for ${durationText}` : ''}
        </span>
        {!expanded && (
          <span className="text-[10px] text-[var(--color-text-muted)]/30 ml-auto shrink-0">
            {hasSubAgents
              ? `${subAgents.length} helper${subAgents.length !== 1 ? 's' : ''}`
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
          <div ref={scrollRef} className="mt-2 max-h-[200px] overflow-y-auto pr-0.5">
            {hasSubAgents && timeline ? (
              /* ── Merged timeline: sub-agents + main activities ── */
              timeline.map((entry, i) => {
                if (entry.kind === 'subagent') {
                  return <SubAgentEntry key={entry.agent.id} agent={entry.agent} isFirst={i === 0} isLast={i === timeline.length - 1} />;
                }
                return <FlatActivityLine key={`main-${i}`} activity={entry.activity} isFirst={i === 0} isLast={i === timeline.length - 1} />;
              })
            ) : (
              /* ── Flat activity list (no sub-agents) ── */
              itemsWithDuration.map(({ act, dur, repeat, key }, index) => {
                if (act.memoryActivity) {
                  return (
                    <MemoryTimelineRow
                      key={key}
                      message={act}
                      duration={dur}
                      repeatCount={repeat}
                      isFirst={index === 0}
                      isLast={index === itemsWithDuration.length - 1}
                    />
                  );
                }
                if (act.activityType === 'web' && act.browserAction) {
                  return (
                    <BrowserActivityRow
                      key={key}
                      message={act}
                      duration={dur || undefined}
                      repeatCount={repeat}
                      isFirst={index === 0}
                      isLast={index === itemsWithDuration.length - 1}
                    />
                  );
                }
                const isTerminal = act.activityType === 'terminal';
                const isFailed = act.activityStatus === 'failed' || act.isError;
                return (
                  <div key={key} className="flex items-center gap-2.5 rounded-md px-1 py-[3px] hover:bg-white/[0.025]">
                    <div className="relative flex h-7 w-5 shrink-0 items-center justify-center">
                      {index > 0 && <div className="absolute top-0 h-1/2 w-px bg-blue-300/10" />}
                      {index < itemsWithDuration.length - 1 && <div className="absolute bottom-0 h-1/2 w-px bg-blue-300/10" />}
                      <div className={`relative z-10 h-1.5 w-1.5 rounded-full ring-2 ring-[var(--color-surface)] ${isFailed ? 'bg-red-300/70' : 'bg-blue-300/45'}`} />
                    </div>
                    <div className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${isFailed ? 'bg-red-500/10 text-red-300/80' : ACTIVITY_ICON_CLASS}`}>
                      <ActivityIcon type={act.activityType} tool={act.tool} label={act.content} className="w-3 h-3" />
                    </div>
                    <span className={`text-[12px] truncate flex-1 ${isTerminal ? 'font-mono' : ''} ${isFailed ? 'text-red-300/75' : 'text-[var(--color-text-muted)]/50'}`}>
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

export function SubAgentEntry({ agent, isFirst = false, isLast = false }: { agent: TrackedSubAgent; isFirst?: boolean; isLast?: boolean }) {
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
        className={`w-full flex items-center gap-2 rounded-md px-1 py-[3px] text-left transition-colors ${hasActivities ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'}`}
      >
        {/* Expand chevron */}
        <div className="relative flex h-7 w-5 shrink-0 items-center justify-center">
          {!isFirst && <div className="absolute top-0 h-1/2 w-px bg-blue-300/10" />}
          {!isLast && <div className="absolute bottom-0 h-1/2 w-px bg-blue-300/10" />}
          {hasActivities ? (
            expanded
              ? <ChevronDown className="relative z-10 w-3 h-3 text-blue-300/70" />
              : <ChevronRight className="relative z-10 w-3 h-3 text-blue-300/70" />
          ) : (
            <div className="relative z-10 h-1.5 w-1.5 rounded-full bg-blue-300/45 ring-2 ring-[var(--color-surface)]" />
          )}
        </div>

        {/* Status icon */}
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${ACTIVITY_ICON_CLASS}`}>
          {isRunning ? <Loader2 className="w-3 h-3 animate-spin" />
            : isFailed ? <XCircle className="w-3 h-3" />
            : isCancelled ? <Square className="w-3 h-3" />
            : <CheckCircle2 className="w-3 h-3" />}
        </span>

        <span className={`text-[12px] truncate flex-1 ${isRunning ? 'text-[var(--color-text-muted)]/60' : isFailed || isCancelled ? 'text-red-400/60' : 'text-[var(--color-text-muted)]/50'}`}>
          {shortGoal}
        </span>
        {duration && <span className="text-[10px] text-[var(--color-text-muted)]/25 shrink-0 tabular-nums">{duration}</span>}
      </button>

      {expanded && hasActivities && (
        <div className="ml-8 mb-1 border-l border-blue-300/10 pl-3">
          {agent.activities.map((act, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-md py-[2px]">
              <div className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${ACTIVITY_ICON_CLASS}`}>
                <ActivityIcon type={act.activityType as ChatMessage['activityType']} label={act.text} className="w-3 h-3" />
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

function FlatActivityLine({ activity, isFirst = false, isLast = false }: { activity: ChatMessage; isFirst?: boolean; isLast?: boolean }) {
  const isTerminal = activity.activityType === 'terminal';
  return (
    <div className="flex items-center gap-2.5 rounded-md px-1 py-[3px] hover:bg-white/[0.025]">
      <div className="relative flex h-7 w-5 shrink-0 items-center justify-center">
        {!isFirst && <div className="absolute top-0 h-1/2 w-px bg-blue-300/10" />}
        {!isLast && <div className="absolute bottom-0 h-1/2 w-px bg-blue-300/10" />}
        <div className="relative z-10 h-1.5 w-1.5 rounded-full bg-blue-300/45 ring-2 ring-[var(--color-surface)]" />
      </div>
      <div className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${ACTIVITY_ICON_CLASS}`}>
        <ActivityIcon type={activity.activityType} tool={activity.tool} label={activity.content} className="w-3 h-3" />
      </div>
      <span className={`text-[12px] text-[var(--color-text-muted)]/50 truncate flex-1 ${isTerminal ? 'font-mono' : ''}`}>
        {activity.content}
      </span>
    </div>
  );
}

/* ── Memory timeline row (expandable inside tool banner) ── */

function MemoryTimelineRow({
  message,
  duration,
  repeatCount,
  isFirst = false,
  isLast = false,
}: {
  message: ChatMessage;
  duration?: string;
  repeatCount?: number;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const activity = message.memoryActivity!;
  const title = memoryActivityTitle(activity);
  const summary = memoryActivitySummary(activity);
  const canExpand = activity.items.length > 0;

  const handleCopy = useCallback(() => {
    const memoryText = activity.items.map((item) => item.memory).join('\n');
    navigator.clipboard.writeText(memoryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activity]);

  return (
    <div className="rounded-md px-1 py-[1px] hover:bg-white/[0.025]">
      <div className="flex items-start gap-2.5">
        <div className="relative flex h-7 w-5 shrink-0 items-center justify-center">
          {!isFirst && <div className="absolute top-0 h-1/2 w-px bg-blue-300/10" />}
          {!isLast && <div className="absolute bottom-0 h-1/2 w-px bg-blue-300/10" />}
          <div className="relative z-10 h-1.5 w-1.5 rounded-full bg-blue-300/45 ring-2 ring-[var(--color-surface)]" />
        </div>
        <div className={`mt-[1px] w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${ACTIVITY_ICON_CLASS}`}>
          <Brain className="w-3 h-3" />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={!canExpand}
            onClick={() => canExpand && setExpanded(!expanded)}
            className="group flex max-w-full items-center gap-1.5 text-left text-[12px] leading-4 text-[var(--color-text-muted)]/55 disabled:cursor-default"
          >
            <span className="shrink-0 font-medium">{title}</span>
            {summary && (
              <>
                <span className="shrink-0 text-[var(--color-text-muted)]/22">·</span>
                <span className="min-w-0 truncate text-[var(--color-text-muted)]/40 group-hover:text-[var(--color-text-muted)]/55">
                  {summary}
                </span>
              </>
            )}
            {repeatCount && repeatCount > 1 && (
              <span className="text-[10px] px-1.5 py-px rounded-full bg-white/[0.06] text-[var(--color-text-muted)]/50 shrink-0">
                ×{repeatCount}
              </span>
            )}
            {canExpand && (
              <span className="shrink-0 text-[var(--color-text-muted)]/25 group-hover:text-[var(--color-text-muted)]/45">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </span>
            )}
          </button>

          {expanded && canExpand && (
            <div className="mt-0.5 max-w-2xl border-l border-white/5 pl-2 text-[10px] leading-4 text-[var(--color-text-muted)]/55">
              <div className="space-y-0.5">
                {activity.items.map((item) => (
                  <div key={item.id} className="whitespace-pre-wrap break-words text-[var(--color-text-muted)]/62">
                    {item.memory}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]/35 hover:text-[var(--color-text-muted)]/62"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
        {duration && (
          <span className="text-[10px] text-[var(--color-text-muted)]/25 shrink-0 tabular-nums mt-[2px]">
            {duration}
          </span>
        )}
      </div>
    </div>
  );
}
