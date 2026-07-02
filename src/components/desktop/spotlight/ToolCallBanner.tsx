import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Clock, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Square, Check, Copy } from 'lucide-react';
import { useAgentTrackerStore, type TrackedSubAgent } from '@/stores/agentTrackerStore';
import { ActivityIconBadge, MemoryIconBadge } from './ActivityIconBadge';
import logoPng from '@/assets/logo.png';
import {
  memoryActivityTitle,
  memoryActivitySummary,
  policyActivityTitle,
  policyActivitySummary,
} from './ChatEventRow';
import { BrowserActivityRow } from './BrowserActivityRow';
import { BrowserRunCard } from './BrowserRunCard';
import { CompactActivityRow } from './CompactActivityRow';
import { WebToolActivityRow } from './WebToolActivityRow';
import { isBrowserWebTool } from '@/stores/browserTabStore';
import { formatActivityLine } from './formatActivityLine';
import { mergeBrowserRepeats } from './browserActivityUtils';

function isBrowserRunNoise(act: ChatMessage, runId?: string): boolean {
  if (!runId) return false;
  if (act.browserRunId && act.browserRunId !== runId) return false;
  if (act.tool === 'browser' || act.tool === 'remote_browser' || act.tool === 'remote_browser_session') return true;
  if (act.activityType === 'web' && act.browserAction) return true;
  if (act.webPreview && act.tool === 'browser') return true;
  if (typeof act.content === 'string' && act.content.startsWith('Browsing ')) return true;
  return false;
}
import { useElapsed } from './hooks';
import { formatDuration } from './utils';
import type { ChatMessage } from '@/stores/agentStore';
import { useComputerStore } from '@/stores/agentStore';

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
      | { kind: 'activity'; activity: ChatMessage; ts: number; repeat: number }
      | { kind: 'subagent'; agent: TrackedSubAgent; ts: number };

    const mergedMain = mergeBrowserRepeats(mainActivities);
    const entries: TimelineEntry[] = [];
    for (const agent of subAgents) {
      entries.push({ kind: 'subagent', agent, ts: agent.startedAt });
    }
    for (const { act, repeat } of mergedMain) {
      entries.push({
        kind: 'activity',
        activity: act,
        ts: new Date(act.timestamp).getTime(),
        repeat,
      });
    }
    entries.sort((a, b) => a.ts - b.ts);
    return entries;
  }, [hasSubAgents, subAgents, activities]);

  const browserRunMeta = useMemo(() => {
    if (hasSubAgents) return null;
    const start = activities.find(
      (a) => (a.tool === 'browser' || a.tool === 'remote_browser') && (
        (typeof a.content === 'string' && (a.content.startsWith('Browsing ') || a.content.length > 0))
        || !!a.browserAction
      ),
    );
    if (!start) return null;
    const runId = start.browserRunId
      || activities.map((a) => a.browserRunId).find(Boolean);
    const browserRuns = useComputerStore.getState().browserRuns;
    const durableRun = runId ? browserRuns.find((r) => r.run_id === runId) : browserRuns[0];
    const taskGoal = durableRun?.task?.trim();
    const startUrl = start.browserAction?.url
      || (start.content.startsWith('Browsing ') ? start.content.replace(/^Browsing\s+/, '').trim() : undefined);
    return {
      goal: taskGoal || (startUrl ? `Browsing ${startUrl}` : 'Browsing the web'),
      startUrl,
      runId,
    };
  }, [activities, hasSubAgents]);

  const timelineActivities = useMemo(() => {
    if (!browserRunMeta) return activities;
    if (browserRunMeta.runId) {
      return activities.filter((a) => !isBrowserRunNoise(a, browserRunMeta.runId));
    }
    return activities.filter((a) => {
      if (a.tool === 'browser' && typeof a.content === 'string' && a.content.startsWith('Browsing ')) return false;
      if (a.tool === 'browser' && a.browserAction) return false;
      if (a.webPreview && a.tool === 'browser') return false;
      return true;
    });
  }, [activities, browserRunMeta]);

  // Flat activity durations (used when no sub-agents). Browser activities are
  // first collapsed: consecutive identical browser steps fold into one row
  // with a `×N` badge so the panel doesn't drown in repeats.
  const itemsWithDuration = useMemo(() => {
    if (hasSubAgents) return [];
    const merged = mergeBrowserRepeats(timelineActivities);
    // Per-row duration = gap to the next merged group's first activity.
    // Track original-index of the last-activity-in-group to compute that.
    let runningIdx = 0;
    return merged.map((entry, i) => {
      const groupEndIdx = runningIdx + entry.repeat - 1;
      let dur = '';
      const nextGroupStartIdx = groupEndIdx + 1;
      if (nextGroupStartIdx < timelineActivities.length) {
        const diff =
          new Date(timelineActivities[nextGroupStartIdx].timestamp).getTime() -
          new Date(timelineActivities[groupEndIdx].timestamp).getTime();
        if (diff > 500) dur = formatDuration(diff);
      }
      runningIdx += entry.repeat;
      return { act: entry.act, dur, repeat: entry.repeat, key: i };
    });
  }, [timelineActivities, hasSubAgents]);

  const mergedMainStepCount = useMemo(() => {
    if (!hasSubAgents) return 0;
    const subAgentTexts = new Set<string>();
    for (const agent of subAgents) {
      for (const act of agent.activities) {
        subAgentTexts.add(act.text);
      }
    }
    const mainActivities = activities.filter((a) => !subAgentTexts.has(a.content));
    return mergeBrowserRepeats(mainActivities).length;
  }, [hasSubAgents, subAgents, activities]);

  const stepCount = hasSubAgents
    ? subAgents.length + mergedMainStepCount
    : itemsWithDuration.length;

  const collapsedPreview = useMemo(() => {
    if (expanded) return null;
    if (hasSubAgents && subAgents.length > 0) {
      const running = subAgents.find(a => a.status === 'running' || a.status === 'pending');
      const agent = running ?? subAgents[subAgents.length - 1];
      return { kind: 'subagent' as const, text: agent.goal, activityType: undefined, tool: undefined };
    }
    const last = activities[activities.length - 1];
    if (!last) return null;
    return {
      kind: 'activity' as const,
      text: formatActivityLine(last.content, { activityType: last.activityType }),
      activityType: last.activityType,
      tool: last.tool,
      iconPlatform: last.iconPlatform,
      iconUrl: last.iconUrl,
      failed: last.activityStatus === 'failed' || last.isError,
    };
  }, [activities, expanded, hasSubAgents, subAgents]);

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
        <span className="min-w-0 flex-1 text-[12px] text-[var(--color-text-muted)]/60 font-medium truncate">
          {isRunning ? 'Working' : 'Worked'}{durationText ? ` for ${durationText}` : ''}
          {collapsedPreview && (
            <span className="text-[var(--color-text-muted)]/35 font-normal">
              {' · '}{collapsedPreview.text}
            </span>
          )}
        </span>
        {!expanded && !collapsedPreview && (
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

      {browserRunMeta && (
        <div className={`px-3 ${expanded ? 'border-t border-white/[0.04]' : 'pb-2'}`}>
          <div className={expanded ? 'mt-2' : ''}>
            <BrowserRunCard
              goal={browserRunMeta.goal}
              startUrl={browserRunMeta.startUrl}
              runId={browserRunMeta.runId}
              activities={activities}
            />
          </div>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-2.5 border-t border-white/[0.04]">
          <div ref={scrollRef} className="mt-2 max-h-[min(200px,40dvh)] overflow-y-auto pr-0.5">
            {hasSubAgents && timeline ? (
              /* ── Merged timeline: sub-agents + main activities ── */
              timeline.map((entry, i) => {
                if (entry.kind === 'subagent') {
                  return <SubAgentEntry key={entry.agent.id} agent={entry.agent} />;
                }
                return (
                  <FlatActivityLine
                    key={`main-${i}`}
                    activity={entry.activity}
                    repeatCount={entry.repeat}
                  />
                );
              })
            ) : (
              /* ── Flat activity list (no sub-agents) ── */
              itemsWithDuration.map(({ act, dur, repeat, key }) => {
                if (act.memoryActivity) {
                  return (
                    <MemoryTimelineRow
                      key={key}
                      message={act}
                      duration={dur}
                      repeatCount={repeat}
                    />
                  );
                }
                if (act.policyActivity) {
                  return (
                    <PolicyTimelineRow
                      key={key}
                      message={act}
                      duration={dur}
                      repeatCount={repeat}
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
                    />
                  );
                }
                if (act.tool && isBrowserWebTool(act.tool)) {
                  const isFailed = act.activityStatus === 'failed' || act.isError;
                  return (
                    <WebToolActivityRow
                      key={key}
                      message={act}
                      duration={dur}
                      failed={isFailed}
                      repeatCount={repeat}
                    />
                  );
                }
                const isFailed = act.activityStatus === 'failed' || act.isError;
                return (
                  <CompactActivityRow
                    key={key}
                    content={act.content}
                    activityType={act.activityType}
                    tool={act.tool}
                    iconPlatform={act.iconPlatform}
                    iconUrl={act.iconUrl}
                    failed={isFailed}
                    activityStatus={act.activityStatus}
                    duration={dur}
                    repeatCount={repeat}
                    toolCallId={act.toolCallId}
                    cachedOutput={act.cachedOutput}
                    className="hover:bg-white/[0.025]"
                  />
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
        className={`w-full flex items-center gap-2 rounded-md px-1 py-[3px] text-left transition-colors ${hasActivities ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'}`}
      >
        {hasActivities && (
          <span className="flex h-5 w-4 shrink-0 items-center justify-center text-blue-300/70">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}

        {/* Subagent identity icon (Construct logo; manager keeps agents.png) */}
        <ActivityIconBadge
          type="delegation"
          iconUrl={logoPng}
          label={agent.goal}
          failed={isFailed || isCancelled}
          size="sm"
        />

        <span className={`text-[12px] truncate flex-1 ${isRunning ? 'text-[var(--color-text-muted)]/60' : isFailed || isCancelled ? 'text-red-400/60' : 'text-[var(--color-text-muted)]/50'}`}>
          {shortGoal}
        </span>

        <span className="shrink-0 flex items-center justify-center w-3 h-3" aria-hidden />
        {duration && <span className="text-[10px] text-[var(--color-text-muted)]/25 shrink-0 tabular-nums">{duration}</span>}
      </button>

      {expanded && hasActivities && (
        <div className="ml-8 mb-1 border-l border-blue-300/10 pl-3">
          {agent.activities.map((act, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-md py-[2px]">
              <ActivityIconBadge
                type={act.activityType as ChatMessage['activityType']}
                tool={act.tool}
                label={act.text}
                iconPlatform={act.iconPlatform}
                iconUrl={act.iconUrl}
                size="sm"
              />
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

function FlatActivityLine({
  activity,
  repeatCount,
}: {
  activity: ChatMessage;
  repeatCount?: number;
}) {
  if (activity.memoryActivity) {
    return (
      <MemoryTimelineRow
        message={activity}
        repeatCount={repeatCount}
      />
    );
  }
  if (activity.policyActivity) {
    return (
      <PolicyTimelineRow
        message={activity}
        repeatCount={repeatCount}
      />
    );
  }
  if (activity.activityType === 'web' && activity.browserAction) {
    return (
      <BrowserActivityRow
        message={activity}
        repeatCount={repeatCount}
      />
    );
  }
  if (activity.tool && isBrowserWebTool(activity.tool)) {
    return (
      <WebToolActivityRow
        message={activity}
        failed={activity.activityStatus === 'failed' || activity.isError}
        repeatCount={repeatCount}
      />
    );
  }
  return (
    <CompactActivityRow
      content={activity.content}
      activityType={activity.activityType}
      tool={activity.tool}
      iconPlatform={activity.iconPlatform}
      iconUrl={activity.iconUrl}
      failed={activity.activityStatus === 'failed' || activity.isError}
      activityStatus={activity.activityStatus}
      repeatCount={repeatCount}
      toolCallId={activity.toolCallId}
      cachedOutput={activity.cachedOutput}
      className="hover:bg-white/[0.025] text-[var(--color-text-muted)]/50"
    />
  );
}

/* ── Memory timeline row (expandable inside tool banner) ── */

function MemoryTimelineRow({
  message,
  duration,
  repeatCount,
}: {
  message: ChatMessage;
  duration?: string;
  repeatCount?: number;
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
        <MemoryIconBadge size="sm" />
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

/* ── Policy timeline row (expandable inside tool banner) ── */

function PolicyTimelineRow({
  message,
  duration,
  repeatCount,
}: {
  message: ChatMessage;
  duration?: string;
  repeatCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const activity = message.policyActivity!;
  const title = policyActivityTitle(activity);
  const summary = policyActivitySummary(activity);
  const canExpand = activity.items.length > 0;

  return (
    <div className="rounded-md px-1 py-[1px] hover:bg-white/[0.025]">
      <div className="flex items-start gap-2.5">
        <MemoryIconBadge size="sm" />
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
                  <p key={item.id} className="text-[var(--color-text-muted)]/62">
                    <span className="text-[var(--color-text-muted)]/70">{item.title}</span>
                    {item.description ? ` — ${item.description}` : ''}
                  </p>
                ))}
              </div>
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
