import type { PhysicsNode } from './types';

export function hitTestPoint(
  nodes: PhysicsNode[],
  mx: number,
  my: number,
  radiusForNode: (node: PhysicsNode) => number,
): PhysicsNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const r = radiusForNode(node);
    const dx = node.x - mx;
    const dy = node.y - my;
    if (dx * dx + dy * dy < r * r) return node;
  }
  return null;
}
