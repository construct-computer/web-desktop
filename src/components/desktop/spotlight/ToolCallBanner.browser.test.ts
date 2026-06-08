import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/agentStore';

/** Contract: browser run activities collapse to card-only surface in banner lists. */
function filterBrowserNoise(activities: ChatMessage[], runId: string): ChatMessage[] {
  return activities.filter((a) => {
    if (a.browserRunId && a.browserRunId !== runId) return true;
    if (a.tool === 'browser' || a.tool === 'remote_browser') return false;
    if (a.activityType === 'web' && a.browserAction) return false;
    if (typeof a.content === 'string' && a.content.startsWith('Browsing ')) return false;
    return true;
  });
}

describe('ToolCallBanner browser dedupe contract', () => {
  it('keeps non-browser tools and hides browser timeline rows for one run', () => {
    const runId = 'run-abc';
    const activities: ChatMessage[] = [
      { role: 'activity', content: 'Browsing https://news.ycombinator.com', timestamp: new Date(), tool: 'browser', browserRunId: runId, activityType: 'web', browserAction: { actionType: 'open', url: 'https://news.ycombinator.com' } },
      { role: 'activity', content: 'Click link', timestamp: new Date(), tool: 'browser', browserRunId: runId, activityType: 'web', browserAction: { actionType: 'click' } },
      { role: 'activity', content: 'Wrote notes.md', timestamp: new Date(), tool: 'files', activityType: 'file' },
    ];
    const filtered = filterBrowserNoise(activities, runId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].tool).toBe('files');
  });
});
