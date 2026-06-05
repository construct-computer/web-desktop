import type { AgentCalendarEvent } from '@/services/api';
import { filterCancelledOccurrences } from '@/lib/calendarOccurrences';

const RRULE_DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const SKIP_SAFETY_CAP = 50_000;
const DEFAULT_RANGE_CAP = 500;
const HOURLY_RANGE_CAP = 2000;
const MINUTELY_RANGE_CAP = 200;

/** Parse an RRULE string into its parts. */
export function parseRrule(rrule: string): Record<string, string> {
  const raw = rrule.replace(/^RRULE:/, '');
  const parts: Record<string, string> = {};
  for (const seg of raw.split(';')) {
    const [key, val] = seg.split('=');
    if (key && val) parts[key] = val;
  }
  return parts;
}

export function parseUntilDate(until: string): Date {
  const y = parseInt(until.slice(0, 4), 10);
  const m = parseInt(until.slice(4, 6), 10) - 1;
  const d = parseInt(until.slice(6, 8), 10);
  if (until.length > 8) {
    const h = parseInt(until.slice(9, 11), 10) || 23;
    const min = parseInt(until.slice(11, 13), 10) || 59;
    const s = parseInt(until.slice(13, 15), 10) || 59;
    return new Date(Date.UTC(y, m, d, h, min, s));
  }
  return new Date(y, m, d, 23, 59, 59);
}

function advanceOccurrence(current: Date, freq: string, interval: number): Date {
  switch (freq) {
    case 'MINUTELY':
      return new Date(current.getTime() + interval * 60 * 1000);
    case 'HOURLY':
      return new Date(current.getTime() + interval * 60 * 60 * 1000);
    case 'DAILY': {
      const next = new Date(current.getTime());
      next.setUTCDate(next.getUTCDate() + interval);
      return next;
    }
    case 'WEEKLY': {
      const next = new Date(current.getTime());
      next.setUTCDate(next.getUTCDate() + 7 * interval);
      return next;
    }
    case 'MONTHLY': {
      const next = new Date(current.getTime());
      next.setUTCMonth(next.getUTCMonth() + interval);
      return next;
    }
    case 'YEARLY': {
      const next = new Date(current.getTime());
      next.setUTCFullYear(next.getUTCFullYear() + interval);
      return next;
    }
    default:
      return current;
  }
}

function maxOccurrencesInRange(freq: string, rangeStart: Date, rangeEnd: Date): number {
  if (freq === 'MINUTELY') {
    const minutes = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 60_000) + 1;
    return Math.min(MINUTELY_RANGE_CAP, Math.max(minutes, 60));
  }
  if (freq === 'HOURLY') {
    const hours = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 3_600_000) + 1;
    return Math.min(HOURLY_RANGE_CAP, Math.max(hours, 24));
  }
  return DEFAULT_RANGE_CAP;
}

/**
 * Expand a single recurring event into occurrences within [rangeStart, rangeEnd].
 * Fast-forwards past occurrences before the visible range; caps emitted count per range.
 */
export function expandRecurrence(
  event: AgentCalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): AgentCalendarEvent[] {
  if (!event.recurrence || event.recurrence.length === 0) return [event];

  const rule = event.recurrence.find(r => r.startsWith('RRULE:'));
  if (!rule) return [event];

  const parsed = parseRrule(rule);
  const freq = parsed.FREQ;
  if (!freq) return [event];

  const interval = parseInt(parsed.INTERVAL || '1', 10) || 1;
  const count = parsed.COUNT ? parseInt(parsed.COUNT, 10) : undefined;
  const until = parsed.UNTIL ? parseUntilDate(parsed.UNTIL) : undefined;
  const byDay = parsed.BYDAY ? parsed.BYDAY.split(',') : undefined;

  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  const duration = eventEnd.getTime() - eventStart.getTime();

  let current = new Date(eventStart);
  let totalGenerated = 0;
  let emittedInRange = 0;
  const rangeCap = maxOccurrencesInRange(freq, rangeStart, rangeEnd);

  // Fast-forward to first occurrence at or after rangeStart
  let skipSteps = 0;
  while (current < rangeStart && skipSteps < SKIP_SAFETY_CAP) {
    if (until && current > until) return [event];
    if (count !== undefined && totalGenerated >= count) return [event];
    current = advanceOccurrence(current, freq, interval);
    totalGenerated++;
    skipSteps++;
  }

  const occurrences: AgentCalendarEvent[] = [];

  let emitSteps = 0;
  while (emittedInRange < rangeCap && emitSteps < SKIP_SAFETY_CAP) {
    if (until && current > until) break;
    if (count !== undefined && totalGenerated >= count) break;
    if (current > rangeEnd) break;

    const occEnd = new Date(current.getTime() + duration);

    if (occEnd >= rangeStart) {
      if (freq === 'WEEKLY' && byDay && byDay.length > 0) {
        const weekStart = new Date(current.getTime());
        weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
        for (const dayStr of byDay) {
          const targetDay = RRULE_DAY_MAP[dayStr];
          if (targetDay === undefined) continue;
          const oStart = new Date(weekStart.getTime());
          oStart.setUTCDate(weekStart.getUTCDate() + targetDay);
          if (oStart < eventStart) continue;
          if (oStart < rangeStart || oStart > rangeEnd) continue;
          if (until && oStart > until) continue;
          if (count !== undefined && totalGenerated >= count) break;
          const oEnd = new Date(oStart.getTime() + duration);
          occurrences.push({
            ...event,
            start: oStart.toISOString(),
            end: oEnd.toISOString(),
          });
          emittedInRange++;
          if (emittedInRange >= rangeCap) break;
        }
      } else {
        occurrences.push({
          ...event,
          start: current.toISOString(),
          end: occEnd.toISOString(),
        });
        emittedInRange++;
      }
    }

    totalGenerated++;
    emitSteps++;
    current = advanceOccurrence(current, freq, interval);
  }

  return occurrences.length > 0 ? occurrences : [event];
}

/** Expand all recurring events; dedupe and filter cancelled occurrences. */
export function expandAllRecurrences(
  events: AgentCalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): AgentCalendarEvent[] {
  const result: AgentCalendarEvent[] = [];
  for (const event of events) {
    result.push(...expandRecurrence(event, rangeStart, rangeEnd));
  }
  const seen = new Set<string>();
  const deduped = result.filter(e => {
    const key = `${e.id}:${e.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return filterCancelledOccurrences(deduped);
}
