import { useCallback, useEffect, useRef, useState } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import {
  useAgentTrackerStore,
  type TrackedOperation,
  type OperationType,
} from '@/stores/agentTrackerStore';
import { useWindowStore } from '@/stores/windowStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { MENUBAR_HEIGHT, DOCK_HEIGHT, Z_INDEX } from '@/lib/constants';

// ── Style ────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────────

const COMPLETED_TTL = 90_000;
const BOUND_PAD = 30;

// Free-position gravity — stored as ratios (0-1) so it adapts to window resize
const POS_KEY = 'construct:agent-widget-pos';
const DEFAULT_POS = { rx: 0.5, ry: 0.1 }; // top-center default

function loadPos(): { rx: number; ry: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) { const p = JSON.parse(raw); return { rx: +p.rx || 0.5, ry: +p.ry || 0.1 }; }
  } catch {}
  return DEFAULT_POS;
}

function savePos(rx: number, ry: number) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ rx, ry })); } catch {}
}

function posToPixel(rx: number, ry: number, w: number, h: number) {
  return { x: rx * w, y: ry * h };
}

// Node radii per depth: 0=platform, 1=operation, 2=subagent (slightly larger for touch/hover)
const DEPTH_R = [10, 8, 6];
// Font per depth (system UI — more readable at small sizes than mono for goals)
const DEPTH_FONT = ['600 10px system-ui, sans-serif', '9px system-ui, sans-serif', '8.5px system-ui, sans-serif'];
// Label truncation per depth (on-canvas; full text in hover panel)
const DEPTH_TRUNC = [32, 44, 48];

// Force simulation
const REPULSION = 1400;
const SPRING_K = 0.025;
const CENTER_GRAVITY = 0.022;
const DAMPING = 0.82;

// Per-level spring rest lengths (platform→op, op→subagent)
const SPRING_LEN_L0 = 58; // platform → operation
const SPRING_LEN_L1 = 48; // operation → subagent

// Depth gravity offset: each level is pulled further down (top-level at top)
const DEPTH_Y_BIAS = 32;
// Default; dynamic spread is computed from parallel sub-agent count
const CLUSTER_SPREAD_BASE = 150;

// ── Status-based palette ─────────────────────────────────────────────

const STATUS_FILL: Record<string, string> = {
  running:     '#60a5fa',
  aggregating: '#a78bfa',
  idle:        '#6b7280',
  complete:    '#34d399',
  failed:      '#ef4444',
  pending:     '#9ca3af',
  cancelled:   '#9ca3af',
};

const STATUS_STROKE: Record<string, string> = {
  running:     '#2563eb',
  aggregating: '#7c3aed',
  idle:        '#4b5563',
  complete:    '#059669',
  failed:      '#b91c1c',
  pending:     '#6b7280',
  cancelled:   '#6b7280',
};

// Operation-type accent colors (thin inner ring on operation nodes)
const OP_TYPE_CLR: Record<string, string> = {
  delegation:     '#3b82f6',
  consultation:   '#8b5cf6',
  background:     '#f59e0b',
  orchestration:  '#10b981',
};

// ── Helpers ──────────────────────────────────────────────────────────

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function trunc(s: string, n = 14): string {
  return s.length > n ? s.slice(0, n) + '\u2026' : s;
}

function fadeAlpha(op: TrackedOperation, now: number): number {
  if (op.status === 'running' || op.status === 'aggregating') return 1;
  if (!op.completedAt) return 0.5;
  return Math.max(0.12, 1 - (now - op.completedAt) / COMPLETED_TTL);
}

function platformLabel(platform: string): string {
  switch (platform) {
    case 'slack': return 'Slack';
    case 'telegram': return 'Telegram';
    case 'calendar': return 'Calendar';
    case 'email': return 'Email';
    case 'desktop': return 'Desktop';
    default: return platform;
  }
}

// ── Types ────────────────────────────────────────────────────────────

interface AgentNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned?: boolean;
  status: string;
  /** 0 = platform agent, 1 = operation, 2 = subagent */
  depth: number;
  alpha: number;
  startedAt?: number;
  currentTool?: string;
  sessionKey?: string;
  platform?: string;
  /** Operation type — only set on depth=1 nodes */
  opType?: OperationType;
  /** Cluster ID — the top-level platform agent this node belongs to */
  cluster: string;
}

interface AgentEdge {
  source: string;
  target: string;
  active: boolean;
  alpha: number;
  /** Rest length for this spring */
  springLen: number;
}

// ── Force simulation (same algorithm as MemoryWindow, extended with
//    per-edge spring length and depth-biased gravity) ─────────────────

function tickSimulation(
  nodes: AgentNode[],
  edges: AgentEdge[],
  w: number,
  h: number,
  alpha: number,
  gravityCenter: { x: number; y: number },
  /** Wider when many parallel sub-agents need horizontal room */
  clusterSpread: number,
) {
  // Compute per-cluster gravity offsets (spread horizontally around gravityCenter)
  const clusterIds = [...new Set(nodes.map(n => n.cluster))];
  const clusterCount = clusterIds.length;
  const clusterCenters = new Map<string, { x: number; y: number }>();
  clusterIds.forEach((cid, i) => {
    // Spread clusters horizontally, centered on gravityCenter
    const offset = (i - (clusterCount - 1) / 2) * clusterSpread;
    clusterCenters.set(cid, {
      x: Math.max(BOUND_PAD + 40, Math.min(w - BOUND_PAD - 40, gravityCenter.x + offset)),
      y: gravityCenter.y,
    });
  });

  // Repulsion between all node pairs — stronger between different clusters
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < 15) dist = 15;
      // Extra repulsion between nodes in different clusters to keep them apart
      const crossCluster = a.cluster !== b.cluster ? 2.5 : 1;
      const force = (REPULSION * crossCluster / (dist * dist)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx += fx; a.vy += fy; }
      if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
    }
  }

  // Spring forces along edges (per-edge rest length)
    const nodeById = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const a = nodeById.get(edge.source);
    const b = nodeById.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const displacement = dist - edge.springLen;
    const force = SPRING_K * displacement * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  const parentMap = new Map<string, AgentNode>();
  for (const edge of edges) {
    const parent = nodeById.get(edge.source);
    if (parent) parentMap.set(edge.target, parent);
  }

  // Per-cluster gravity (each cluster pulled toward its own center, children pulled to parents)
  for (const node of nodes) {
    if (node.pinned) continue;
    const cc = clusterCenters.get(node.cluster) || gravityCenter;
    const parent = parentMap.get(node.id);
    
    // Pull x towards parent if it exists, otherwise cluster center
    const targetX = parent ? parent.x : cc.x;
    
    const depthTargetY = cc.y + (node.depth - 0.5) * DEPTH_Y_BIAS;
    node.vx += (targetX - node.x) * CENTER_GRAVITY * alpha;
    node.vy += (depthTargetY - node.y) * CENTER_GRAVITY * 1.8 * alpha;
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(BOUND_PAD, Math.min(w - BOUND_PAD, node.x));
    node.y = Math.max(BOUND_PAD, Math.min(h - BOUND_PAD, node.y));
  }
}

// ── Component ────────────────────────────────────────────────────────

export function AgentGraphWidget() {
  const running = useComputerStore((s) => s.agentRunning);
  const operations = useAgentTrackerStore((s) => s.operations);
  const platformAgents = useComputerStore((s) => s.platformAgents);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const physicsRef = useRef<AgentNode[]>([]);
  const edgesRef = useRef<AgentEdge[]>([]);
  const alphaRef = useRef(1);
  const rafRef = useRef<number>(0);
  const dragNodeRef = useRef<AgentNode | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const prevIdsRef = useRef('');
  const clusterSpreadRef = useRef(180);
  const lastTipNodeIdRef = useRef<string | null>(null);

  // Free gravity position (stored as ratios 0-1, persisted in localStorage)
  const gravityPosRef = useRef(loadPos());

  // Hover: full label + sub-lines (canvas labels stay short)
  const [graphTip, setGraphTip] = useState<null | { x: number; y: number; label: string; sub?: string; status: string; depth: number }>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // 1-second tick for timers & fade recalc
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const openTrackerAndSwitch = useCallback((_sessionKey?: string) => {
    // Open the notification center drawer with the Agents tab selected
    useNotificationStore.getState().openDrawerTab('agents');
  }, []);

  const now = Date.now();

  // ══════════════════════════════════════════════════════════════════
  //  Collect 3-level hierarchy: Platform → Operation → SubAgent
  // ══════════════════════════════════════════════════════════════════

  interface NodeSpec {
    id: string;
    label: string;
    status: string;
    depth: number;
    alpha: number;
    startedAt?: number;
    currentTool?: string;
    sessionKey?: string;
    platform?: string;
    /** Set on operation nodes (orchestration, delegation, …) for graph + tooltip */
    opType?: OperationType;
    /** Cluster ID — which platform agent tree this belongs to */
    cluster: string;
  }

  // ── Level 0: Platform agents ──

  const platformSpecs: NodeSpec[] = [];

  const desktopRunning = platformAgents.desktop?.running || running;
  if (desktopRunning) {
    platformSpecs.push({
      id: '__desktop__',
      label: 'Desktop',
      status: 'running',
      depth: 0,
      alpha: 1,
      startedAt: platformAgents.desktop?.startedAt,
      platform: 'desktop',
      cluster: '__desktop__',
    });
  }

  for (const pa of Object.values(platformAgents)) {
    if (pa.platform === 'desktop' || !pa.running) continue;
    const nodeId = `__platform_${pa.platform}__`;
    platformSpecs.push({
      id: nodeId,
      label: platformLabel(pa.platform),
      status: 'running',
      depth: 0,
      alpha: 1,
      startedAt: pa.startedAt,
      currentTool: pa.currentTask,
      sessionKey: pa.sessionKey,
      platform: pa.platform,
      cluster: nodeId,
    });
  }

  // ── Visible operations ──

  const visOps = Object.values(operations)
    .filter((o) =>
      o.status === 'running' || o.status === 'aggregating'
        ? true
        : !!(o.completedAt && now - o.completedAt < COMPLETED_TTL),
    )
    .sort((a, b) => b.startedAt - a.startedAt);

  // Ensure platform agents exist for all visible operations (add idle ones if needed)
  const platformIdSet = new Set(platformSpecs.map(s => s.platform));
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

  // ── Level 1: Operation nodes ──

  interface OpSpec extends NodeSpec { parentId: string }

  const opSpecs: OpSpec[] = [];
  for (const op of visOps) {
    const parentId = (op.platform && platformToId.has(op.platform))
      ? platformToId.get(op.platform)!
      : platformSpecs[0]?.id || '__desktop__';

    opSpecs.push({
      id: `__op_${op.id}__`,
      label: op.goal,
      status: op.status,
      depth: 1,
      alpha: fadeAlpha(op, now),
      startedAt: op.startedAt,
      opType: op.type,
      parentId,
      cluster: parentId,
    });
  }

  // ── Level 2: SubAgent nodes ──

  interface SubSpec extends NodeSpec { parentId: string }

  const subSpecs: SubSpec[] = [];
  for (const op of visOps) {
    const opNodeId = `__op_${op.id}__`;
    // Resolve the cluster for this operation's subagents
    const opCluster = (op.platform && platformToId.has(op.platform))
      ? platformToId.get(op.platform)!
      : platformSpecs[0]?.id || '__desktop__';
    for (const sub of op.subAgents) {
      subSpecs.push({
        id: sub.id,
        label: sub.goal || sub.label || '',
        status: sub.status === 'running' ? 'running'
          : sub.status === 'complete' ? 'complete'
          : sub.status === 'failed' ? 'failed'
          : sub.status === 'cancelled' ? 'cancelled'
          : 'pending',
        depth: 2,
        alpha: fadeAlpha(op, now),
        startedAt: sub.startedAt,
        currentTool: sub.currentActivity,
        parentId: opNodeId,
        cluster: opCluster,
      });
    }
  }

  // ── Level 1.5: Current activity nodes (for agents with no operations) ──
  // Shows what each platform agent is doing right now, even without sub-agents.

  const activitySpecs: (NodeSpec & { parentId: string })[] = [];
  for (const pSpec of platformSpecs) {
    // Check if this platform already has operations
    const hasOps = opSpecs.some(op => op.cluster === pSpec.id);
    if (hasOps) continue;

    // Get current tool from platform agent state
    const pa = pSpec.platform === 'desktop'
      ? platformAgents.desktop
      : Object.values(platformAgents).find(p => p.platform === pSpec.platform);
    const currentTool = pa?.currentTool;
    if (currentTool) {
      const toolLabels: Record<string, string> = {
        terminal: 'Running command', web_search: 'Searching web', remote_browser: 'Browsing',
        read_file: 'Reading file', write_file: 'Writing file', email: 'Email',
        slack: 'Slack', telegram: 'Telegram', memory_recall: 'Recalling', memory_store: 'Remembering',
        spawn_agent: 'Spawning agent', spawn_agents: 'Parallel agent swarm', composio: 'Integration', app: 'Using app',
        view_image: 'Viewing image', agent_calendar: 'Calendar',
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

  // ── Merge all specs ──

  let allSpecs: NodeSpec[] = [...platformSpecs, ...opSpecs, ...activitySpecs, ...subSpecs];
  const hasDesktopNode = platformSpecs.some(p => p.id === '__desktop__');
  if (!hasDesktopNode && opSpecs.some(o => o.parentId === '__desktop__')) {
    allSpecs = [
      {
        id: '__desktop__',
        label: 'Desktop',
        status: 'running',
        depth: 0,
        alpha: 1,
        platform: 'desktop',
        cluster: '__desktop__',
      },
      ...allSpecs,
    ];
  }

  const isHidden = (parentId?: string): boolean => {
    if (!parentId) return false;
    if (collapsedNodes.has(parentId)) return true;
    const parentNode = allSpecs.find(s => s.id === parentId);
    return parentNode ? isHidden((parentNode as any).parentId) : false;
  };

  allSpecs = allSpecs.filter(s => !isHidden((s as any).parentId));

  // More parallel sub-agents → wider cluster spread so fan-out is readable
  clusterSpreadRef.current = Math.min(
    360,
    CLUSTER_SPREAD_BASE
      + subSpecs.length * 24
      + opSpecs.length * 10
      + Math.max(0, platformSpecs.length - 1) * 14,
  );

  // Show the graph for any node (ops + subs can exist while host row is only implied)
  const visible = allSpecs.length > 0;

  // ══════════════════════════════════════════════════════════════════
  //  Sync specs → persistent physics nodes (preserve positions)
  // ══════════════════════════════════════════════════════════════════

  const curIds = allSpecs.map(s => s.id).sort().join(',');
  const topologyChanged = curIds !== prevIdsRef.current;
  prevIdsRef.current = curIds;

  const oldById = new Map(physicsRef.current.map(n => [n.id, n]));
  physicsRef.current = allSpecs.map(spec => {
    const old = oldById.get(spec.id);
    if (old) {
      old.label = spec.label;
      old.status = spec.status;
      old.depth = spec.depth;
      old.alpha = spec.alpha;
      old.startedAt = spec.startedAt;
      old.currentTool = spec.currentTool;
      old.sessionKey = spec.sessionKey;
      old.platform = spec.platform;
      old.opType = spec.opType;
      return old;
    }
    // New nodes spawn near the current gravity center
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight - MENUBAR_HEIGHT : 600;
    const gc = posToPixel(gravityPosRef.current.rx, gravityPosRef.current.ry, vw, vh);
    return {
      ...spec,
      x: gc.x + (Math.random() - 0.5) * 80,
      y: gc.y + (Math.random() - 0.5) * 60,
      vx: 0,
      vy: 0,
    } as AgentNode;
  });

  // ── Build edges: platform→operation + operation→subagent ──

  const specIdSet = new Set(allSpecs.map(s => s.id));
  const edges: AgentEdge[] = [];

  for (const op of opSpecs) {
    if (specIdSet.has(op.parentId)) {
      edges.push({
        source: op.parentId,
        target: op.id,
        active: op.status === 'running' || op.status === 'aggregating',
        alpha: op.alpha,
        springLen: SPRING_LEN_L0,
      });
    }
  }
  for (const sub of subSpecs) {
    if (specIdSet.has(sub.parentId)) {
      edges.push({
        source: sub.parentId,
        target: sub.id,
        active: sub.status === 'running' || sub.status === 'aggregating',
        alpha: sub.alpha,
        springLen: SPRING_LEN_L1,
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
        springLen: SPRING_LEN_L0,
      });
    }
  }

  edgesRef.current = edges;

  if (topologyChanged) {
    alphaRef.current = Math.max(alphaRef.current, 0.5);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Canvas animation loop
  // ══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let active = true;

    function frame() {
      if (!active || !ctx || !canvas) return;

      // Full desktop canvas size (below menubar)
      const w = window.innerWidth;
      const h = window.innerHeight - MENUBAR_HEIGHT;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const nodes = physicsRef.current;
      const curEdges = edgesRef.current;

      if (alphaRef.current > 0.001) {
        const gc = posToPixel(gravityPosRef.current.rx, gravityPosRef.current.ry, w, h);
        tickSimulation(nodes, curEdges, w, h, alphaRef.current, gc, clusterSpreadRef.current);
        alphaRef.current *= 0.995;
      }

      const t = Date.now();
      const nodeById = new Map(nodes.map(n => [n.id, n]));

      // ── Edges ──
      for (const edge of curEdges) {
        const a = nodeById.get(edge.source);
        const b = nodeById.get(edge.target);
        if (!a || !b) continue;

        // Dark outline for visibility on light backgrounds
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = edge.active ? 4 : 2.5;
        ctx.globalAlpha = edge.alpha;
        ctx.stroke();

        if (edge.active) {
          // Glow
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 3;
          ctx.globalAlpha = edge.alpha * 0.12;
          ctx.stroke();

          // Animated dash
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = (t / 100) % 20;
          ctx.globalAlpha = edge.alpha * 0.85;
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = edge.alpha * 0.25;
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;

      // ── Nodes (draw in depth order so deeper nodes render on top) ──
      const sorted = [...nodes].sort((a, b) => {
        // Draw deeper nodes on top, hovered node last
        if (hoveredRef.current === a.id) return 1;
        if (hoveredRef.current === b.id) return -1;
        return a.depth - b.depth;
      });

      for (const node of sorted) {
        const isHovered = hoveredRef.current === node.id;
        const fill = STATUS_FILL[node.status] ?? STATUS_FILL.idle;
        const stroke = STATUS_STROKE[node.status] ?? STATUS_STROKE.idle;
        const isActive = node.status === 'running' || node.status === 'aggregating';
        const r = DEPTH_R[node.depth] ?? 4;

        ctx.globalAlpha = node.alpha;

        // Active: outer pulsing ring
        if (isActive) {
          const pulse = Math.sin(t / 400) * 0.15 + 0.2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 5 + Math.sin(t / 600) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = fill;
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = node.alpha * pulse;
          ctx.stroke();
          ctx.globalAlpha = node.alpha;
        }

        // Active glow
        if (isActive) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.fillStyle = fill + '30';
          ctx.fill();
        }

        // Node circle — dark outer ring for visibility on light backgrounds
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#ffffff' : stroke;
        ctx.lineWidth = isHovered ? 1.8 : (node.depth === 0 ? 1.5 : 1);
        ctx.stroke();

        // Operation-type accent ring (depth=1 only)
        if (node.depth === 1 && node.opType) {
          const accentClr = OP_TYPE_CLR[node.opType];
          if (accentClr) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r - 2, 0, Math.PI * 2);
            ctx.strokeStyle = accentClr;
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = node.alpha * 0.7;
            ctx.stroke();
            ctx.globalAlpha = node.alpha;
          }
        }

        // Status icon for completed/failed (depth > 0)
        if (node.depth > 0 && (node.status === 'complete' || node.status === 'failed')) {
          const ix = node.x + r + 4;
          const iy = node.y;
          ctx.beginPath();
          ctx.arc(ix, iy, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = node.status === 'complete' ? '#059669' : '#dc2626';
          ctx.globalAlpha = node.alpha * 0.85;
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (node.status === 'complete') {
            ctx.beginPath();
            ctx.moveTo(ix - 1.8, iy);
            ctx.lineTo(ix - 0.3, iy + 1.5);
            ctx.lineTo(ix + 2, iy - 1.3);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(ix - 1.3, iy - 1.3);
            ctx.lineTo(ix + 1.3, iy + 1.3);
            ctx.moveTo(ix + 1.3, iy - 1.3);
            ctx.lineTo(ix - 1.3, iy + 1.3);
            ctx.stroke();
          }
          ctx.globalAlpha = node.alpha;
        }

        // ── Text rendering with dark halo for readability on any background ──
        // Draw each text string twice: dark stroke halo first, then white fill.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';

        // Helper: draw text with dark halo
        const haloText = (text: string, x: number, y: number, font: string, fillColor: string, haloWidth = 3) => {
          ctx.font = font;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = haloWidth;
          ctx.globalAlpha = node.alpha;
          ctx.strokeText(text, x, y);
          ctx.fillStyle = fillColor;
          ctx.fillText(text, x, y);
        };

        // Label
        const maxLen = DEPTH_TRUNC[node.depth] ?? 14;
        const displayLabel = trunc(node.label, isHovered ? 90 : maxLen);
        if (displayLabel) {
          haloText(displayLabel, node.x, node.y + r + 4,
            DEPTH_FONT[node.depth] ?? '7px monospace',
            isHovered ? '#ffffff' : 'rgba(255,255,255,0.9)');
        }

        // Elapsed timer
        if (isActive && node.startedAt) {
          haloText(fmtElapsed(t - node.startedAt), node.x, node.y + r + 15,
            '7px monospace', 'rgba(255,255,255,0.6)', 2.5);
        }

        // Current tool badge (subagents only)
        if (node.currentTool && isActive && node.depth === 2) {
          const toolY = node.startedAt ? node.y + r + 25 : node.y + r + 15;
          haloText(trunc(node.currentTool, 12), node.x, toolY,
            '6.5px monospace', 'rgba(147,197,253,0.8)', 2.5);
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Document-level mouse interaction ────────────────────────────
  // Canvas is pointer-events-none (full desktop overlay). We listen on
  // the document for mousedown near graph nodes, then track drag globally.

  const hitTestAt = useCallback((clientX: number, clientY: number): AgentNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    for (const node of physicsRef.current) {
      const dx = node.x - mx;
      const dy = node.y - my;
      const r = DEPTH_R[node.depth] ?? 4;
      const hitPad = 14 + (2 - node.depth) * 3;
      if (dx * dx + dy * dy < (r + hitPad) * (r + hitPad)) return node;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!visible) return;

    const onMouseDown = (e: MouseEvent) => {
      const node = hitTestAt(e.clientX, e.clientY);
      if (!node) return;
      // Prevent default to avoid text selection during drag
      e.preventDefault();
      dragNodeRef.current = node;
      node.pinned = true;
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        dragStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragNodeRef.current;
      if (drag) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        drag.x = e.clientX - rect.left;
        drag.y = e.clientY - rect.top;
        alphaRef.current = Math.max(alphaRef.current, 0.1);
      } else {
        // Update hover cursor + graph tooltip
        const node = hitTestAt(e.clientX, e.clientY);
        hoveredRef.current = node?.id ?? null;
        document.body.style.cursor = node ? 'pointer' : '';
        const nid = node?.id ?? null;
        if (nid !== lastTipNodeIdRef.current) {
          lastTipNodeIdRef.current = nid;
          if (node) {
            const parts: string[] = [];
            if (node.depth === 1 && node.opType) parts.push(`Type: ${node.opType}`);
            if (node.currentTool) parts.push(String(node.currentTool));
            if (node.status && node.status !== 'running' && node.status !== 'aggregating' && node.status !== 'pending') {
              parts.push(String(node.status));
            }
            setGraphTip({
              x: e.clientX,
              y: e.clientY,
              label: node.label,
              sub: parts.length > 0 ? parts.join(' · ') : undefined,
              status: node.status,
              depth: node.depth,
            });
          } else {
            setGraphTip(null);
          }
        } else if (node) {
          setGraphTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t);
        }
      }
    };

    const onMouseUp = () => {
      const drag = dragNodeRef.current;
      if (drag) {
        drag.pinned = false;
        setGraphTip(null);
        lastTipNodeIdRef.current = null;
        const wasDrag = dragStartRef.current &&
          ((drag.x - dragStartRef.current.x) ** 2 + (drag.y - dragStartRef.current.y) ** 2) >= 25;

        if (wasDrag) {
          // Move gravity center to the release position
          const w = window.innerWidth;
          const h = window.innerHeight - MENUBAR_HEIGHT;
          const rx = Math.max(0.05, Math.min(0.95, drag.x / w));
          const ry = Math.max(0.05, Math.min(0.95, drag.y / h));
          gravityPosRef.current = { rx, ry };
          savePos(rx, ry);
          // Reheat to migrate cluster
          alphaRef.current = Math.max(alphaRef.current, 0.8);
        } else {
          // Click — toggle collapse if depth 0 or 1, else open tracker
          if (drag.depth === 0 || drag.depth === 1) {
            setCollapsedNodes(prev => {
              const next = new Set(prev);
              if (next.has(drag.id)) next.delete(drag.id);
              else next.add(drag.id);
              return next;
            });
            alphaRef.current = Math.max(alphaRef.current, 0.5); // Reheat
          } else {
            openTrackerAndSwitch(drag.sessionKey);
          }
        }
        dragNodeRef.current = null;
        dragStartRef.current = null;
        document.body.style.cursor = '';
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
    };
  }, [visible, hitTestAt, openTrackerAndSwitch]);

  // ── Visibility ────────────────────────────────────────────────────

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none"
      style={{ top: MENUBAR_HEIGHT, zIndex: Z_INDEX.desktopWidget }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      {graphTip && (
        <div
          className="fixed max-w-sm rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-left shadow-lg backdrop-blur-md pointer-events-none"
          style={{
            left: graphTip.x + 12,
            top: graphTip.y + 14,
            zIndex: Z_INDEX.desktopWidget + 2,
            maxWidth: 'min(22rem, calc(100vw - 1.5rem))',
          }}
        >
          <p className="text-[12px] font-medium leading-snug text-white/95 break-words">{graphTip.label}</p>
          {graphTip.sub && (
            <p className="mt-1.5 text-[10px] font-mono text-sky-300/90 leading-relaxed break-words">{graphTip.sub}</p>
          )}
          {graphTip.depth === 2 && (graphTip.status === 'running' || graphTip.status === 'aggregating' || graphTip.status === 'pending') && (
            <p className="mt-1 text-[9px] uppercase tracking-wide text-white/40">Parallel worker</p>
          )}
        </div>
      )}
    </div>
  );
}
