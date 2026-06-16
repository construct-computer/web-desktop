import type { AutopilotLearnedPolicySnapshot, MemoryRecord } from '@/services/api';
import { formatLearnedPolicyDisplay } from '@/lib/learnedPolicyDisplay';

export const RECENT_WINDOW_MS = 24 * 60 * 60_000;
export const RECENT_KNOWLEDGE_PREVIEW_LIMIT = 3;

export type RecentKnowledgeItem =
  | { kind: 'fact'; id: string; text: string; at: number }
  | { kind: 'habit'; id: number; text: string; at: number };

export function parseMemoryTimestamp(record: MemoryRecord): number | null {
  const raw = record.updated_at || record.created_at;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatRecentKnowledgeAge(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function buildRecentKnowledgePreview(
  memories: MemoryRecord[],
  policies: AutopilotLearnedPolicySnapshot[],
  now = Date.now(),
): { items: RecentKnowledgeItem[]; totalCount: number } {
  const cutoff = now - RECENT_WINDOW_MS;
  const items: RecentKnowledgeItem[] = [];

  for (const memory of memories) {
    const at = parseMemoryTimestamp(memory);
    if (at == null || at < cutoff) continue;
    const text = memory.memory?.trim();
    if (!text) continue;
    items.push({ kind: 'fact', id: memory.id, text, at });
  }

  for (const policy of policies) {
    const at = policy.updatedAt;
    if (!Number.isFinite(at) || at < cutoff) continue;
    const display = formatLearnedPolicyDisplay(policy);
    const text = display.title?.trim();
    if (!text) continue;
    items.push({ kind: 'habit', id: policy.id, text, at });
  }

  items.sort((a, b) => b.at - a.at);
  return {
    items: items.slice(0, RECENT_KNOWLEDGE_PREVIEW_LIMIT),
    totalCount: items.length,
  };
}
