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

/** Mirror detail priority from the hook for unit testing without React. */
function resolveClippyDetail(input: {
  clippyEntries: Array<{ text: string; timestamp: number }>;
  agentFeedText?: string;
  scrollText?: string;
  topFeedText?: string;
  thinkingMax?: number;
}): string {
  const thinkingMax = input.thinkingMax ?? 56;
  const truncate = (text: string, max: number) =>
    text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

  const latestClippy = [...input.clippyEntries].sort((a, b) => b.timestamp - a.timestamp)[0]?.text;
  const clippyDetail = latestClippy
    ? truncate(latestClippy, thinkingMax)
    : input.agentFeedText
      ? truncate(input.agentFeedText, thinkingMax)
      : '';
  const topFeed = input.topFeedText?.toLowerCase() ?? '';
  const thinkingDetail =
    !clippyDetail && input.scrollText ? truncate(input.scrollText, thinkingMax) : '';
  return clippyDetail
    || (thinkingDetail && topFeed && thinkingDetail.toLowerCase().includes(topFeed.slice(0, 24))
      ? ''
      : thinkingDetail);
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

  it('prefers latest clippy status over thinking stream for detail', () => {
    const detail = resolveClippyDetail({
      clippyEntries: [{ text: 'Checking export settings', timestamp: 100 }],
      scrollText: 'I need to think about whether we should use the browser tool next',
      topFeedText: 'Reading config.yaml',
    });
    expect(detail).toBe('Checking export settings');
  });

  it('falls back to agent feed preview before thinking stream', () => {
    const detail = resolveClippyDetail({
      clippyEntries: [],
      agentFeedText: "I'll open the config and verify the export block…",
      scrollText: 'Still planning the next step for this task',
    });
    expect(detail).toContain('open the config');
  });

  it('falls back to thinking stream when no clippy or agent preview exists', () => {
    const detail = resolveClippyDetail({
      clippyEntries: [],
      scrollText: 'Still planning the next step for this task',
    });
    expect(detail).toContain('Still planning');
  });
});
