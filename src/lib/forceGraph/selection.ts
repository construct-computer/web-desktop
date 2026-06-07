import type { PhysicsEdge } from './types';

/** True when node is selected or directly connected via an edge. */
export function isNodeConnected(
  nodeId: string,
  selectedId: string | null,
  edges: PhysicsEdge[],
): boolean {
  if (!selectedId || nodeId === selectedId) return nodeId === selectedId;
  return edges.some(
    (e) =>
      (e.source === selectedId && e.target === nodeId)
      || (e.target === selectedId && e.source === nodeId),
  );
}

export function isNodeDimmed(
  nodeId: string,
  selectedId: string | null,
  edges: PhysicsEdge[],
): boolean {
  return Boolean(selectedId && !isNodeConnected(nodeId, selectedId, edges));
}

export function isEdgeHighlighted(
  edge: PhysicsEdge,
  selectedId: string | null,
): boolean {
  if (!selectedId) return false;
  return edge.source === selectedId || edge.target === selectedId;
}

/** Agent tree: include descendants of selected platform/operation nodes. */
export function isAgentNodeDimmed(
  nodeId: string,
  selectedId: string | null,
  edges: PhysicsEdge[],
  childMap: Map<string, string[]>,
): boolean {
  if (!selectedId) return false;
  if (nodeId === selectedId) return false;

  const descendants = collectDescendants(selectedId, childMap);
  if (descendants.has(nodeId)) return false;

  return !isNodeConnected(nodeId, selectedId, edges);
}

function collectDescendants(rootId: string, childMap: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...(childMap.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const kids = childMap.get(id);
    if (kids) stack.push(...kids);
  }
  return out;
}

export function buildChildMap(edges: PhysicsEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.source) ?? [];
    list.push(e.target);
    map.set(e.source, list);
  }
  return map;
}
