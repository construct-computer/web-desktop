import type { ChatMessage } from '@/stores/agentStore';

function hostFromUrl(url?: string): string {
  if (!url) return '';
  try { return new URL(url).hostname; } catch { return url; }
}

function mergeKey(act: ChatMessage): string | null {
  if (act.activityType !== 'web' && act.tool !== 'browser') return null;
  if (act.browserRunId) return `run:${act.browserRunId}`;
  const host = hostFromUrl(act.browserAction?.url);
  if (host) return `host:${host}:${act.tool || 'browser'}`;
  if (act.tool === 'browser' && act.content?.startsWith('Browsing ')) {
    return `browse:${act.content}`;
  }
  if (act.browserAction) {
    return `action:${act.browserAction.actionType || 'step'}:${hostFromUrl(act.browserAction.url)}`;
  }
  return null;
}

/**
 * Collapse consecutive browser activities that belong to the same run or host.
 * Returns each item with a `repeat` count. Non-browser activities pass through (repeat=1).
 */
export function mergeBrowserRepeats(activities: ChatMessage[]): Array<{ act: ChatMessage; repeat: number }> {
  const out: Array<{ act: ChatMessage; repeat: number }> = [];
  for (const act of activities) {
    const last = out[out.length - 1];
    const key = mergeKey(act);
    const lastKey = last ? mergeKey(last.act) : null;
    if (last && key && lastKey === key) {
      last.repeat += 1;
      continue;
    }
    out.push({ act, repeat: 1 });
  }
  return out;
}

/** Display cap for repeat badges in the activity timeline. */
export function formatRepeatBadge(repeat: number): string {
  if (repeat <= 1) return '';
  return repeat > 3 ? '×3+' : `×${repeat}`;
}
