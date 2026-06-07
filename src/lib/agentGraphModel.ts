import type { OperationType, TrackedOperation } from '@/stores/agentTrackerStore';

/** Minimal platform snapshot used to build the agent graph (decoupled from store types). */
export interface AgentGraphPlatformState {
  platform?: string;
  running: boolean;
  currentTask?: string;
  currentTool?: string;
  sessionKey?: string;
  startedAt?: number;
}

export const COMPLETED_TTL = 90_000;

export interface AgentGraphNodeSpec {
  id: string;
  label: string;
  status: string;
  depth: number;
  alpha: number;
  parentId?: string;
  startedAt?: number;
  currentTool?: string;
  sessionKey?: string;
  platform?: string;
  opType?: OperationType;
  operationId?: string;
  subAgentId?: string;
  cluster: string;
}

export interface AgentGraphEdgeSpec {
  source: string;
  target: string;
  active: boolean;
  alpha: number;
  springLen: number;
  label?: string;
}

export interface AgentGraphBuildResult {
  nodes: AgentGraphNodeSpec[];
  edges: AgentGraphEdgeSpec[];
  visible: boolean;
  clusterSpread: number;
}

const CLUSTER_SPREAD_BASE = 150;

const OP_TYPE_LABELS: Record<string, string> = {
  delegation: 'Helper task',
  consultation: 'Review',
  background: 'Background',
  orchestration: 'Parallel work',
};

function shortGraphLabel(text: string, max: number): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, Math.max(1, max - 1)) + '\u2026';
}

export function platformLabel(platform: string): string {
  switch (platform) {
    case 'slack': return 'Slack';
    case 'telegram': return 'Telegram';
    case 'calendar': return 'Calendar';
    case 'email': return 'Email';
    case 'desktop': return 'Desktop';
    default: return platform;
  }
}

export function fadeAlpha(op: TrackedOperation, now: number): number {
  if (op.status === 'running' || op.status === 'aggregating') return 1;
  if (!op.completedAt) return 0.5;
  return Math.max(0.12, 1 - (now - op.completedAt) / COMPLETED_TTL);
}

/** Edges fade slower than nodes so completed trees stay readable. */
export function fadeEdgeAlpha(op: TrackedOperation, now: number): number {
  if (op.status === 'running' || op.status === 'aggregating') return 1;
  if (!op.completedAt) return 0.7;
  return Math.max(0.5, 1 - (now - op.completedAt) / COMPLETED_TTL);
}

export function buildAgentGraph(input: {
  running: boolean;
  operations: Record<string, TrackedOperation>;
  platformAgents: Record<string, AgentGraphPlatformState>;
  now: number;
}): AgentGraphBuildResult {
  const { running, operations, platformAgents, now } = input;

  const platformSpecs: AgentGraphNodeSpec[] = [];
  const desktopRunning = platformAgents.desktop?.running || running;
  if (desktopRunning) {
    platformSpecs.push({
      id: '__desktop__',
      label: 'Desktop',
      status: 'running',
      depth: 0,
      alpha: 1,
      startedAt: platformAgents.desktop?.startedAt,
      sessionKey: platformAgents.desktop?.sessionKey,
      platform: 'desktop',
      cluster: '__desktop__',
    });
  }

  for (const pa of Object.values(platformAgents)) {
    const platform = pa.platform;
    if (!platform || platform === 'desktop' || !pa.running) continue;
    const nodeId = `__platform_${platform}__`;
    platformSpecs.push({
      id: nodeId,
      label: platformLabel(platform),
      status: 'running',
      depth: 0,
      alpha: 1,
      startedAt: pa.startedAt,
      currentTool: pa.currentTask,
      sessionKey: pa.sessionKey,
      platform,
      cluster: nodeId,
    });
  }

  const visOps = Object.values(operations)
    .filter((o) =>
      o.status === 'running' || o.status === 'aggregating'
        ? true
        : !!(o.completedAt && now - o.completedAt < COMPLETED_TTL),
    )
    .sort((a, b) => b.startedAt - a.startedAt);

  const platformIdSet = new Set(platformSpecs.map((s) => s.platform));
  for (const op of visOps) {
    if (op.platform && !platformIdSet.has(op.platform)) {
      const pa = platformAgents[op.platform];
      const idleId = `__platform_${op.platform}__`;
      platformSpecs.push({
        id: idleId,
        label: platformLabel(op.platform),
        status: 'idle',
        depth: 0,
        alpha: fadeAlpha(op, now),
        startedAt: pa?.startedAt,
        sessionKey: pa?.sessionKey,
        platform: op.platform,
        cluster: idleId,
      });
      platformIdSet.add(op.platform);
    }
  }

  const platformToId = new Map<string, string>();
  for (const spec of platformSpecs) {
    if (spec.platform) platformToId.set(spec.platform, spec.id);
  }

  const opSpecs: (AgentGraphNodeSpec & { parentId: string })[] = [];
  for (const op of visOps) {
    const parentId = (op.platform && platformToId.has(op.platform))
      ? platformToId.get(op.platform)!
      : platformSpecs[0]?.id || '__desktop__';

    opSpecs.push({
      id: `__op_${op.id}__`,
      label: shortGraphLabel(op.goal, 18) || OP_TYPE_LABELS[op.type] || op.type,
      status: op.status,
      depth: 1,
      alpha: fadeAlpha(op, now),
      startedAt: op.startedAt,
      opType: op.type,
      operationId: op.id,
      parentId,
      cluster: parentId,
    });
  }

  const subSpecs: (AgentGraphNodeSpec & { parentId: string })[] = [];
  for (const op of visOps) {
    const opNodeId = `__op_${op.id}__`;
    const opCluster = (op.platform && platformToId.has(op.platform))
      ? platformToId.get(op.platform)!
      : platformSpecs[0]?.id || '__desktop__';
    op.subAgents.forEach((sub, index) => {
      subSpecs.push({
        id: sub.id,
        label: shortGraphLabel(sub.goal || sub.label || '', 12) || `Worker ${index + 1}`,
        status: sub.status === 'running' ? 'running'
          : sub.status === 'complete' ? 'complete'
          : sub.status === 'failed' ? 'failed'
          : sub.status === 'cancelled' ? 'cancelled'
          : 'pending',
        depth: 2,
        alpha: fadeAlpha(op, now),
        startedAt: sub.startedAt,
        currentTool: sub.currentActivity,
        subAgentId: sub.id,
        operationId: op.id,
        parentId: opNodeId,
        cluster: opCluster,
      });
    });
  }

  const activitySpecs: (AgentGraphNodeSpec & { parentId: string })[] = [];
  for (const pSpec of platformSpecs) {
    const hasOps = opSpecs.some((op) => op.cluster === pSpec.id);
    if (hasOps) continue;
    const pa = pSpec.platform === 'desktop'
      ? platformAgents.desktop
      : Object.values(platformAgents).find((p) => p.platform === pSpec.platform);
    const currentTool = pa?.currentTool;
    if (currentTool) {
      const toolLabels: Record<string, string> = {
        terminal: 'Running command', files: 'Working with files', web_search: 'Searching web',
        remote_browser: 'Browsing', email: 'Email', slack: 'Slack', telegram: 'Telegram',
        memory_recall: 'Recalling', memory_store: 'Remembering', spawn_agent: 'Starting helper',
        spawn_agents: 'Parallel work', composio: 'Integration', app: 'Using app', agent_calendar: 'Calendar',
      };
      activitySpecs.push({
        id: `__activity_${pSpec.id}__`,
        label: toolLabels[currentTool] || currentTool.replace(/_/g, ' '),
        status: 'running',
        depth: 1,
        alpha: 1,
        currentTool,
        cluster: pSpec.id,
        parentId: pSpec.id,
      });
    }
  }

  let allNodes: AgentGraphNodeSpec[] = [
    ...platformSpecs,
    ...opSpecs,
    ...activitySpecs,
    ...subSpecs,
  ];

  const hasDesktopNode = platformSpecs.some((p) => p.id === '__desktop__');
  if (!hasDesktopNode && opSpecs.some((o) => o.parentId === '__desktop__')) {
    allNodes = [
      {
        id: '__desktop__',
        label: 'Desktop',
        status: 'running',
        depth: 0,
        alpha: 1,
        platform: 'desktop',
        cluster: '__desktop__',
      },
      ...allNodes,
    ];
  }

  const clusterSpread = Math.min(
    420,
    CLUSTER_SPREAD_BASE
      + subSpecs.length * 32
      + opSpecs.length * 14
      + Math.max(0, platformSpecs.length - 1) * 18,
  );

  const specIdSet = new Set(allNodes.map((s) => s.id));
  const opById = new Map(visOps.map((o) => [o.id, o]));
  const edges: AgentGraphEdgeSpec[] = [];

  for (const opSpec of opSpecs) {
    if (specIdSet.has(opSpec.parentId)) {
      const tracked = opSpec.operationId ? opById.get(opSpec.operationId) : undefined;
      edges.push({
        source: opSpec.parentId,
        target: opSpec.id,
        active: opSpec.status === 'running' || opSpec.status === 'aggregating',
        alpha: tracked ? fadeEdgeAlpha(tracked, now) : opSpec.alpha,
        springLen: 58,
        label: opSpec.opType,
      });
    }
  }
  for (const sub of subSpecs) {
    if (specIdSet.has(sub.parentId)) {
      const tracked = sub.operationId ? opById.get(sub.operationId) : undefined;
      edges.push({
        source: sub.parentId,
        target: sub.id,
        active: sub.status === 'running' || sub.status === 'pending',
        alpha: tracked ? fadeEdgeAlpha(tracked, now) : sub.alpha,
        springLen: 56,
      });
    }
  }
  for (const act of activitySpecs) {
    if (specIdSet.has(act.parentId)) {
      edges.push({
        source: act.parentId,
        target: act.id,
        active: true,
        alpha: 1,
        springLen: 58,
        label: act.currentTool,
      });
    }
  }

  return {
    nodes: allNodes,
    edges,
    visible: allNodes.length > 0,
    clusterSpread,
  };
}

export function findNodeSpec(
  nodes: AgentGraphNodeSpec[],
  id: string | null,
): AgentGraphNodeSpec | undefined {
  if (!id) return undefined;
  return nodes.find((n) => n.id === id);
}

export const AGENT_STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  running: { light: '#3b82f6', dark: '#60a5fa' },
  aggregating: { light: '#7c3aed', dark: '#a78bfa' },
  idle: { light: '#6b7280', dark: '#9ca3af' },
  complete: { light: '#059669', dark: '#34d399' },
  failed: { light: '#dc2626', dark: '#ef4444' },
  pending: { light: '#9ca3af', dark: '#9ca3af' },
  cancelled: { light: '#9ca3af', dark: '#9ca3af' },
};

export const OP_TYPE_COLORS: Record<string, string> = {
  delegation: '#3b82f6',
  consultation: '#8b5cf6',
  background: '#f59e0b',
  orchestration: '#10b981',
};

export const DEPTH_R = [10, 8, 6] as const;

export function nodeRadius(
  depth: number,
  opts: { selected?: boolean; hovered?: boolean },
): number {
  const base = DEPTH_R[depth] ?? 6;
  if (opts.selected) return base + 2;
  if (opts.hovered) return base + 1;
  return base;
}
