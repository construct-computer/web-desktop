import type { ChatMessage } from './agentStore';

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

export function mergeLiveTailIntoHistory(history: ChatMessage[], live: ChatMessage[]): ChatMessage[] {
  const tail = liveUserMessagesAheadOfHistory(live, history);
  if (tail.length === 0) return history;
  return [...history, ...tail];
}

export function applyAgentTextDelta(
  messages: ChatMessage[],
  text: string,
  attachIterationLimit: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  if (!text.trim()) return messages;
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
