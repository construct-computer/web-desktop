import { describe, expect, it } from 'vitest';
import { tickFlatSimulation, tickAgentSimulation, type AgentPhysicsNode, type AgentPhysicsEdge } from './simulation';
import type { PhysicsNode, PhysicsEdge } from './types';

describe('tickFlatSimulation', () => {
  it('pulls nodes toward center over ticks', () => {
    const nodes: PhysicsNode[] = [
      { id: 'a', label: 'A', x: 10, y: 10, vx: 0, vy: 0 },
      { id: 'b', label: 'B', x: 500, y: 400, vx: 0, vy: 0 },
    ];
    const edges: PhysicsEdge[] = [{ source: 'a', target: 'b' }];

    for (let i = 0; i < 80; i++) {
      tickFlatSimulation(nodes, edges, 600, 400, 1);
    }

    const cx = 300;
    const cy = 200;
    for (const n of nodes) {
      expect(n.x).toBeGreaterThan(30);
      expect(n.x).toBeLessThan(570);
      expect(Math.abs(n.x - cx)).toBeLessThan(280);
      expect(Math.abs(n.y - cy)).toBeLessThan(200);
    }
  });

  it('keeps nodes within bounds padding', () => {
    const nodes: PhysicsNode[] = [
      { id: 'a', label: 'A', x: 0, y: 0, vx: -50, vy: -50 },
    ];
    tickFlatSimulation(nodes, [], 200, 200, 1);
    expect(nodes[0].x).toBeGreaterThanOrEqual(30);
    expect(nodes[0].y).toBeGreaterThanOrEqual(30);
  });
});

describe('tickAgentSimulation', () => {
  it('respects depth-biased layout for child nodes', () => {
    const nodes: AgentPhysicsNode[] = [
      { id: 'p', label: 'Platform', x: 200, y: 100, vx: 0, vy: 0, depth: 0, cluster: 'c1' },
      { id: 'c', label: 'Child', x: 200, y: 100, vx: 0, vy: 0, depth: 2, cluster: 'c1' },
    ];
    const edges: AgentPhysicsEdge[] = [
      { source: 'p', target: 'c', springLen: 48 },
    ];

    for (let i = 0; i < 60; i++) {
      tickAgentSimulation(nodes, edges, 400, 300, 0.8, { x: 200, y: 120 }, { clusterSpread: 120 });
    }

    expect(nodes[1].y).toBeGreaterThan(nodes[0].y);
  });
});
