import { useMemo } from 'react';

import { useAgentStateLabel } from '@/hooks/useAgentStateLabel';
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
}

export interface ClippySubagentItem {
  id: string;
  label: string;
  goal: string;
  status: SubAgentStatus;
  currentActivity: string;
  activityKind: ClippyActivityKind;
  terminalActive: boolean;
}

export interface ClippyActivitySummary {
  headline: string;
  detail: string;
  isActive: boolean;
  isIdle: boolean;
  counts: {
    running: number;
    complete: number;
    failed: number;
    total: number;
  };
  activityFeed: ClippyActivityItem[];
  subagents: ClippySubagentItem[];
}

const MAX_FEED_ITEMS = 5;
const MAX_SUBAGENTS = 6;

function isRunningOperation(op: TrackedOperation): boolean {
  return op.status === 'running' || op.status === 'aggregating';
}

function matchesSession(op: TrackedOperation, activeSessionKey: string): boolean {
  return !op.sessionKey || op.sessionKey === activeSessionKey;
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
  };
}

export function useClippyActivitySummary(): ClippyActivitySummary {
  const { stateLabel, scrollText, isActive, isIdle } = useAgentStateLabel();
  const chatMessages = useComputerStore(s => s.chatMessages);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const operations = useAgentTrackerStore(s => s.operations);
  const terminalRuns = useTerminalStore(s => s.runs);

  return useMemo(() => {
    const allOps = Object.values(operations);
    const runningOpsInView = allOps.filter(op => isRunningOperation(op) && matchesSession(op, activeSessionKey));
    const runningOpsAny = allOps.filter(isRunningOperation);
    const focusedOps = runningOpsInView.length > 0 ? runningOpsInView : runningOpsAny;

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
        label: agent.label || 'Subagent',
        goal: truncate(agent.goal || 'Working on task', 86),
        status: agent.status,
        currentActivity: truncate(agent.currentActivity || lastActivity?.text || agent.goal || 'Starting up', 82),
        activityKind: normalizeKind(lastActivity?.activityType),
        terminalActive: runningTerminal,
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

    const feed: ClippyActivityItem[] = [];

    const recentChatActivity = chatMessages
      .filter(message => message.role === 'activity' && !message.operationId)
      .slice(-8);
    for (const [index, message] of recentChatActivity.entries()) {
      if (!message.content.trim()) continue;
      feed.push({
        id: `main:${timestampOf(message)}:${index}`,
        actor: 'Main',
        text: truncate(message.content, 86),
        kind: normalizeKind(message.activityType),
        timestamp: timestampOf(message),
      });
    }

    for (const agent of focusedSubagents) {
      const latest = agent.activities[agent.activities.length - 1];
      if (!latest?.text.trim()) continue;
      feed.push({
        id: `subagent:${agent.id}:${latest.timestamp}`,
        actor: agent.label || 'Subagent',
        text: truncate(latest.text, 86),
        kind: normalizeKind(latest.activityType),
        timestamp: latest.timestamp,
      });
    }

    for (const run of runs) {
      const belongsToFocusedSubagent = !!run.subagentId && subagentIds.has(run.subagentId);
      const belongsToActiveSession = run.sessionKey === activeSessionKey || (!run.sessionKey && !run.subagentId);
      if (!belongsToFocusedSubagent && !belongsToActiveSession) continue;

      const agent = run.subagentId
        ? focusedSubagents.find(item => item.id === run.subagentId)
        : undefined;
      feed.push(terminalActivity(run, agent?.label || 'Terminal'));
    }

    const activityFeed = feed
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((item, index, items) => items.findIndex(other => other.actor === item.actor && other.text === item.text) === index)
      .slice(0, MAX_FEED_ITEMS);

    return {
      headline: stateLabel,
      detail: scrollText,
      isActive,
      isIdle,
      counts,
      activityFeed,
      subagents,
    };
  }, [activeSessionKey, chatMessages, isActive, isIdle, operations, scrollText, stateLabel, terminalRuns]);
}
