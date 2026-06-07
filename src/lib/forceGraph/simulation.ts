import {
  DEFAULT_AGENT_SIM,
  DEFAULT_FLAT_SIM,
  type AgentSimulationConfig,
  type FlatSimulationConfig,
  type PhysicsEdge,
  type PhysicsNode,
} from './types';

export interface AgentPhysicsNode extends PhysicsNode {
  depth: number;
  cluster: string;
}

export interface AgentPhysicsEdge extends PhysicsEdge {
  springLen: number;
}

export function tickFlatSimulation(
  nodes: PhysicsNode[],
  edges: PhysicsEdge[],
  width: number,
  height: number,
  alpha: number,
  config: FlatSimulationConfig = {},
): void {
  const cfg = { ...DEFAULT_FLAT_SIM, ...config };
  const cx = width / 2;
  const cy = height / 2;
  const pad = cfg.boundPad;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < 20) dist = 20;
      const force = (cfg.repulsion / (dist * dist)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx += fx; a.vy += fy; }
      if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const a = nodeById.get(edge.source);
    const b = nodeById.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const springLen = edge.springLen ?? cfg.springLength;
    const displacement = dist - springLen;
    const force = cfg.springK * displacement * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  for (const node of nodes) {
    if (node.pinned) continue;
    node.vx += (cx - node.x) * cfg.centerGravity * alpha;
    node.vy += (cy - node.y) * cfg.centerGravity * alpha;
    node.vx *= cfg.damping;
    node.vy *= cfg.damping;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(pad, Math.min(width - pad, node.x));
    node.y = Math.max(pad, Math.min(height - pad, node.y));
  }
}

export function tickAgentSimulation(
  nodes: AgentPhysicsNode[],
  edges: AgentPhysicsEdge[],
  w: number,
  h: number,
  alpha: number,
  gravityCenter: { x: number; y: number },
  config: AgentSimulationConfig = {},
): void {
  const cfg = { ...DEFAULT_AGENT_SIM, ...config };
  const clusterSpread = config.clusterSpread ?? cfg.clusterSpread;
  const depthYBias = config.depthYBias ?? cfg.depthYBias;
  const pad = cfg.boundPad;

  const clusterIds = [...new Set(nodes.map((n) => n.cluster))];
  const clusterCount = clusterIds.length;
  const clusterCenters = new Map<string, { x: number; y: number }>();
  clusterIds.forEach((cid, i) => {
    const offset = (i - (clusterCount - 1) / 2) * clusterSpread;
    clusterCenters.set(cid, {
      x: Math.max(pad + 40, Math.min(w - pad - 40, gravityCenter.x + offset)),
      y: gravityCenter.y,
    });
  });

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < 15) dist = 15;
      const crossCluster = a.cluster !== b.cluster ? 2.5 : 1;
      const force = (cfg.repulsion * crossCluster / (dist * dist)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx += fx; a.vy += fy; }
      if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const a = nodeById.get(edge.source);
    const b = nodeById.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const displacement = dist - edge.springLen;
    const force = cfg.springK * displacement * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  const parentMap = new Map<string, AgentPhysicsNode>();
  for (const edge of edges) {
    const parent = nodeById.get(edge.source);
    if (parent) parentMap.set(edge.target, parent);
  }

  for (const node of nodes) {
    if (node.pinned) continue;
    const cc = clusterCenters.get(node.cluster) || gravityCenter;
    const parent = parentMap.get(node.id);
    const targetX = parent ? parent.x : cc.x;
    const depthTargetY = cc.y + (node.depth - 0.5) * depthYBias;
    node.vx += (targetX - node.x) * cfg.centerGravity * alpha;
    node.vy += (depthTargetY - node.y) * cfg.centerGravity * 1.8 * alpha;
    node.vx *= cfg.damping;
    node.vy *= cfg.damping;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(pad, Math.min(w - pad, node.x));
    node.y = Math.max(pad, Math.min(h - pad, node.y));
  }
}

export const ALPHA_COOLING = 0.995;
export const ALPHA_MIN = 0.001;
