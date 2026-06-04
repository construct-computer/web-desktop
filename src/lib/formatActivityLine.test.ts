import { describe, expect, it } from 'vitest';
import { formatActivityLine } from '@/components/desktop/spotlight/formatActivityLine';

describe('formatActivityLine', () => {
  it('strips Running wrapper for terminal commands', () => {
    expect(
      formatActivityLine('Running `cd /workspace && python3 bot.py`', { activityType: 'terminal' }),
    ).toBe('cd /workspace && python3 bot.py');
  });

  it('truncates long lines', () => {
    const long = 'a'.repeat(100);
    expect(formatActivityLine(long).length).toBeLessThanOrEqual(72);
  });
});
