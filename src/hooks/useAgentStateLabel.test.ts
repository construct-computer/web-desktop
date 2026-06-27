import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./useAgentStateLabel.ts', import.meta.url), 'utf8');

describe('useAgentStateLabel', () => {
  it('does not treat stale platformAgent.running as active without a live session', () => {
    expect(source).toMatch(/const hasLiveActiveSession = Object\.values\(activeSessions\)\.some/);
    expect(source).toMatch(/const hasAnyPlatformRunning = \(runningSessionCount > 0 \|\| hasLiveActiveSession\)/);
  });
});
