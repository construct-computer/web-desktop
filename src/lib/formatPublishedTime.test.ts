import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatPublishedAbsolute, formatPublishedRelative } from './format';

describe('formatPublishedRelative', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats recent times', () => {
    const now = Date.parse('2026-06-05T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatPublishedRelative('2026-06-05T11:59:30.000Z', now)).toBe('now');
    expect(formatPublishedRelative('2026-06-05T11:30:00.000Z', now)).toBe('30m ago');
    expect(formatPublishedRelative('2026-06-05T08:00:00.000Z', now)).toBe('4h ago');
    expect(formatPublishedRelative('2026-06-02T12:00:00.000Z', now)).toBe('3d ago');
  });

  it('formats months and years', () => {
    const now = Date.parse('2026-06-05T12:00:00.000Z');
    expect(formatPublishedRelative('2026-04-05T12:00:00.000Z', now)).toBe('2mo ago');
    expect(formatPublishedRelative('2025-06-05T12:00:00.000Z', now)).toBe('1y ago');
  });

  it('falls back to raw string when unparseable', () => {
    expect(formatPublishedRelative('Yesterday')).toBe('Yesterday');
  });
});

describe('formatPublishedAbsolute', () => {
  it('formats parseable ISO timestamps', () => {
    const result = formatPublishedAbsolute('2026-06-05T14:52:18.479Z');
    expect(result).toContain('2026');
  });

  it('falls back to raw string when unparseable', () => {
    expect(formatPublishedAbsolute('not-a-date')).toBe('not-a-date');
  });
});
