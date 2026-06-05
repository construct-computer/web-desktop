import type { AgentCalendarEvent } from '@/services/api';
import { listAgentCalendarEvents } from '@/services/api';
import { expandAllRecurrences } from '@/lib/calendarRecurrence';

const UPCOMING_WINDOW_MS = 7 * 86_400_000;

/** Pick the next future occurrence from raw calendar rows (expanded + cancelled filtered). */
export function pickNextUpcomingEvent(
  rawEvents: AgentCalendarEvent[],
  now: Date = new Date(),
  windowMs = UPCOMING_WINDOW_MS,
): AgentCalendarEvent | null {
  const rangeEnd = new Date(now.getTime() + windowMs);
  const expanded = expandAllRecurrences(rawEvents, now, rangeEnd);
  const nowMs = now.getTime();
  return expanded
    .filter((event) => new Date(event.start).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ?? null;
}

export async function fetchNextUpcomingCalendarEvent(): Promise<AgentCalendarEvent | null> {
  const result = await listAgentCalendarEvents({ maxResults: 200 });
  if (!result.success) return null;
  return pickNextUpcomingEvent(result.data.events);
}
