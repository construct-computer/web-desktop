import { describe, expect, it } from 'vitest';
import type { AutopilotLearnedPolicySnapshot, MemoryRecord } from '@/services/api';
import {
  RECENT_WINDOW_MS,
  RECENT_KNOWLEDGE_PREVIEW_LIMIT,
  buildRecentKnowledgePreview,
  formatRecentKnowledgeAge,
  parseMemoryTimestamp,
} from './recentKnowledgePreview';

const NOW = Date.parse('2026-06-16T12:00:00.000Z');

function memory(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, 'id' | 'memory'>): MemoryRecord {
  return {
    created_at: '2026-06-16T10:00:00.000Z',
    ...overrides,
  };
}

function policy(overrides: Partial<AutopilotLearnedPolicySnapshot> & Pick<AutopilotLearnedPolicySnapshot, 'id'>): AutopilotLearnedPolicySnapshot {
  return {
    sessionKey: null,
    policyKey: 'delivery.preferred_channel.reports',
    scope: 'delivery',
    scopeValue: 'reports',
    confidence: 0.78,
    summary: 'Send results by email',
    policyValue: 'email',
    provenance: null,
    updatedAt: NOW - 2 * 60 * 60_000,
    expiresAt: null,
    displayTitle: 'Send results by email',
    displayDescription: 'Deliver report output by email.',
    displayScopeLabel: 'Reports',
    strength: 'strong',
    strengthLabel: 'Strong',
    agentInstruction: 'Send report results by email.',
    ...overrides,
  };
}

describe('recentKnowledgePreview', () => {
  it('parses memory timestamps from updated_at or created_at', () => {
    expect(parseMemoryTimestamp(memory({ id: '1', memory: 'A', updated_at: '2026-06-16T08:00:00.000Z' }))).toBe(
      Date.parse('2026-06-16T08:00:00.000Z'),
    );
    expect(parseMemoryTimestamp(memory({ id: '2', memory: 'B', created_at: '2026-06-16T07:00:00.000Z' }))).toBe(
      Date.parse('2026-06-16T07:00:00.000Z'),
    );
    expect(parseMemoryTimestamp({ id: '3', memory: 'C' })).toBeNull();
  });

  it('includes only items from the last 24 hours and sorts by recency', () => {
    const result = buildRecentKnowledgePreview(
      [
        memory({ id: 'old', memory: 'Old fact', created_at: '2026-06-14T12:00:00.000Z' }),
        memory({ id: 'new', memory: 'Fresh fact', updated_at: '2026-06-16T11:00:00.000Z' }),
      ],
      [
        policy({ id: 1, updatedAt: NOW - 30 * 60_000 }),
        policy({ id: 2, updatedAt: NOW - RECENT_WINDOW_MS - 1 }),
      ],
      NOW,
    );

    expect(result.totalCount).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ kind: 'habit', id: 1 });
    expect(result.items[1]).toMatchObject({ kind: 'fact', id: 'new', text: 'Fresh fact' });
  });

  it('limits preview rows but keeps full total count', () => {
    const memories = Array.from({ length: 5 }, (_, index) => memory({
      id: `m${index}`,
      memory: `Fact ${index}`,
      updated_at: new Date(NOW - index * 60_000).toISOString(),
    }));

    const result = buildRecentKnowledgePreview(memories, [], NOW);
    expect(result.totalCount).toBe(5);
    expect(result.items).toHaveLength(RECENT_KNOWLEDGE_PREVIEW_LIMIT);
  });

  it('formats relative ages for the widget', () => {
    expect(formatRecentKnowledgeAge(NOW - 30_000, NOW)).toBe('just now');
    expect(formatRecentKnowledgeAge(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatRecentKnowledgeAge(NOW - 3 * 60 * 60_000, NOW)).toBe('3h ago');
  });
});
