import { describe, expect, it } from 'vitest';
import {
  buildToolFeed,
  dedupeTerminalToolRows,
  isGenericProgressText,
  resolveAgentPreviewFromTurn,
  resolveStatusNarrative,
} from './clippyActivityModel';
import type { ClippyToolFeedItem } from './clippyActivityModel';

describe('clippyActivityModel', () => {
  it('filters generic progress strings', () => {
    expect(isGenericProgressText('Working on the response.')).toBe(true);
    expect(isGenericProgressText('Checking export settings')).toBe(false);
  });

  it('prefers clippy status over agent preview and scroll text', () => {
    const narrative = resolveStatusNarrative({
      clippyEntries: [{ id: '1', text: 'Saving export settings', timestamp: 100 }],
      agentPreview: 'Older preview text',
      scrollText: 'Working on the response.',
    });
    expect(narrative).toBe('Saving export settings');
  });

  it('uses agent preview when clippy is absent', () => {
    const narrative = resolveStatusNarrative({
      clippyEntries: [],
      agentPreview: 'Scheduled task to process signups',
      scrollText: 'Working on the response.',
    });
    expect(narrative).toBe('Scheduled task to process signups');
  });

  it('excludes agent rows from tool feed', () => {
    const feed = buildToolFeed(
      [
        {
          id: 'agent:1',
          actor: 'Main',
          text: 'Scheduled task to process signups',
          kind: 'agent',
          timestamp: 100,
        },
        {
          id: 'tool:1',
          actor: 'Main',
          text: 'Writing signups_state.json',
          kind: 'file',
          timestamp: 90,
        },
      ],
      { mobile: false, statusNarrative: 'Scheduled task to process signups' },
    );
    expect(feed.some((item) => item.kind === 'agent')).toBe(false);
    expect(feed[0]?.text).toBe('Writing signups_state.json');
  });

  it('dedupes matching terminal activity and terminal run rows', () => {
    const rows: ClippyToolFeedItem[] = [
      {
        id: 'a1',
        actor: 'Main',
        text: 'Running curl -s https://signups.example.com',
        kind: 'tool',
        timestamp: 200,
        activityType: 'terminal',
        tool: 'exec',
        activityStatus: 'running',
      },
      {
        id: 't1',
        actor: 'Main',
        text: 'Running curl -s https://signups.example.com · exit 0',
        kind: 'terminal',
        timestamp: 198,
        activityType: 'terminal',
        tool: 'terminal',
        status: 'completed',
      },
    ];
    const deduped = dedupeTerminalToolRows(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.text).toContain('exit 0');
  });

  it('resolves agent preview from current turn', () => {
    const preview = resolveAgentPreviewFromTurn({
      keepPreview: true,
      clippyEntries: [],
      chatMessages: [
        { role: 'user', content: 'go', timestamp: new Date(1) },
        { role: 'agent', content: 'Scheduled task completed successfully.\n- Read signups_state.json', timestamp: new Date(2) },
      ],
    });
    expect(preview).toContain('Scheduled task completed');
  });
});
