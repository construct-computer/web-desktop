import type { ChatMessage } from '@/stores/agentStore';

/**
 * Collapse consecutive browser activities whose label, action type, and url
 * match. Returns each item with a `repeat` count. Non-browser activities
 * pass through untouched (repeat=1).
 */
export function mergeBrowserRepeats(activities: ChatMessage[]): Array<{ act: ChatMessage; repeat: number }> {
  const out: Array<{ act: ChatMessage; repeat: number }> = [];
  for (const act of activities) {
    const last = out[out.length - 1];
    if (last && canMerge(last.act, act)) {
      last.repeat += 1;
      continue;
    }
    out.push({ act, repeat: 1 });
  }
  return out;
}

function canMerge(a: ChatMessage, b: ChatMessage): boolean {
  if (a.activityType !== 'web' || b.activityType !== 'web') return false;
  if (!a.browserAction || !b.browserAction) return false;
  if (a.content !== b.content) return false;
  if (a.browserAction.actionType !== b.browserAction.actionType) return false;
  if ((a.browserAction.url || '') !== (b.browserAction.url || '')) return false;
  // Don't merge waits with different durations; that loses useful signal.
  if ((a.browserAction.waitMs ?? -1) !== (b.browserAction.waitMs ?? -1)) return false;
  // Don't merge entries with sub-actions: each compound is semantically distinct.
  if ((a.browserAction.subActions?.length || 0) > 0) return false;
  if ((b.browserAction.subActions?.length || 0) > 0) return false;
  return true;
}
