import { describe, expect, it } from 'vitest';
import {
  filterCancelledOccurrences,
  isOccurrenceCancelled,
  occurrenceArrayIncludes,
} from './calendarOccurrences';

describe('calendarOccurrences', () => {
  it('matches occurrence keys across ISO format variants', () => {
    expect(occurrenceArrayIncludes(['2026-06-04T21:35:00.000Z'], '2026-06-04T21:35:00Z')).toBe(true);
  });

  it('detects cancelled occurrences', () => {
    expect(isOccurrenceCancelled(['2026-06-05T09:00:00.000Z'], '2026-06-05T09:00:00Z')).toBe(true);
    expect(isOccurrenceCancelled(['2026-06-05T09:00:00.000Z'], '2026-06-06T09:00:00.000Z')).toBe(false);
  });

  it('filters cancelled expanded events', () => {
    const events = [
      { id: 'a', start: '2026-06-05T09:00:00.000Z', cancelledOccurrences: ['2026-06-05T09:00:00.000Z'] },
      { id: 'a', start: '2026-06-06T09:00:00.000Z', cancelledOccurrences: ['2026-06-05T09:00:00.000Z'] },
    ];
    expect(filterCancelledOccurrences(events)).toEqual([events[1]]);
  });
});
