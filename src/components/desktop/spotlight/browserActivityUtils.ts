import type { ChatMessage } from '@/stores/agentStore';

const WEB_TOOL_MERGE = new Set(['web_search', 'web_fetch', 'arxiv', 'domain_intel']);

function hostFromUrl(url?: string): string {
  if (!url) return '';
  try { return new URL(url).hostname; } catch { return url; }
}

function mergeKey(act: ChatMessage): string | null {
  if (act.activityType === 'web' || act.tool === 'browser') {
    if (act.browserRunId) return `run:${act.browserRunId}`;
    const host = hostFromUrl(act.browserAction?.url);
    if (host) return `host:${host}:${act.tool || 'browser'}`;
    if (act.tool === 'browser' && act.content?.startsWith('Browsing ')) {
      return `browse:${act.content}`;
    }
    if (act.browserAction) {
      return `action:${act.browserAction.actionType || 'step'}:${hostFromUrl(act.browserAction.url)}`;
    }
  }

  if (act.tool === 'memory' && act.memoryActivity) {
    const opId = act.memoryActivity.operationId;
    if (opId) return `memory:op:${opId}`;
    const ids = act.memoryActivity.items.map((item) => item.id).sort().join(',');
    if (ids) return `memory:items:${ids}`;
  }

  const tool = act.tool || '';
  const content = (act.content || '').trim();
  if (WEB_TOOL_MERGE.has(tool) && content) {
    return `tool:${tool}:${content}`;
  }
  if (content) {
    return `content:${tool || 'activity'}:${content}`;
  }
  return null;
}

/**
 * Collapse consecutive activities that share the same merge key (browser run/host,
 * web_search/web_fetch, or identical content). Returns each item with a `repeat` count.
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
