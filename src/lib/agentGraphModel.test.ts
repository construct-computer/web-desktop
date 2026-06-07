import { describe, expect, it } from 'vitest';
import { buildAgentGraph, fadeAlpha, fadeEdgeAlpha, findNodeSpec, nodeRadius } from './agentGraphModel';

describe('buildAgentGraph', () => {
  it('builds platform, operation, and subagent nodes', () => {
    const result = buildAgentGraph({
      running: true,
      operations: {
        op_1: {
          id: 'op_1',
          type: 'orchestration',
          status: 'running',
          goal: 'Parallel research',
          subAgents: [
            {
              id: 'child_1',
              type: 'subagent',
              label: 'child_1',
              goal: 'Task A',
              status: 'running',
              startedAt: Date.now(),
              activities: [],
            },
          ],
          startedAt: Date.now(),
          platform: 'desktop',
          sessionKey: 'session_1',
        },
      },
      platformAgents: {
        desktop: {
          platform: 'desktop',
          running: true,
          sessionKey: 'session_1',
        },
      },
      now: Date.now(),
    });

    expect(result.visible).toBe(true);
    expect(result.nodes.some((n) => n.id === '__desktop__')).toBe(true);
    expect(result.nodes.some((n) => n.id === '__op_op_1__')).toBe(true);
    expect(result.nodes.some((n) => n.id === 'child_1')).toBe(true);
    expect(result.nodes.find((n) => n.id === 'child_1')?.label).toBe('Task A');
    expect(result.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('fades completed edges more slowly than nodes', () => {
    const now = Date.now();
    const op = {
      id: 'op_1',
      type: 'orchestration' as const,
      status: 'complete' as const,
      goal: 'Work',
      subAgents: [],
      startedAt: now - 55_000,
      completedAt: now - 60_000,
      platform: 'desktop',
    };
    expect(fadeAlpha(op, now)).toBeLessThan(fadeEdgeAlpha(op, now));
    expect(fadeEdgeAlpha(op, now)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('findNodeSpec', () => {
  it('returns node by id', () => {
    const nodes = [{ id: 'x', label: 'Test', status: 'running', depth: 0, alpha: 1, cluster: 'x' }];
    expect(findNodeSpec(nodes, 'x')?.label).toBe('Test');
    expect(findNodeSpec(nodes, null)).toBeUndefined();
  });
});

describe('nodeRadius', () => {
  it('grows for hover and selection', () => {
    expect(nodeRadius(1, {})).toBe(8);
    expect(nodeRadius(1, { hovered: true })).toBe(9);
    expect(nodeRadius(1, { selected: true })).toBe(10);
  });
});
