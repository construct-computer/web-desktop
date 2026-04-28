/**
 * Spotlight utilities — thinking text detection and message grouping.
 */

import type { ChatMessage } from '@/stores/agentStore';

// ── Thinking text detection ───────────────────────────────────────────────

const ORCHESTRATOR_TOOLS = /\b(spawn_agent|respond_directly|wait_for_agents|update_plan|check_agent_status|cancel_agent|add_observation|respond_to_user)\b/;
const REASONING_STARTERS = /^(We (are|need|should|must|will|can)|I (need|should|must|will|can|am going)|Let me (think|analyze|check|look|consider)|Thus,|Therefore,|So,? (we|I)|Now,? (we|I|let)|First,? (we|I|let)|The user (is|said|wants|asked|mentioned))/;
const REASONING_PHRASES = /\b(I should use|my plan is|let me think|I'll need to|we should use|according to the rules|based on the system|the system (says|description|prompt))\b/i;
const HAS_MARKDOWN = /^(#{1,3} |\*\*|- |\d+\. |```)/m;
const METADATA_MARKERS = /\[DONE\]|\[\d+ steps?\]|\(\d+s\)/;

export function isLikelyThinkingText(content: string): boolean {
  if (!content || content.length < 30) return false;
  if (content.includes('<!--AUTH_CONNECT:')) return false;
  if (HAS_MARKDOWN.test(content)) return false;
  let score = 0;
  if (ORCHESTRATOR_TOOLS.test(content)) score += 2;
  if (REASONING_STARTERS.test(content.trim())) score += 1;
  if (REASONING_PHRASES.test(content)) score += 1;
  if (METADATA_MARKERS.test(content)) score += 1;
  if (content.length > 100 && !content.includes('\n\n') && !content.includes('**')) score += 0.5;
  return score >= 2;
}

// ── Message grouping ────────────────────────────────────────────────────

export type MessageGroup =
  | { type: 'message'; msg: ChatMessage; index: number }
  | { type: 'operation'; msg: ChatMessage; index: number }
  | { type: 'activities'; msgs: ChatMessage[] };

export function groupMessages(messages: ChatMessage[], isAgentRunning: boolean): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let actBuf: ChatMessage[] = [];
  const flush = () => { if (actBuf.length) { groups.push({ type: 'activities', msgs: [...actBuf] }); actBuf = []; } };

  let lastAgentIdx = -1;
  if (isAgentRunning) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'agent') { lastAgentIdx = i; break; }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isOp = msg.role === 'activity' && msg.operationId &&
      ['delegation-group', 'consultation-group', 'background-group', 'orchestration-group'].includes(msg.activityType || '');

    if (isOp) { flush(); groups.push({ type: 'operation', msg, index: i }); }
    else if (msg.role === 'activity') { if (msg.content) actBuf.push(msg); }
    else if (msg.role === 'system' && !msg.askUser) { /* skip */ }
    else if (msg.role === 'agent' && !msg.isError && !msg.content.trim()) { /* skip empty */ }
    else if (msg.role === 'agent' && !msg.isError && !msg.isStopped && i !== lastAgentIdx && isLikelyThinkingText(msg.content)) { /* filter thinking */ }
    else if (msg.role === 'user' && msg.content.startsWith('[App | ')) { /* skip internal app messages */ }
    else { flush(); groups.push({ type: 'message', msg, index: i }); }
  }
  flush();
  return groups;
}

// ── Time formatting ─────────────────────────────────────────────────────

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
