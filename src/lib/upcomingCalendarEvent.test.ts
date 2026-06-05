import { describe, expect, it } from 'vitest';
import type { AgentCalendarEvent } from '@/services/api';
import { pickNextUpcomingEvent } from './upcomingCalendarEvent';

describe('pickNextUpcomingEvent', () => {
  const now = new Date('2026-06-05T12:00:00.000Z');

  it('returns the earliest future expanded occurrence', () => {
    const events: AgentCalendarEvent[] = [
      {
        id: 'later',
        summary: 'Later',
        description: '',
        location: '',
        start: '2026-06-10T09:00:00.000Z',
        end: '2026-06-10T10:00:00.000Z',
        allDay: false,
        recurrence: null,
        status: 'confirmed',
        completedOccurrences: null,
        cancelledOccurrences: null,
        sourceType: null,
        sourceMeta: null,
        htmlLink: '',
        meetLink: null,
        organizer: null,
        attendees: [],
        created: '',
        updated: '',
      },
      {
        id: 'sooner',
        summary: 'Sooner',
        description: '',
        location: '',
        start: '2026-06-06T09:00:00.000Z',
        end: '2026-06-06T10:00:00.000Z',
        allDay: false,
        recurrence: null,
        status: 'confirmed',
        completedOccurrences: null,
        cancelledOccurrences: null,
        sourceType: null,
        sourceMeta: null,
        htmlLink: '',
        meetLink: null,
        organizer: null,
        attendees: [],
        created: '',
        updated: '',
      },
    ];

    expect(pickNextUpcomingEvent(events, now)?.summary).toBe('Sooner');
  });

  it('skips cancelled recurring occurrences and uses the next valid one', () => {
    const events: AgentCalendarEvent[] = [
      {
        id: 'weekly',
        summary: 'aaaa',
        description: '',
        location: '',
        start: '2026-06-05T09:00:00.000Z',
        end: '2026-06-05T10:00:40.000Z',
        allDay: false,
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TH'],
        status: 'confirmed',
        completedOccurrences: null,
        cancelledOccurrences: ['2026-06-05T09:00:00.000Z'],
        sourceType: null,
        sourceMeta: null,
        htmlLink: '',
        meetLink: null,
        organizer: null,
        attendees: [],
        created: '',
        updated: '',
      },
    ];

    const next = pickNextUpcomingEvent(events, now);
    expect(next?.summary).toBe('aaaa');
    expect(next?.start).not.toBe('2026-06-05T09:00:00.000Z');
  });

  it('returns null when no future events remain', () => {
    const events: AgentCalendarEvent[] = [
      {
        id: 'past',
        summary: 'aaaa',
        description: '',
        location: '',
        start: '2026-06-04T09:00:00.000Z',
        end: '2026-06-04T10:00:00.000Z',
        allDay: false,
        recurrence: null,
        status: 'confirmed',
        completedOccurrences: null,
        cancelledOccurrences: null,
        sourceType: null,
        sourceMeta: null,
        htmlLink: '',
        meetLink: null,
        organizer: null,
        attendees: [],
        created: '',
        updated: '',
      },
    ];

    expect(pickNextUpcomingEvent(events, now)).toBeNull();
  });
});
