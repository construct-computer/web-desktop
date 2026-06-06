import { useMemo } from 'react';

import { useAgentStateLabel } from '@/hooks/useAgentStateLabel';
import {
  buildToolFeed,
  resolveAgentPreviewFromTurn,
  resolveStatusNarrative,
} from '@/lib/clippyActivityModel';
import { useComputerStore, type ChatMessage } from '@/stores/agentStore';
import {
  useAgentTrackerStore,
  type SubAgentStatus,
  type TrackedOperation,
} from '@/stores/agentTrackerStore';
import { useTerminalStore, type TerminalRun } from '@/stores/terminalStore';

export type ClippyActivityKind =
  | 'browser'
  | 'web'
  | 'terminal'
  | 'file'
  | 'desktop'
  | 'calendar'
  | 'tool'
  | 'delegation'
  | 'background'
  | 'text'
  | 'agent';

export interface ClippyActivityItem {
  id: string;
  actor: string;
  text: string;
  kind: ClippyActivityKind;
  timestamp: number;
  status?: 'running' | 'completed' | 'failed';
  tool?: string;
  activityType?: ChatMessage['activityType'];
  iconPlatform?: string;
  iconUrl?: string;
  failed?: boolean;
  activityStatus?: ChatMessage['activityStatus'];
}

export interface ClippySubagentItem {
  id: string;
  label: string;
  goal: string;
  status: SubAgentStatus;
  currentActivity: string;
  activityKind: ClippyActivityKind;
  terminalActive: boolean;
  tool?: string;
  activityType?: ChatMessage['activityType'];
  iconPlatform?: string;
  iconUrl?: string;
}

export interface ClippyActivitySummary {
  headline: string;
  statusNarrative: string;
  isActive: boolean;
  isIdle: boolean;
  primaryRunningSessionKey?: string;
  counts: {
    running: number;
    complete: number;
    failed: number;
    total: number;
  };
  toolFeed: ClippyActivityItem[];
  subagents: ClippySubagentItem[];
  /** @deprecated Use toolFeed */
  activityFeed: ClippyActivityItem[];
  /** @deprecated Use statusNarrative */
  detail: string;
}

const MAX_SUBAGENTS = 6;
const TOOL_FEED_CAP_DESKTOP = 4;
const TOOL_FEED_CAP_MOBILE = 3;

function isRunningOperation(op: TrackedOperation): boolean {
  return op.status === 'running' || op.status === 'aggregating';
}

function matchesRunningSession(op: TrackedOperation, runningSessions: Set<string>): boolean {
  if (!op.sessionKey) return runningSessions.size > 0;
  return runningSessions.has(op.sessionKey);
}

function coerceActivityType(
  activityType?: string,
): ChatMessage['activityType'] | undefined {
  switch (activityType) {
    case 'browser':
    case 'web':
    case 'terminal':
    case 'file':
    case 'desktop':
    case 'calendar':
    case 'tool':
    case 'delegation':
    case 'background':
    case 'delegation-group':
    case 'consultation-group':
    case 'background-group':
    case 'orchestration-group':
      return activityType;
    default:
      return undefined;
  }
}

function normalizeKind(kind: string | undefined): ClippyActivityKind {
  switch (kind) {
    case 'browser':
    case 'web':
    case 'terminal':
    case 'file':
    case 'desktop':
    case 'calendar':
    case 'tool':
    case 'delegation':
    case 'background':
    case 'text':
      return kind;
    case 'delegation-group':
    case 'consultation-group':
    case 'orchestration-group':
      return 'delegation';
    case 'background-group':
      return 'background';
    default:
      return 'tool';
  }
}

function timestampOf(message: ChatMessage): number {
  const value = message.timestamp;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.now();
}

function truncate(text: string, max: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

function terminalActivity(run: TerminalRun, actor: string): ClippyActivityItem {
  const command = truncate(run.command || 'Terminal command', 74);
  const suffix =
    run.status === 'running'
      ? ''
      : typeof run.exitCode === 'number'
        ? ` · exit ${run.exitCode}`
        : '';
  return {
    id: `terminal:${run.id}`,
    actor,
    text: `Running ${command}${suffix}`,
    kind: 'terminal',
    timestamp: run.endedAt || run.startedAt,
    status: run.status,
    activityType: 'terminal',
    tool: 'terminal',
    activityStatus: run.status === 'running' ? 'running' : 'completed',
  };
}

function activityFromMessage(message: ChatMessage, actor: string, idPrefix: string): ClippyActivityItem | null {
  if (!message.content.trim()) return null;
  return {
    id: `${idPrefix}:${timestampOf(message)}`,
    actor,
    text: truncate(message.content, 86),
    kind: normalizeKind(message.activityType),
    timestamp: timestampOf(message),
    status: message.activityStatus === 'failed' || message.isError ? 'failed' : undefined,
    tool: message.tool,
    activityType: message.activityType,
    iconPlatform: message.iconPlatform,
    iconUrl: message.iconUrl,
    failed: message.activityStatus === 'failed' || message.isError,
    activityStatus: message.activityStatus,
  };
}

export function useClippyActivitySummary(mobile = false): ClippyActivitySummary {
  const {
    stateLabel,
    scrollText,
    isActive,
    isIdle,
    primaryRunningSessionKey,
  } = useAgentStateLabel();
  const chatMessages = useComputerStore(s => s.chatMessages);
  const chatSessions = useComputerStore(s => s.chatSessions);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const runningSessions = useComputerStore(s => s.runningSessions);
  const clippyStatusBySession = useComputerStore(s => s.clippyStatusBySession);
  const agentRunning = useComputerStore(s => s.agentRunning);
  const operations = useAgentTrackerStore(s => s.operations);
  const terminalRuns = useTerminalStore(s => s.runs);

  return useMemo(() => {
    const sessionTitle = (key?: string) =>
      chatSessions.find(s => s.key === key)?.title || (key ? key.slice(0, 12) : 'Main');

    const allOps = Object.values(operations);
    const runningOpsGlobal = allOps.filter(
      (op) => isRunningOperation(op) && matchesRunningSession(op, runningSessions),
    );
    const focusedOps = runningOpsGlobal;

    const focusedSubagents = focusedOps
      .flatMap(op => op.subAgents)
      .sort((a, b) => {
        const rank = (status: SubAgentStatus) => {
          if (status === 'running') return 0;
          if (status === 'pending') return 1;
          if (status === 'failed') return 2;
          if (status === 'complete') return 3;
          return 4;
        };
        const rankDelta = rank(a.status) - rank(b.status);
        if (rankDelta !== 0) return rankDelta;
        return b.startedAt - a.startedAt;
      });

    const subagentIds = new Set(focusedSubagents.map(agent => agent.id));
    const runs = Object.values(terminalRuns);
    const terminalBySubagent = new Map<string, TerminalRun[]>();
    for (const run of runs) {
      if (!run.subagentId) continue;
      const group = terminalBySubagent.get(run.subagentId) || [];
      group.push(run);
      terminalBySubagent.set(run.subagentId, group);
    }

    const subagents: ClippySubagentItem[] = focusedSubagents.slice(0, MAX_SUBAGENTS).map((agent) => {
      const lastActivity = agent.activities[agent.activities.length - 1];
      const agentRuns = terminalBySubagent.get(agent.id) || [];
      const runningTerminal = agentRuns.some(run => run.status === 'running');
      return {
        id: agent.id,
        label: agent.label || 'Helper',
        goal: truncate(agent.goal || 'Working on task', 86),
        status: agent.status,
        currentActivity: truncate(agent.currentActivity || lastActivity?.text || agent.goal || 'Starting up', 82),
        activityKind: normalizeKind(lastActivity?.activityType),
        terminalActive: runningTerminal,
        tool: lastActivity?.tool,
        activityType: coerceActivityType(lastActivity?.activityType),
        iconPlatform: lastActivity?.iconPlatform,
        iconUrl: lastActivity?.iconUrl,
      };
    });

    const counts = focusedSubagents.reduce(
      (acc, agent) => {
        acc.total += 1;
        if (agent.status === 'running' || agent.status === 'pending') acc.running += 1;
        if (agent.status === 'complete') acc.complete += 1;
        if (agent.status === 'failed' || agent.status === 'cancelled') acc.failed += 1;
        return acc;
      },
      { running: 0, complete: 0, failed: 0, total: 0 },
    );

    const hasSubagents = focusedSubagents.length > 0;
    const toolCandidates: ClippyActivityItem[] = [];
    const mainActor = sessionTitle(activeSessionKey);
    const clippyEntries = clippyStatusBySession[activeSessionKey] || [];
    const sessionIsRunning = runningSessions.has(activeSessionKey) || agentRunning;

    const recentChatActivity = chatMessages
      .filter(message => message.role === 'activity' && !message.operationId)
      .slice(-8);
    for (const [index, message] of recentChatActivity.entries()) {
      const item = activityFromMessage(message, 'Main', `main:${index}`);
      if (item) toolCandidates.push(item);
    }

    if (!hasSubagents) {
      for (const agent of focusedSubagents) {
        const latest = agent.activities[agent.activities.length - 1];
        if (!latest?.text.trim()) continue;
        toolCandidates.push({
          id: `subagent:${agent.id}:${latest.timestamp}`,
          actor: agent.label || 'Helper',
          text: truncate(latest.text, 86),
          kind: normalizeKind(latest.activityType),
          timestamp: latest.timestamp,
          tool: latest.tool,
          activityType: coerceActivityType(latest.activityType),
          iconPlatform: latest.iconPlatform,
          iconUrl: latest.iconUrl,
        });
      }
    }

    for (const run of runs) {
      const belongsToFocusedSubagent = !!run.subagentId && subagentIds.has(run.subagentId);
      const belongsToRunningSession = !run.sessionKey || runningSessions.has(run.sessionKey);
      if (hasSubagents && belongsToFocusedSubagent) continue;
      if (!belongsToFocusedSubagent && !belongsToRunningSession) continue;

      const agent = run.subagentId
        ? focusedSubagents.find(item => item.id === run.subagentId)
        : undefined;
      const actor = agent?.label || sessionTitle(run.sessionKey);
      toolCandidates.push(terminalActivity(run, actor));
    }

    const keepPreview = sessionIsRunning || clippyEntries.length > 0;
    const agentPreview = resolveAgentPreviewFromTurn({
      chatMessages,
      clippyEntries,
      keepPreview,
    });

    const statusNarrative = resolveStatusNarrative({
      clippyEntries,
      agentPreview,
      scrollText,
    });

    const toolFeed = buildToolFeed(toolCandidates, { mobile, statusNarrative });
    const toolFeedCap = mobile ? TOOL_FEED_CAP_MOBILE : TOOL_FEED_CAP_DESKTOP;

    return {
      headline: stateLabel,
      statusNarrative,
      isActive,
      isIdle,
      primaryRunningSessionKey,
      counts,
      toolFeed,
      subagents,
      activityFeed: toolFeed,
      detail: statusNarrative,
    };
  }, [
    activeSessionKey,
    agentRunning,
    chatMessages,
    chatSessions,
    clippyStatusBySession,
    isActive,
    isIdle,
    mobile,
    operations,
    primaryRunningSessionKey,
    runningSessions,
    scrollText,
    stateLabel,
    terminalRuns,
  ]);
}
