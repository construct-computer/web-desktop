import type { ChatMessage, ClippyStatusEntry } from '@/stores/agentStore';
import { summarizeAgentTextPreview } from '@/lib/clippyAgentPreview';

export interface ClippyToolFeedItem {
  id: string;
  actor: string;
  text: string;
  kind: string;
  timestamp: number;
  status?: 'running' | 'completed' | 'failed';
  tool?: string;
  activityType?: string;
  activityStatus?: 'running' | 'completed' | 'failed';
}

export const GENERIC_CLIPPY_PROGRESS = new Set([
  'Working on the response.',
  'Running the needed tool.',
  'Running the needed tools.',
  'Compacting long context before continuing.',
]);

export const NARRATIVE_MAX_CHARS = 120;
const CLIPPY_COVERAGE_MS = 5000;
const TERMINAL_DEDUP_MS = 5000;

function truncate(text: string, max: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

export function isGenericProgressText(text: string): boolean {
  const compact = text.replace(/\s+/g, ' ').trim();
  return GENERIC_CLIPPY_PROGRESS.has(compact);
}

function messageCoveredByClippy(msgTime: number, entries: ClippyStatusEntry[]): boolean {
  return entries.some(
    (entry) => entry.timestamp >= msgTime - CLIPPY_COVERAGE_MS && entry.timestamp <= msgTime + 2000,
  );
}

function timestampOf(message: ChatMessage): number {
  const value = message.timestamp;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.now();
}

function findLastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

export function resolveAgentPreviewFromTurn(input: {
  chatMessages: ChatMessage[];
  clippyEntries: ClippyStatusEntry[];
  keepPreview: boolean;
}): string {
  if (!input.keepPreview) return '';

  const lastUserIdx = findLastUserIndex(input.chatMessages);
  const turnMessages = lastUserIdx >= 0
    ? input.chatMessages.slice(lastUserIdx + 1)
    : input.chatMessages;

  const agentTurnMessages = turnMessages.filter(
    (msg) => msg.role === 'agent' && !msg.isError && msg.content.trim(),
  );
  if (agentTurnMessages.length === 0) return '';

  for (let i = agentTurnMessages.length - 1; i >= 0; i--) {
    const message = agentTurnMessages[i];
    if (message.askUser) return 'Needs your input';
    if (messageCoveredByClippy(timestampOf(message), input.clippyEntries)) continue;
    const preview = summarizeAgentTextPreview(message.content);
    if (preview) return preview;
  }
  return '';
}

export function resolveStatusNarrative(input: {
  clippyEntries: ClippyStatusEntry[];
  agentPreview: string;
  scrollText: string;
}): string {
  const latestClippy = [...input.clippyEntries]
    .sort((a, b) => b.timestamp - a.timestamp)[0]?.text;
  if (latestClippy) return truncate(latestClippy, NARRATIVE_MAX_CHARS);

  if (input.agentPreview) return truncate(input.agentPreview, NARRATIVE_MAX_CHARS);

  const scroll = input.scrollText.replace(/\s+/g, ' ').trim();
  if (scroll && !isGenericProgressText(scroll)) {
    return truncate(scroll, NARRATIVE_MAX_CHARS);
  }
  return '';
}

function normalizeCommandText(text: string): string {
  return text
    .replace(/^Running\s+/i, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function commandsMatch(a: string, b: string): boolean {
  const left = normalizeCommandText(a);
  const right = normalizeCommandText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return longer.includes(shorter) && shorter.length >= 12;
}

function toolRowScore(item: ClippyToolFeedItem): number {
  let score = 1;
  if (item.status === 'running' || item.activityStatus === 'running') score += 2;
  if (item.text.includes('exit')) score += 2;
  if (item.kind === 'terminal') score += 1;
  return score;
}

export function dedupeTerminalToolRows<T extends ClippyToolFeedItem>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
  const kept: T[] = [];

  for (const item of sorted) {
    const isTerminalLike =
      item.kind === 'terminal'
      || item.activityType === 'terminal'
      || item.tool === 'terminal'
      || item.tool === 'exec';

    if (!isTerminalLike) {
      kept.push(item);
      continue;
    }

    const duplicateIdx = kept.findIndex((other) => {
      const otherTerminal =
        other.kind === 'terminal'
        || other.activityType === 'terminal'
        || other.tool === 'terminal'
        || other.tool === 'exec';
      if (!otherTerminal) return false;
      if (Math.abs(item.timestamp - other.timestamp) > TERMINAL_DEDUP_MS) return false;
      return commandsMatch(item.text, other.text);
    });

    if (duplicateIdx === -1) {
      kept.push(item);
      continue;
    }

    if (toolRowScore(item) > toolRowScore(kept[duplicateIdx])) {
      kept[duplicateIdx] = item;
    }
  }

  return kept.sort((a, b) => b.timestamp - a.timestamp);
}

export function excludeNarrativeDuplicatesFromToolFeed<T extends ClippyToolFeedItem>(
  toolFeed: T[],
  statusNarrative: string,
): T[] {
  if (!statusNarrative.trim()) return toolFeed;
  const narrativeKey = statusNarrative.toLowerCase().slice(0, 24);
  return toolFeed.filter((item) => {
    const rowKey = item.text.toLowerCase().slice(0, 24);
    return !narrativeKey || !rowKey.includes(narrativeKey);
  });
}

export function toolFeedCap(mobile: boolean, hasNarrative: boolean): number {
  if (hasNarrative) return mobile ? 2 : 3;
  return mobile ? 3 : 4;
}

export function buildToolFeed<T extends ClippyToolFeedItem>(
  items: T[],
  options: { mobile: boolean; statusNarrative: string },
): T[] {
  const withoutAgent = items.filter((item) => item.kind !== 'agent');
  const deduped = dedupeTerminalToolRows(withoutAgent);
  const filtered = excludeNarrativeDuplicatesFromToolFeed(deduped, options.statusNarrative);
  const cap = toolFeedCap(options.mobile, Boolean(options.statusNarrative.trim()));

  return filtered
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.actor === item.actor && other.text === item.text) === index,
    )
    .slice(0, cap);
}
