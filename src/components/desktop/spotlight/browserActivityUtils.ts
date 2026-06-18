import type { ChatMessage } from '@/stores/agentStore';

const WEB_TOOL_MERGE = new Set(['web_search', 'web_fetch', 'arxiv', 'domain_intel']);

function hostFromUrl(url?: string): string {
  if (!url) return '';
  try { return new URL(url).hostname; } catch { return url; }
}

function activityStatusRank(status?: string, isError?: boolean): number {
  if (status === 'completed' && !isError) return 3;
  if (status === 'running') return 2;
  if (status === 'failed' || isError) return 1;
  return 0;
}

function pickBetterActivity(current: ChatMessage, candidate: ChatMessage): ChatMessage {
  const currentRank = activityStatusRank(current.activityStatus, current.isError);
  const candidateRank = activityStatusRank(candidate.activityStatus, candidate.isError);
  if (candidateRank !== currentRank) {
    return candidateRank > currentRank ? candidate : current;
  }
  if (!!candidate.toolCallId !== !!current.toolCallId) {
    return candidate.toolCallId ? candidate : current;
  }
  const currentTs = current.timestamp instanceof Date ? current.timestamp.getTime() : 0;
  const candidateTs = candidate.timestamp instanceof Date ? candidate.timestamp.getTime() : 0;
  return candidateTs >= currentTs ? candidate : current;
}

/** Shared dedupe key for activity rows (banner collapse + history merge). */
export function activityDedupeKey(act: ChatMessage): string | null {
  if (act.toolCallId) return `toolcall:${act.toolCallId}`;

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

  const tool = act.integrationTool || act.tool || '';
  const content = (act.content || '').trim();
  if (WEB_TOOL_MERGE.has(act.tool || '') && content) {
    return `tool:${act.tool}:${content}`;
  }
  if (content) {
    return `content:${tool || 'activity'}:${content}`;
  }
  return null;
}

function mergeKey(act: ChatMessage): string | null {
  return activityDedupeKey(act);
}

/**
 * Collapse consecutive activities that share the same merge key (browser run/host,
 * web_search/web_fetch, or identical content). Returns each item with a `repeat` count.
 * When a later successful row supersedes failed retries, prefer the successful row.
 */
export function mergeBrowserRepeats(activities: ChatMessage[]): Array<{ act: ChatMessage; repeat: number }> {
  const out: Array<{ act: ChatMessage; repeat: number }> = [];
  for (const act of activities) {
    const last = out[out.length - 1];
    const key = mergeKey(act);
    const lastKey = last ? mergeKey(last.act) : null;
    if (last && key && lastKey === key) {
      const lastFailed = last.act.activityStatus === 'failed' || last.act.isError;
      const currentFailed = act.activityStatus === 'failed' || act.isError;
      if (lastFailed && !currentFailed) {
        last.act = act;
        last.repeat += 1;
        continue;
      }
      last.act = pickBetterActivity(last.act, act);
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
