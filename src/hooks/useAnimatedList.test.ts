import { describe, expect, it } from 'vitest';
import { classifyListPhases } from './useAnimatedList';

describe('classifyListPhases', () => {
  it('marks new keys as entering and stable keys as stable', () => {
    const phases = classifyListPhases(['a', 'b'], new Set(['a']));
    expect(phases.get('a')).toBe('stable');
    expect(phases.get('b')).toBe('entering');
  });

  it('marks removed keys as leaving', () => {
    const phases = classifyListPhases(['a'], new Set(['a', 'b']));
    expect(phases.get('a')).toBe('stable');
    expect(phases.get('b')).toBe('leaving');
  });
});
