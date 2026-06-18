import type { ChatMessage } from './agentStore';
import { activityDedupeKey } from '@/components/desktop/spotlight/browserActivityUtils';

function messageTimestampMs(message: ChatMessage): number {
  const ts = message.timestamp;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return 0;
}

/** Stable chronological ordering for chat rows (user before agent on timestamp ties). */
export function sortChatMessagesByTimestamp(messages: ChatMessage[]): ChatMessage[] {
  const roleRank = (message: ChatMessage): number => {
    if (message.role === 'user') return 0;
    if (message.role === 'system' && !message.content?.trim()) return 1;
    if (message.role === 'activity') return 2;
    if (message.role === 'agent') return 3;
    return 4;
  };
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const byTime = messageTimestampMs(a.message) - messageTimestampMs(b.message);
      if (byTime !== 0) return byTime;
      const byRole = roleRank(a.message) - roleRank(b.message);
      if (byRole !== 0) return byRole;
      return a.index - b.index;
    })
    .map(({ message }) => message);
}

export function turnBreakMessage(now = Date.now()): ChatMessage {
  return { role: 'system', content: '', timestamp: new Date(now) };
}

/** Insert a turn break before the user row when the prior bubble was an agent reply. */
export function appendUserMessageForNewTurn(messages: ChatMessage[], userMsg: ChatMessage): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role === 'agent' && !last.isError) {
    return [...messages, turnBreakMessage(), userMsg];
  }
  return [...messages, userMsg];
}

export function lastUserMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

/**
 * True when the trailing message is an in-progress agent bubble for the
 * current turn (there is no newer user message after it).
 */
export function shouldAppendAgentTextDelta(messages: ChatMessage[]): boolean {
  if (messages.length === 0) return false;
  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (last.role !== 'agent' || last.isError) return false;
  const lastUserIdx = lastUserMessageIndex(messages);
  if (lastUserIdx === -1) return true;
  return lastUserIdx < lastIdx;
}

function userMessageKey(message: ChatMessage): string {
  if (message.clientId) return `id:${message.clientId}`;
  return `content:${message.content}`;
}

/** User rows present in live state that the server history snapshot has not caught up to yet. */
export function liveUserMessagesAheadOfHistory(live: ChatMessage[], history: ChatMessage[]): ChatMessage[] {
  const histUserKeys = new Set(
    history.filter((m) => m.role === 'user').map(userMessageKey),
  );
  const tail: ChatMessage[] = [];
  for (let i = live.length - 1; i >= 0; i--) {
    const message = live[i];
    if (message.role === 'user') {
      if (histUserKeys.has(userMessageKey(message))) break;
      tail.unshift(message);
      continue;
    }
    if (message.role === 'system' && !message.content?.trim()) {
      if (tail.length > 0) continue;
      break;
    }
    if (tail.length > 0) break;
  }
  return tail;
}

/** Agent/activity rows after the latest user turn that SQL has not caught up to yet. */
export function liveAssistantTailAheadOfHistory(live: ChatMessage[], history: ChatMessage[]): ChatMessage[] {
  let lastLiveUserIdx = -1;
  for (let i = live.length - 1; i >= 0; i--) {
    if (live[i].role === 'user') {
      lastLiveUserIdx = i;
      break;
    }
  }
  if (lastLiveUserIdx < 0) return [];

  const historyActivityKeys = new Set(
    history
      .filter((m) => m.role === 'activity')
      .map((m) => activityDedupeKey(m))
      .filter((key): key is string => Boolean(key)),
  );
  const historyToolCallIds = new Set(
    history
      .filter((m) => m.role === 'activity' && m.toolCallId)
      .map((m) => m.toolCallId as string),
  );

  const tail: ChatMessage[] = [];
  for (let i = lastLiveUserIdx + 1; i < live.length; i++) {
    const message = live[i];
    if (message.role === 'agent') {
      if (!message.content.trim() || message.isError) continue;
      const inHistory = history.some(
        (h) => h.role === 'agent' && h.content.trim() === message.content.trim(),
      );
      if (!inHistory) tail.push(message);
      continue;
    }
    if (message.role === 'activity') {
      if (message.toolCallId && historyToolCallIds.has(message.toolCallId)) continue;
      const key = activityDedupeKey(message);
      if (key && historyActivityKeys.has(key)) continue;
      tail.push(message);
      continue;
    }
    if (message.role === 'system' && !message.content?.trim()) {
      tail.push(message);
    }
  }
  return tail;
}

export function mergeLiveTailIntoHistory(history: ChatMessage[], live: ChatMessage[]): ChatMessage[] {
  if (live.length === 0) return history;
  // Server snapshot can briefly be empty while the UI still holds the full thread.
  if (history.length === 0) return live;
  const userTail = liveUserMessagesAheadOfHistory(live, history);
  const assistantTail = userTail.length === 0 ? liveAssistantTailAheadOfHistory(live, history) : [];
  const tail = userTail.length > 0 ? userTail : assistantTail;
  if (tail.length === 0) return history;
  return sortChatMessagesByTimestamp([...history, ...tail]);
}

/**
 * Attach reasoning/thinking text to the most recent in-progress assistant
 * bubble. Used when reasoning streams in just before (or alongside) the answer
 * so the "Thinking" block persists on the message after the live indicator
 * clears. Concatenates onto any reasoning already present so multi-step turns
 * accumulate rather than overwrite.
 */
export function attachReasoningToLastAgent(messages: ChatMessage[], reasoning: string): ChatMessage[] {
  if (!reasoning) return messages;
  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (!last || last.role !== 'agent' || last.isError) return messages;
  const merged = (last.reasoning || '') + reasoning;
  const updated = [...messages];
  updated[lastIdx] = { ...last, reasoning: merged };
  return updated;
}

export function applyAgentTextDelta(
  messages: ChatMessage[],
  text: string,
  attachIterationLimit: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  if (text.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (shouldAppendAgentTextDelta(messages) && last?.role === 'agent' && !last.isError) {
    const updated = [...messages];
    updated[updated.length - 1] = attachIterationLimit({
      ...last,
      content: last.content + text,
    });
    return updated;
  }
  return [...messages, attachIterationLimit({ role: 'agent', content: text, timestamp: new Date() })];
}
