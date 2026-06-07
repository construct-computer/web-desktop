import { describe, expect, it } from 'vitest';
import {
  buildChildMap,
  isAgentNodeDimmed,
  isEdgeHighlighted,
  isNodeConnected,
  isNodeDimmed,
} from './selection';

describe('graph selection helpers', () => {
  const edges = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
  ];

  it('detects direct neighbors', () => {
    expect(isNodeConnected('b', 'a', edges)).toBe(true);
    expect(isNodeConnected('c', 'a', edges)).toBe(false);
  });

  it('dims unrelated nodes when selected', () => {
    expect(isNodeDimmed('c', 'a', edges)).toBe(true);
    expect(isNodeDimmed('b', 'a', edges)).toBe(false);
    expect(isNodeDimmed('a', null, edges)).toBe(false);
  });

  it('highlights incident edges', () => {
    expect(isEdgeHighlighted(edges[0], 'a')).toBe(true);
    expect(isEdgeHighlighted(edges[1], 'a')).toBe(false);
  });

  it('keeps descendant subtree visible for agent hierarchy', () => {
    const childMap = buildChildMap(edges);
    expect(isAgentNodeDimmed('c', 'a', edges, childMap)).toBe(false);
    expect(isAgentNodeDimmed('x', 'a', edges, childMap)).toBe(true);
  });
});
