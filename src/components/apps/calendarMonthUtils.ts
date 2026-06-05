import type { AgentCalendarEvent } from '@/services/api';

export const MAX_MONTH_CELL_PREVIEWS_DESKTOP = 3;
export const MAX_MONTH_CELL_PREVIEWS_MOBILE = 2;

/** Fixed palette size — colors are stable per event.id (recurring series share an id). */
export const CALENDAR_TONE_COUNT = 8;

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Events overlapping a calendar day (all-day range + timed same-day / spanning). */
export function getEventsForCalendarDay(date: Date, events: AgentCalendarEvent[]): AgentCalendarEvent[] {
  return events.filter((e) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    if (e.allDay) {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      return start < dayEnd && end > dayStart;
    }
    return isSameCalendarDay(start, date) || (start <= date && end >= date);
  });
}

export function sortEventsForDayCell(events: AgentCalendarEvent[]): AgentCalendarEvent[] {
  const allDay = events.filter((e) => e.allDay);
  const timed = events.filter((e) => !e.allDay);
  allDay.sort((a, b) => a.summary.localeCompare(b.summary));
  timed.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return [...allDay, ...timed];
}

export function getMonthCellPreviewLimit(isMobile: boolean): number {
  return isMobile ? MAX_MONTH_CELL_PREVIEWS_MOBILE : MAX_MONTH_CELL_PREVIEWS_DESKTOP;
}

export interface MonthCellPreviewSlice {
  previews: AgentCalendarEvent[];
  overflowCount: number;
}

export function sliceMonthCellPreviews(
  sortedEvents: AgentCalendarEvent[],
  maxPreviews: number,
): MonthCellPreviewSlice {
  if (sortedEvents.length <= maxPreviews) {
    return { previews: sortedEvents, overflowCount: 0 };
  }
  return {
    previews: sortedEvents.slice(0, maxPreviews),
    overflowCount: sortedEvents.length - maxPreviews,
  };
}

/** Stable tone class per event series (recurring occurrences share id). */
export function getEventAccentIndex(event: AgentCalendarEvent): number {
  let hash = 0;
  for (let i = 0; i < event.id.length; i++) {
    hash = (hash * 31 + event.id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % CALENDAR_TONE_COUNT;
}

/** CSS tone class — stable per event id via index.css calendar-event-tone-* */
export function getEventToneClass(event: AgentCalendarEvent, completed: boolean): string {
  if (completed) return 'calendar-event-tone-completed';
  return `calendar-event-tone-${getEventAccentIndex(event)}`;
}

export function formatPreviewTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return dateStr;
  }
}

/** Sidebar/list primary time line for a single occurrence. */
export function formatEventSidebarTime(event: AgentCalendarEvent): string {
  if (event.allDay) return 'All day';
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (isSameCalendarDay(start, end)) {
    return `${formatPreviewTime(event.start)} – ${formatPreviewTime(event.end)}`;
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatPreviewTime(event.start)} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatPreviewTime(event.end)}`;
}

const RECURRENCE_FREQ_LABELS: Record<string, string> = {
  HOURLY: 'Hourly',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

export function formatRecurrenceLabel(recurrence: string[] | null): string | null {
  if (!recurrence?.length) return null;
  const rule = recurrence.find((r) => r.startsWith('RRULE:'));
  if (!rule) return 'Recurring';
  const freqMatch = rule.match(/FREQ=([A-Z]+)/);
  const freq = freqMatch?.[1];
  if (freq === 'MINUTELY') {
    const interval = rule.match(/INTERVAL=(\d+)/)?.[1];
    if (interval && interval !== '1') return `Every ${interval} minutes`;
    return 'Every minute';
  }
  if (freq && RECURRENCE_FREQ_LABELS[freq]) return RECURRENCE_FREQ_LABELS[freq];
  return 'Recurring';
}
