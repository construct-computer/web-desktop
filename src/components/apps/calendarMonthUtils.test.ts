import { describe, expect, it } from 'vitest';
import type { AgentCalendarEvent } from '@/services/api';
import {
  CALENDAR_TONE_COUNT,
  formatEventSidebarTime,
  formatRecurrenceLabel,
  getEventsForCalendarDay,
  getEventAccentIndex,
  getEventToneClass,
  sliceMonthCellPreviews,
  sortEventsForDayCell,
} from './calendarMonthUtils';

function mockEvent(overrides: Partial<AgentCalendarEvent> & Pick<AgentCalendarEvent, 'id' | 'summary' | 'start' | 'end'>): AgentCalendarEvent {
  return {
    description: '',
    location: '',
    allDay: false,
    status: 'confirmed',
    completedOccurrences: null,
    cancelledOccurrences: null,
    sourceType: null,
    sourceMeta: null,
    htmlLink: '',
    meetLink: null,
    organizer: null,
    attendees: [],
    recurrence: null,
    created: '',
    updated: '',
    ...overrides,
  };
}

describe('sortEventsForDayCell', () => {
  it('orders all-day before timed and sorts timed by start', () => {
    const events = [
      mockEvent({ id: 't2', summary: 'Late', start: '2026-04-14T18:00:00.000Z', end: '2026-04-14T19:00:00.000Z' }),
      mockEvent({ id: 'a1', summary: 'Holiday', start: '2026-04-14', end: '2026-04-15', allDay: true }),
      mockEvent({ id: 't1', summary: 'Early', start: '2026-04-14T09:00:00.000Z', end: '2026-04-14T10:00:00.000Z' }),
    ];
    const sorted = sortEventsForDayCell(events);
    expect(sorted.map((e) => e.id)).toEqual(['a1', 't1', 't2']);
  });
});

describe('sliceMonthCellPreviews', () => {
  it('returns all events when within cap', () => {
    const events = [
      mockEvent({ id: '1', summary: 'A', start: '2026-04-01T10:00:00.000Z', end: '2026-04-01T11:00:00.000Z' }),
      mockEvent({ id: '2', summary: 'B', start: '2026-04-01T12:00:00.000Z', end: '2026-04-01T13:00:00.000Z' }),
    ];
    const { previews, overflowCount } = sliceMonthCellPreviews(events, 3);
    expect(previews).toHaveLength(2);
    expect(overflowCount).toBe(0);
  });

  it('caps previews and reports overflow', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      mockEvent({
        id: `e${i}`,
        summary: `Event ${i}`,
        start: `2026-04-01T${10 + i}:00:00.000Z`,
        end: `2026-04-01T${11 + i}:00:00.000Z`,
      }),
    );
    const { previews, overflowCount } = sliceMonthCellPreviews(events, 3);
    expect(previews).toHaveLength(3);
    expect(overflowCount).toBe(2);
  });
});

describe('getEventsForCalendarDay', () => {
  it('includes all-day events spanning the day', () => {
    const day = new Date(2026, 3, 14);
    const events = [
      mockEvent({
        id: 'ad',
        summary: 'Span',
        start: '2026-04-13',
        end: '2026-04-16',
        allDay: true,
      }),
    ];
    expect(getEventsForCalendarDay(day, events)).toHaveLength(1);
  });

  it('includes timed events on the same day', () => {
    const day = new Date(2026, 3, 14);
    const events = [
      mockEvent({
        id: 't',
        summary: 'Meet',
        start: '2026-04-14T14:00:00.000Z',
        end: '2026-04-14T15:00:00.000Z',
      }),
    ];
    expect(getEventsForCalendarDay(day, events).map((e) => e.id)).toEqual(['t']);
  });
});

describe('formatRecurrenceLabel', () => {
  it('maps RRULE freq to readable label', () => {
    expect(formatRecurrenceLabel(['RRULE:FREQ=HOURLY;INTERVAL=1'])).toBe('Hourly');
    expect(formatRecurrenceLabel(null)).toBeNull();
  });
});

describe('formatEventSidebarTime', () => {
  it('formats same-day timed range', () => {
    const line = formatEventSidebarTime(mockEvent({
      id: '1',
      summary: 'A',
      start: '2026-06-05T12:00:00.000Z',
      end: '2026-06-05T12:30:00.000Z',
    }));
    expect(line).toMatch(/–/);
  });
});

describe('getEventAccentIndex', () => {
  it('is stable for the same event id', () => {
    const a = getEventAccentIndex(mockEvent({
      id: 'series-abc',
      summary: 'X',
      start: '2026-04-01T10:00:00.000Z',
      end: '2026-04-01T11:00:00.000Z',
    }));
    const b = getEventAccentIndex(mockEvent({
      id: 'series-abc',
      summary: 'Y',
      start: '2026-04-02T10:00:00.000Z',
      end: '2026-04-02T11:00:00.000Z',
    }));
    expect(a).toBe(b);
  });

  it('stays in palette range', () => {
    const index = getEventAccentIndex(mockEvent({
      id: 'evt-xyz-123',
      summary: 'A',
      start: '2026-04-01T10:00:00.000Z',
      end: '2026-04-01T11:00:00.000Z',
    }));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(CALENDAR_TONE_COUNT);
  });
});

describe('getEventToneClass', () => {
  it('maps id hash to a fixed tone class', () => {
    const event = mockEvent({
      id: 'series-abc',
      summary: 'Standup',
      start: '2026-04-01T10:00:00.000Z',
      end: '2026-04-01T11:00:00.000Z',
    });
    expect(getEventToneClass(event, false)).toBe(`calendar-event-tone-${getEventAccentIndex(event)}`);
    expect(getEventToneClass(event, true)).toBe('calendar-event-tone-completed');
  });
});
