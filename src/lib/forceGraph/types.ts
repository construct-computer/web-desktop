/** Shared physics node for force-directed canvas graphs. */
export interface PhysicsNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned?: boolean;
}

export interface PhysicsEdge {
  source: string;
  target: string;
  label?: string;
  springLen?: number;
}

export interface FlatSimulationConfig {
  repulsion?: number;
  springLength?: number;
  springK?: number;
  centerGravity?: number;
  damping?: number;
  boundPad?: number;
}

export interface AgentSimulationConfig extends FlatSimulationConfig {
  clusterSpread?: number;
  depthYBias?: number;
}

export const DEFAULT_FLAT_SIM: Required<FlatSimulationConfig> = {
  repulsion: 3000,
  springLength: 120,
  springK: 0.015,
  centerGravity: 0.01,
  damping: 0.85,
  boundPad: 30,
};

export const DEFAULT_AGENT_SIM: Required<AgentSimulationConfig> = {
  repulsion: 1400,
  springLength: 58,
  springK: 0.025,
  centerGravity: 0.022,
  damping: 0.82,
  boundPad: 30,
  clusterSpread: 180,
  depthYBias: 32,
};
