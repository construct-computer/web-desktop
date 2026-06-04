import { describe, expect, it } from 'vitest';
import type { TrackedOperation } from '@/stores/agentTrackerStore';

/** Mirror feed dedupe logic from the hook for unit testing without React. */
function buildFeedHasSubagentDedupe(
  hasSubagents: boolean,
  subagentFeedCount: number,
  mainFeedCount: number,
): number {
  let feedLen = mainFeedCount;
  if (!hasSubagents) {
    feedLen += subagentFeedCount;
  }
  return feedLen;
}

describe('useClippyActivitySummary feed rules', () => {
  it('skips subagent rows in feed when helpers are active', () => {
    const withHelpers = buildFeedHasSubagentDedupe(true, 3, 2);
    const withoutHelpers = buildFeedHasSubagentDedupe(false, 3, 2);
    expect(withHelpers).toBe(2);
    expect(withoutHelpers).toBe(5);
  });

  it('documents running operation filter', () => {
    const op = { status: 'running', sessionKey: 'main' } as TrackedOperation;
    const matches = !op.sessionKey || op.sessionKey === 'main';
    expect(matches).toBe(true);
  });
});
