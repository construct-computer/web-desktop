import { describe, expect, it } from 'vitest';
import {
  collectTableHeaders,
  countTableRows,
  formatVisualCell,
  formatVisualScalar,
  isTableArray,
} from './structuredDataVisual';

const SIGNUPS_PAYLOAD = {
  signups: [
    {
      id: 2,
      name: 'Noah Johansson',
      email: 'ankush4singh@gmail.com',
      usage: 'Need an agent swarm for customer support',
      company: null,
      created_at: '2026-06-05T14:52:18.479Z',
    },
    {
      id: 3,
      name: 'Juno Doe',
      email: 'juno@example.com',
      usage: 'Testing',
      company: null,
      created_at: '2026-06-05T15:24:00.966Z',
    },
  ],
  next: '/signups?since=1&last_ts=2026-06-05T15%3A24%3A00.966Z',
};

describe('structuredDataVisual', () => {
  it('detects signups array as table candidate', () => {
    expect(isTableArray(SIGNUPS_PAYLOAD.signups)).toBe(true);
    expect(isTableArray(SIGNUPS_PAYLOAD)).toBe(false);
  });

  it('rejects primitive and mixed arrays for tables', () => {
    expect(isTableArray([1, 2, 3])).toBe(false);
    expect(isTableArray(['a', 'b'])).toBe(false);
    expect(isTableArray([{ id: 1 }, 'oops', { id: 2 }])).toBe(false);
  });

  it('collects union headers from table rows', () => {
    const headers = collectTableHeaders([
      { id: 1, name: 'A' },
      { id: 2, email: 'a@b.c' },
    ]);
    expect(headers).toEqual(['id', 'name', 'email']);
  });

  it('counts nested table rows', () => {
    expect(countTableRows(SIGNUPS_PAYLOAD)).toBe(2);
    expect(countTableRows(SIGNUPS_PAYLOAD.signups)).toBe(2);
  });

  it('formats null and nested object cells', () => {
    expect(formatVisualCell(null)).toBe('—');
    expect(formatVisualCell({ a: 1, b: 2, c: 3 })).toBe('{"a":1,"b":2,"c":3}');
    expect(formatVisualCell({ a: 1, b: 2, c: 3 }, 10)).toBe('{3 keys}');
    expect(formatVisualCell([1, 2, 3])).toBe('1, 2, 3');
  });

  it('decodes encoded path strings in scalar formatter', () => {
    expect(formatVisualScalar('/signups?since=1&last_ts=2026-06-05T15%3A24%3A00.966Z')).toBe(
      '/signups?since=1&last_ts=2026-06-05T15:24:00.966Z',
    );
    expect(formatVisualScalar('Scheduled%20Tasks')).toBe('Scheduled Tasks');
  });
});
