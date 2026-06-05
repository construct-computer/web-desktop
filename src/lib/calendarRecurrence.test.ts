import { describe, expect, it } from 'vitest';
import type { AgentCalendarEvent } from '@/services/api';
import { expandAllRecurrences, expandRecurrence } from './calendarRecurrence';

function makeEvent(overrides: Partial<AgentCalendarEvent> & Pick<AgentCalendarEvent, 'start' | 'end'>): AgentCalendarEvent {
  return {
    id: 'evt-1',
    summary: 'Test',
    allDay: false,
    recurrence: ['RRULE:FREQ=HOURLY'],
    ...overrides,
  } as AgentCalendarEvent;
}

describe('calendarRecurrence', () => {
  it('expands hourly never-ending recurrence for full visible month', () => {
    const event = makeEvent({
      start: '2026-06-05T10:12:00.000Z',
      end: '2026-06-05T10:27:00.000Z',
      recurrence: ['RRULE:FREQ=HOURLY'],
    });
    const rangeStart = new Date('2026-06-01T00:00:00.000Z');
    const rangeEnd = new Date('2026-06-30T23:59:59.999Z');

    const expanded = expandRecurrence(event, rangeStart, rangeEnd);
    // June has 30 days ≈ 720 hours from June 5 onward should be ~625 occurrences
    expect(expanded.length).toBeGreaterThan(500);
    expect(expanded.length).toBeLessThanOrEqual(2000);
    expect(expanded[0].start).toBe('2026-06-05T10:12:00.000Z');
    expect(expanded[expanded.length - 1].start >= '2026-06-29').toBe(true);
  });

  it('fills current month when series started months ago', () => {
    const event = makeEvent({
      start: '2026-03-01T09:00:00.000Z',
      end: '2026-03-01T09:15:00.000Z',
      recurrence: ['RRULE:FREQ=HOURLY'],
    });
    const rangeStart = new Date('2026-06-01T00:00:00.000Z');
    const rangeEnd = new Date('2026-06-30T23:59:59.999Z');

    const expanded = expandRecurrence(event, rangeStart, rangeEnd);
    expect(expanded.length).toBeGreaterThan(600);
    expect(expanded[0].start.startsWith('2026-06-01')).toBe(true);
  });

  it('respects COUNT limit', () => {
    const event = makeEvent({
      start: '2026-06-05T10:00:00.000Z',
      end: '2026-06-05T10:15:00.000Z',
      recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
    });
    const rangeStart = new Date('2026-06-01T00:00:00.000Z');
    const rangeEnd = new Date('2026-07-31T23:59:59.999Z');

    const expanded = expandRecurrence(event, rangeStart, rangeEnd);
    expect(expanded.length).toBe(10);
  });

  it('expands daily never recurrence for all days in visible month', () => {
    const event = makeEvent({
      start: '2025-01-01T09:00:00.000Z',
      end: '2025-01-01T09:15:00.000Z',
      recurrence: ['RRULE:FREQ=DAILY'],
    });
    const rangeStart = new Date('2026-06-01T00:00:00.000Z');
    const rangeEnd = new Date('2026-06-30T23:59:59.999Z');

    const expanded = expandRecurrence(event, rangeStart, rangeEnd);
    expect(expanded.length).toBe(30);
  });

  it('deduplicates in expandAllRecurrences', () => {
    const events = [
      makeEvent({
        start: '2026-06-05T10:00:00.000Z',
        end: '2026-06-05T10:15:00.000Z',
        recurrence: ['RRULE:FREQ=DAILY'],
      }),
    ];
    const rangeStart = new Date('2026-06-01T00:00:00.000Z');
    const rangeEnd = new Date('2026-06-10T23:59:59.999Z');
    const expanded = expandAllRecurrences(events, rangeStart, rangeEnd);
    const keys = new Set(expanded.map(e => `${e.id}:${e.start}`));
    expect(keys.size).toBe(expanded.length);
  });
});
