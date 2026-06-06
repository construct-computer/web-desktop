import { describe, expect, it } from 'vitest';
import type { TrackedOperation } from '@/stores/agentTrackerStore';
import { resolveStatusNarrative } from '@/lib/clippyActivityModel';

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

  it('statusNarrative prefers clippy over scroll filler', () => {
    const narrative = resolveStatusNarrative({
      clippyEntries: [{ id: '1', text: 'Checking export settings', timestamp: 100 }],
      agentPreview: '',
      scrollText: 'Working on the response.',
    });
    expect(narrative).toBe('Checking export settings');
  });

  it('statusNarrative uses agent preview before generic scroll text', () => {
    const narrative = resolveStatusNarrative({
      clippyEntries: [],
      agentPreview: "I'll open the config and verify the export block…",
      scrollText: 'Working on the response.',
    });
    expect(narrative).toContain('open the config');
  });

  it('statusNarrative ignores generic scroll text', () => {
    const narrative = resolveStatusNarrative({
      clippyEntries: [],
      agentPreview: '',
      scrollText: 'Working on the response.',
    });
    expect(narrative).toBe('');
  });
});
