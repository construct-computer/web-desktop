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

  it('matches a backend BYDAY instant against an expanded occurrence instant', () => {
    // computeNextFromRRule(weekly BYDAY=MO,SA from a Monday 06:00Z seed) yields
    // Saturday 06:00Z; the UTC-based expandRecurrence produces the same instant.
    expect(occurrenceArrayIncludes(['2026-05-23T06:00:00.000Z'], '2026-05-23T06:00:00.000Z')).toBe(true);
  });

  it('tolerates sub-minute representation differences', () => {
    expect(occurrenceArrayIncludes(['2026-06-05T09:00:30.000Z'], '2026-06-05T09:00:00.000Z')).toBe(true);
  });

  it('does not match occurrences in different minutes', () => {
    expect(occurrenceArrayIncludes(['2026-06-05T09:01:00.000Z'], '2026-06-05T09:00:00.000Z')).toBe(false);
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
