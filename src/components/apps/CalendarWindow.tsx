import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
  Clock,
  MapPin,
  Repeat,
  CalendarDays,
  AlertCircle,
  X,
  Check,
  MessageCircle,
  Hash,
  Monitor,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input, Label, Separator, Select } from '@/components/ui';
import {
  listAgentCalendarEvents,
  createAgentCalendarEvent,
  updateAgentCalendarEvent,
  deleteAgentCalendarEvent,
  type AgentCalendarEvent,
} from '@/services/api';
import type { WindowConfig } from '@/types';
import { useIsMobile } from '@/hooks/useIsMobile';

// ── Helpers ──

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return dateStr;
  }
}

function formatDateRange(event: AgentCalendarEvent): string {
  if (event.allDay) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (isSameDay(start, end) || (end.getTime() - start.getTime() <= 86400000)) {
      return start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (isSameDay(start, end)) {
    return `${formatTime(event.start)} - ${formatTime(event.end)}`;
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatTime(event.start)} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatTime(event.end)}`;
}

// ── RRULE Expansion ──

const RRULE_DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Parse an RRULE string into its parts.
 * Handles: FREQ, INTERVAL, BYDAY, COUNT, UNTIL, BYHOUR
 */
function parseRrule(rrule: string): Record<string, string> {
  const raw = rrule.replace(/^RRULE:/, '');
  const parts: Record<string, string> = {};
  for (const seg of raw.split(';')) {
    const [key, val] = seg.split('=');
    if (key && val) parts[key] = val;
  }
  return parts;
}

/**
 * Expand a single recurring event into multiple occurrences within [rangeStart, rangeEnd].
 * Returns the original event (at its original time) plus generated occurrences.
 * Each occurrence is a shallow clone with shifted start/end and a `_recurringParentId` marker.
 */
function expandRecurrence(
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

  const occurrences: AgentCalendarEvent[] = [];
  let current = new Date(eventStart);
  let generated = 0;
  const maxOccurrences = 200; // safety cap

  while (generated < maxOccurrences) {
    // Check UNTIL / COUNT limits
    if (until && current > until) break;
    if (count !== undefined && generated >= count) break;
    // Stop if we're past the visible range
    if (current > rangeEnd) break;

    const occEnd = new Date(current.getTime() + duration);

    // Check if this occurrence overlaps the visible range
    if (occEnd >= rangeStart) {
      if (freq === 'WEEKLY' && byDay && byDay.length > 0) {
        // For BYDAY weekly rules, check each day of the current week
        // `current` is advanced by `interval` weeks; check each byDay within it
        for (const dayStr of byDay) {
          const targetDay = RRULE_DAY_MAP[dayStr];
          if (targetDay === undefined) continue;
          const dayDate = new Date(current);
          const diff = targetDay - dayDate.getDay();
          dayDate.setDate(dayDate.getDate() + (diff < 0 ? diff + 7 : diff));
          // Only if within the same week-window and within range
          if (dayDate >= rangeStart && dayDate <= rangeEnd) {
            if (until && dayDate > until) continue;
            const oStart = new Date(dayDate);
            oStart.setHours(eventStart.getHours(), eventStart.getMinutes(), eventStart.getSeconds());
            const oEnd = new Date(oStart.getTime() + duration);
            occurrences.push({
              ...event,
              start: oStart.toISOString(),
              end: oEnd.toISOString(),
            });
          }
        }
      } else {
        occurrences.push({
          ...event,
          start: current.toISOString(),
          end: occEnd.toISOString(),
        });
      }
    }

    generated++;

    // Advance to next occurrence
    switch (freq) {
      case 'DAILY':
        current = new Date(current);
        current.setDate(current.getDate() + interval);
        break;
      case 'WEEKLY':
        current = new Date(current);
        current.setDate(current.getDate() + 7 * interval);
        break;
      case 'MONTHLY':
        current = new Date(current);
        current.setMonth(current.getMonth() + interval);
        break;
      case 'YEARLY':
        current = new Date(current);
        current.setFullYear(current.getFullYear() + interval);
        break;
      default:
        return occurrences.length > 0 ? occurrences : [event];
    }
  }

  return occurrences.length > 0 ? occurrences : [event];
}

function parseUntilDate(until: string): Date {
  // Format: YYYYMMDD or YYYYMMDDTHHMMSSZ
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

/**
 * Expand all recurring events in a list into their individual occurrences.
 * Non-recurring events are passed through unchanged.
 */
function expandAllRecurrences(
  events: AgentCalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): AgentCalendarEvent[] {
  const result: AgentCalendarEvent[] = [];
  for (const event of events) {
    result.push(...expandRecurrence(event, rangeStart, rangeEnd));
  }
  // Deduplicate by start+id (BYDAY expansion can create duplicates for the original day)
  const seen = new Set<string>();
  return result.filter(e => {
    const key = `${e.id}:${e.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Event colors based on index
const EVENT_COLORS = [
  'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30',
  'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30',
  'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
];

const COMPLETED_COLOR = 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-300 border-neutral-400/20';

/**
 * Check if a specific event occurrence is completed.
 * For non-recurring events: checks status === 'completed'.
 * For recurring events: checks if this occurrence's start is in completedOccurrences.
 */
function isOccurrenceCompleted(event: AgentCalendarEvent): boolean {
  if (event.status === 'completed' && !event.recurrence) return true;
  if (event.completedOccurrences && event.completedOccurrences.includes(event.start)) return true;
  return false;
}

function getEventColor(event: AgentCalendarEvent, idx: number): string {
  if (isOccurrenceCompleted(event)) return COMPLETED_COLOR;
  return EVENT_COLORS[idx % EVENT_COLORS.length];
}

/** Format source info into a human-readable label + icon for display. */
function formatSource(event: AgentCalendarEvent): { label: string; Icon: typeof MessageCircle } | null {
  if (!event.sourceType) return null;
  const meta = event.sourceMeta;
  const username = meta?.username as string | undefined;
  switch (event.sourceType) {
    case 'telegram':
      return { label: username ? `@${username} via Telegram` : 'via Telegram', Icon: MessageCircle };
    case 'slack':
      return { label: username ? `${username} via Slack` : 'via Slack', Icon: Hash };
    case 'chat':
      return { label: 'via Chat', Icon: Monitor };
    case 'self':
      return { label: 'Self-scheduled', Icon: Bot };
    case 'scheduled_task':
      return { label: 'Scheduled task', Icon: Clock };
    default:
      return { label: `via ${event.sourceType}`, Icon: MessageCircle };
  }
}

// ── Types ──

type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type RepeatEndType = 'never' | 'after' | 'on';

interface EventFormData {
  summary: string;
  description: string;
  location: string;
  allDay: boolean;
  startDatetime: string;
  endDatetime: string;
  startDate: string;
  endDate: string;
  // Recurrence (visual)
  repeatType: RepeatType;
  repeatInterval: number;        // e.g. every 2 weeks
  repeatDays: boolean[];          // [Sun, Mon, Tue, Wed, Thu, Fri, Sat] for weekly
  repeatEndType: RepeatEndType;
  repeatCount: number;            // for "after N times"
  repeatUntilDate: string;        // for "on date"
}

const emptyForm = (): EventFormData => {
  const now = new Date();
  const fiveMin = new Date(now.getTime() + 5 * 60000);
  const end = new Date(fiveMin.getTime() + 3600000);
  return {
    summary: '',
    description: '',
    location: '',
    allDay: false,
    startDatetime: toLocalDatetimeString(fiveMin),
    endDatetime: toLocalDatetimeString(end),
    startDate: toLocalDateString(now),
    endDate: toLocalDateString(new Date(now.getTime() + 86400000)),
    repeatType: 'none',
    repeatInterval: 1,
    repeatDays: [false, false, false, false, false, false, false],
    repeatEndType: 'never',
    repeatCount: 10,
    repeatUntilDate: toLocalDateString(new Date(now.getTime() + 30 * 86400000)),
  };
};

/** Build an RRULE string from the visual form fields. Returns undefined if no repeat. */
function buildRrule(form: EventFormData): string[] | undefined {
  if (form.repeatType === 'none') return undefined;

  const freqMap: Record<string, string> = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
    yearly: 'YEARLY',
    custom: 'WEEKLY', // custom = weekly with specific days
  };

  const parts: string[] = [`FREQ=${freqMap[form.repeatType]}`];

  if (form.repeatInterval > 1) {
    parts.push(`INTERVAL=${form.repeatInterval}`);
  }

  // Day-of-week for weekly/custom
  if (form.repeatType === 'weekly' || form.repeatType === 'custom') {
    const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const selected = form.repeatDays
      .map((on, i) => on ? dayNames[i] : null)
      .filter(Boolean);
    if (selected.length > 0) {
      parts.push(`BYDAY=${selected.join(',')}`);
    }
  }

  if (form.repeatEndType === 'after' && form.repeatCount > 0) {
    parts.push(`COUNT=${form.repeatCount}`);
  } else if (form.repeatEndType === 'on' && form.repeatUntilDate) {
    // UNTIL needs a date in YYYYMMDD format
    parts.push(`UNTIL=${form.repeatUntilDate.replace(/-/g, '')}T235959Z`);
  }

  return [`RRULE:${parts.join(';')}`];
}

// ── Components ──

interface CalendarWindowProps {
  config: WindowConfig;
}

export function CalendarWindow({ config: _config }: CalendarWindowProps) {
  const isMobile = useIsMobile();
  const [events, setEvents] = useState<AgentCalendarEvent[]>([]);
  const rawEventsRef = useRef<AgentCalendarEvent[]>([]); // unexpanded originals
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [view, setView] = useState<'month' | 'list'>('month');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AgentCalendarEvent | null>(null);
  const [form, setForm] = useState<EventFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; summary: string } | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const monthStart = startOfMonth(currentMonth);
      // Fetch a wider range to catch multi-day events and recurrence seeds
      const rangeStart = new Date(monthStart);
      rangeStart.setDate(rangeStart.getDate() - 7);
      const monthEnd = endOfMonth(currentMonth);
      const rangeEnd = new Date(monthEnd);
      rangeEnd.setDate(rangeEnd.getDate() + 7);

      // For recurring events, we need to fetch events that started BEFORE
      // this month too (a daily event created last year still shows today).
      // Fetch raw events with a very early timeMin for recurrences, but
      // normal range for non-recurring events.
      const result = await listAgentCalendarEvents({
        maxResults: 200,
      });
      if (result.success) {
        const raw = result.data.events;
        rawEventsRef.current = raw;
        const expanded = expandAllRecurrences(raw, rangeStart, rangeEnd);
        setEvents(expanded);
      } else {
        setError(result.error || 'Failed to load events');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    }
  }, [currentMonth]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchEvents();
      setLoading(false);
    })();
    // Auto-refresh every 10 seconds so calendar stays up-to-date
    // when the agent creates/completes events in the background.
    const interval = setInterval(fetchEvents, 10_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
  };

  const handleNewEvent = (date?: Date) => {
    const d = date || selectedDate;
    const f = emptyForm();
    const now = new Date();
    const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (isToday) {
      const fiveMin = new Date(now.getTime() + 5 * 60000);
      f.startDatetime = toLocalDatetimeString(fiveMin);
      f.endDatetime = toLocalDatetimeString(new Date(fiveMin.getTime() + 3600000));
    } else {
      f.startDatetime = toLocalDatetimeString(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0));
      f.endDatetime = toLocalDatetimeString(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0));
    }
    f.startDate = toLocalDateString(d);
    f.endDate = toLocalDateString(new Date(d.getTime() + 86400000));
    setForm(f);
    setEditingEvent(null);
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleEditEvent = (event: AgentCalendarEvent) => {
    // For recurring events, always edit the original (parent) event, not the occurrence
    const original = rawEventsRef.current.find(e => e.id === event.id) || event;
    const base = emptyForm();
    const f: EventFormData = {
      ...base,
      summary: original.summary,
      description: original.description,
      location: original.location,
      allDay: original.allDay,
      startDatetime: original.allDay ? base.startDatetime : toLocalDatetimeString(new Date(original.start)),
      endDatetime: original.allDay ? base.endDatetime : toLocalDatetimeString(new Date(original.end)),
      startDate: original.allDay ? original.start : base.startDate,
      endDate: original.allDay ? original.end : base.endDate,
    };
    // Parse existing RRULE back into visual fields
    if (original.recurrence && original.recurrence.length > 0) {
      const rule = original.recurrence[0].replace('RRULE:', '');
      const parts = Object.fromEntries(rule.split(';').map(p => { const [k, v] = p.split('='); return [k, v]; }));
      const freq = parts.FREQ?.toLowerCase();
      if (freq === 'daily') f.repeatType = 'daily';
      else if (freq === 'monthly') f.repeatType = 'monthly';
      else if (freq === 'yearly') f.repeatType = 'yearly';
      else if (freq === 'weekly' && parts.BYDAY) f.repeatType = 'custom';
      else if (freq === 'weekly') f.repeatType = 'weekly';
      if (parts.INTERVAL) f.repeatInterval = parseInt(parts.INTERVAL, 10) || 1;
      if (parts.BYDAY) {
        const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        const days = [false, false, false, false, false, false, false];
        parts.BYDAY.split(',').forEach(d => { if (dayMap[d] !== undefined) days[dayMap[d]] = true; });
        f.repeatDays = days;
      }
      if (parts.COUNT) { f.repeatEndType = 'after'; f.repeatCount = parseInt(parts.COUNT, 10) || 10; }
      else if (parts.UNTIL) {
        f.repeatEndType = 'on';
        const u = parts.UNTIL.replace(/T.*$/, '');
        f.repeatUntilDate = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
      }
    }
    setForm(f);
    setEditingEvent(original);
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.summary.trim()) return;

    setSaveError(null);

    // Client-side validation: end cannot be before start
    if (form.allDay) {
      if (form.endDate < form.startDate) {
        setSaveError('End date cannot be before start date');
        return;
      }
    } else {
      const s = new Date(form.startDatetime).getTime();
      const e = new Date(form.endDatetime).getTime();
      if (e < s) {
        setSaveError('End time cannot be before start time');
        return;
      }
    }

    setSaving(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const recurrence = buildRrule(form);

      let result;
      if (editingEvent) {
        // Update
        const updates: Record<string, unknown> = {
          summary: form.summary,
          description: form.description || undefined,
          location: form.location || undefined,
          time_zone: tz,
        };
        if (form.allDay) {
          updates.start_date = form.startDate;
          updates.end_date = form.endDate;
        } else {
          updates.start_datetime = new Date(form.startDatetime).toISOString();
          updates.end_datetime = new Date(form.endDatetime).toISOString();
        }
        result = await updateAgentCalendarEvent(editingEvent.id, updates as Parameters<typeof updateAgentCalendarEvent>[1]);
      } else {
        // Create
        const params: Parameters<typeof createAgentCalendarEvent>[0] = {
          summary: form.summary,
          description: form.description || undefined,
          location: form.location || undefined,
          time_zone: tz,
          recurrence,
        };
        if (form.allDay) {
          params.all_day = true;
          params.start_date = form.startDate;
          params.end_date = form.endDate;
        } else {
          params.start_datetime = new Date(form.startDatetime).toISOString();
          params.end_datetime = new Date(form.endDatetime).toISOString();
        }
        result = await createAgentCalendarEvent(params);
      }
      if (!result.success) {
        setSaveError(result.error || 'Save failed');
        return;
      }
      setDialogOpen(false);
      await fetchEvents();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    setConfirmDelete({ id: eventId, summary: events.find(e => e.id === eventId)?.summary || 'this event' });
  };

  const executeDelete = async (eventId: string) => {
    setConfirmDelete(null);
    setDeleting(eventId);
    try {
      await deleteAgentCalendarEvent(eventId);
      await fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  // Get events for a given day
  const getEventsForDay = (date: Date): AgentCalendarEvent[] => {
    return events.filter(e => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      // For all-day events, end is exclusive
      if (e.allDay) {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        return start < dayEnd && end > dayStart;
      }
      return isSameDay(start, date) || (start <= date && end >= date);
    });
  };

  const selectedDayEvents = getEventsForDay(selectedDate);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] select-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        <Button variant="ghost" size="sm" onClick={handleToday} className="text-xs">
          Today
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[110px] sm:min-w-[140px] text-center">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={handleNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 min-w-0" />
        <div className="flex items-center gap-1 bg-[var(--color-surface)] rounded-md border border-[var(--color-border)] p-0.5">
          <button
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors min-h-[28px]',
              view === 'month' ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-accent-muted)]'
            )}
            onClick={() => setView('month')}
          >
            Month
          </button>
          <button
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors min-h-[28px]',
              view === 'list' ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-accent-muted)]'
            )}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={fetchEvents} title="Refresh">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
        <Button variant="primary" size="sm" onClick={() => handleNewEvent()} className="text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />
          {isMobile ? 'New' : 'New Event'}
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : view === 'month' ? (
        <div className={`flex ${isMobile ? 'flex-col' : ''} flex-1 overflow-hidden`}>
          {/* Month grid */}
          <div className={`flex-1 flex flex-col min-w-0 ${isMobile ? 'max-h-[60%]' : ''} overflow-y-auto`}>
            <MonthGrid
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              events={events}
              onDateClick={handleDateClick}
              onDateDoubleClick={handleNewEvent}
            />
          </div>

          {/* Day detail sidebar */}
          <div className={`${isMobile ? 'w-full border-t flex-1' : 'w-[220px] border-l'} border-[var(--color-border)] flex flex-col min-h-0 overflow-hidden`}>
            <div className="px-3 py-2 border-b border-[var(--color-border)]">
              <div className="text-xs text-[var(--color-text-muted)]">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
              </div>
              <div className="text-lg font-semibold">
                {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {selectedDayEvents.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] text-center py-4">
                  No events
                </p>
              ) : (
                selectedDayEvents.map((event, idx) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    colorClass={getEventColor(event, idx)}
                    onEdit={() => handleEditEvent(event)}
                    onDelete={() => handleDelete(event.id)}
                    isDeleting={deleting === event.id}
                  />
                ))
              )}
            </div>
            <div className="p-2 border-t border-[var(--color-border)]">
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => handleNewEvent()}>
                <Plus className="w-3 h-3 mr-1" />
                Add event
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* List view */
        <EventListView
          events={events}
          onEdit={handleEditEvent}
          onDelete={handleDelete}
          deleting={deleting}
          onNew={() => handleNewEvent()}
        />
      )}

      {/* Create/Edit Dialog */}
      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        saving={saving}
        isEdit={!!editingEvent}
        error={saveError}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Event"
        message={`Are you sure you want to delete "${confirmDelete?.summary}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDelete && executeDelete(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ── Month Grid ──

function MonthGrid({
  currentMonth,
  selectedDate,
  events,
  onDateClick,
  onDateDoubleClick,
}: {
  currentMonth: Date;
  selectedDate: Date;
  events: AgentCalendarEvent[];
  onDateClick: (d: Date) => void;
  onDateDoubleClick: (d: Date) => void;
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Build calendar grid cells
  const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];

  // Previous month padding
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }

  // Next month padding (fill to 6 rows)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }

  // Get event dots for a day
  const getEventDots = (date: Date): AgentCalendarEvent[] => {
    return events.filter(e => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      if (e.allDay) {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        return start < dayEnd && end > dayStart;
      }
      return isSameDay(start, date);
    });
  };

  return (
    <div className="flex flex-col flex-1 p-2">
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-[var(--color-text-muted)] py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 flex-1 gap-px">
        {cells.map(({ date, isCurrentMonth }, i) => {
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const dayEvents = getEventDots(date);

          return (
            <button
              key={i}
              className={cn(
                'relative flex flex-col items-center pt-0.5 rounded-md transition-colors min-h-[48px]',
                'hover:bg-[var(--color-accent-muted)]',
                !isCurrentMonth && 'opacity-30',
                isSelected && 'bg-[var(--color-accent-muted)] ring-1 ring-[var(--color-accent)]',
              )}
              onClick={() => onDateClick(date)}
              onDoubleClick={() => onDateDoubleClick(date)}
            >
              <span
                className={cn(
                  'text-xs w-6 h-6 flex items-center justify-center rounded-full',
                  isToday && 'bg-[var(--color-accent)] text-white font-bold',
                )}
              >
                {date.getDate()}
              </span>
              {/* Event dots */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-full px-0.5">
                  {dayEvents.slice(0, 3).map((evt, idx) => {
                    const dotColors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500'];
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'w-1 h-1 rounded-full',
                          isOccurrenceCompleted(evt) ? 'bg-neutral-400 dark:bg-neutral-600' : dotColors[idx],
                        )}
                      />
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] text-[var(--color-text-muted)]">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Card (sidebar) ──

function EventCard({
  event,
  colorClass,
  onEdit,
  onDelete,
  isDeleting,
}: {
  event: AgentCalendarEvent;
  colorClass: string;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isCompleted = isOccurrenceCompleted(event);

  return (
    <div className={cn('rounded-md border p-2 text-xs group', colorClass)}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          {isCompleted && <Check className="w-3 h-3 shrink-0 text-neutral-400" />}
          <span className={cn('font-medium truncate', isCompleted && 'line-through')}>{event.summary}</span>
        </div>
        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10" onClick={onEdit}>
            <Pencil className="w-3 h-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-red-500/20 text-red-600 dark:text-red-400"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-1 text-[10px] opacity-80">
        <Clock className="w-2.5 h-2.5" />
        <span>{event.allDay ? 'All day' : formatDateRange(event)}</span>
      </div>
      {event.location && (
        <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-80">
          <MapPin className="w-2.5 h-2.5" />
          <span className="truncate">{event.location}</span>
        </div>
      )}
      {event.recurrence && (
        <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-80">
          <Repeat className="w-2.5 h-2.5" />
          <span>Recurring</span>
        </div>
      )}
      {(() => {
        const source = formatSource(event);
        if (!source) return null;
        const { label, Icon } = source;
        return (
          <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-70">
            <Icon className="w-2.5 h-2.5" />
            <span className="truncate">{label}</span>
          </div>
        );
      })()}
      {isCompleted && (
        <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-60">
          <Check className="w-2.5 h-2.5" />
          <span>Done</span>
        </div>
      )}
    </div>
  );
}

// ── Event List View ──

function EventListView({
  events,
  onEdit,
  onDelete,
  deleting,
  onNew,
}: {
  events: AgentCalendarEvent[];
  onEdit: (e: AgentCalendarEvent) => void;
  onDelete: (id: string) => void;
  deleting: string | null;
  onNew: () => void;
}) {
  // Group events by date
  const grouped = new Map<string, AgentCalendarEvent[]>();
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  for (const event of sorted) {
    const dateKey = new Date(event.start).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(event);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
          <CalendarDays className="w-10 h-10 opacity-40" />
          <p className="text-sm">No events this month</p>
          <Button variant="primary" size="sm" onClick={onNew} className="text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Create Event
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from(grouped).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-titlebar)] sticky top-0">
                {dateLabel}
              </div>
              <div className="divide-y divide-[var(--color-border)]/50">
                {dayEvents.map((event, idx) => {
                  const isCompleted = isOccurrenceCompleted(event);
                  return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-accent-muted)] transition-colors group"
                  >
                    <div className={cn('w-1 h-8 rounded-full shrink-0', getEventColor(event, idx).split(' ')[0])} />
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm font-medium truncate flex items-center gap-1.5', isCompleted && 'text-neutral-600 dark:text-neutral-300')}>
                        {isCompleted && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span className={cn(isCompleted && 'line-through')}>{event.summary}</span>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-2">
                        <span>{event.allDay ? 'All day' : formatDateRange(event)}</span>
                        {event.recurrence && (
                          <span className="flex items-center gap-0.5">
                            <Repeat className="w-2.5 h-2.5" /> Recurring
                          </span>
                        )}
                        {(() => {
                          const source = formatSource(event);
                          if (!source) return null;
                          const { label, Icon } = source;
                          return (
                            <span className="flex items-center gap-0.5 opacity-70">
                              <Icon className="w-2.5 h-2.5" /> {label}
                            </span>
                          );
                        })()}
                        {isCompleted && (
                          <span className="flex items-center gap-0.5 text-neutral-500 dark:text-neutral-400">
                            <Check className="w-2.5 h-2.5" /> Done
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(event)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDelete(event.id)}
                        disabled={deleting === event.id}
                        className="text-red-500 hover:text-red-600"
                      >
                        {deleting === event.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Event Create/Edit Dialog ──

function EventDialog({
  open,
  onClose,
  form,
  setForm,
  onSave,
  saving,
  isEdit,
  error,
}: {
  open: boolean;
  onClose: () => void;
  form: EventFormData;
  setForm: (f: EventFormData) => void;
  onSave: () => void;
  saving: boolean;
  isEdit: boolean;
  error: string | null;
}) {
  const update = (patch: Partial<EventFormData>) => setForm({ ...form, ...patch });
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    // Overlay contained inside the calendar window (absolute, not fixed)
    <div
      ref={overlayRef}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-b-xl"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-[#f5f3f1] dark:bg-[#1e1c1b]
                      border border-black/10 dark:border-white/15 rounded-xl
                      shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]
                      w-[96%] max-w-[620px] max-h-[92%] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-black/10 dark:border-white/10 select-none">
          <span className="text-sm font-medium">{isEdit ? 'Edit Event' : 'New Event'}</span>
          <Button variant="ghost" size="icon-sm" onClick={onClose}
                  className="hover:bg-[var(--color-error)] hover:text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: Event details */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-w-0">
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={form.summary}
                onChange={(e) => update({ summary: e.target.value })}
                placeholder="Event title"
                className="mt-1"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Optional description..."
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-black/10 dark:border-white/10
                           bg-black/5 dark:bg-white/5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]
                           resize-none"
                rows={2}
              />
            </div>

            <div>
              <Label className="text-xs">Location</Label>
              <Input
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="Optional location"
                className="mt-1"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-black/10 dark:bg-white/10" />

          {/* Right: When & Repeat */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-w-0">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allDay"
                checked={form.allDay}
                onChange={(e) => update({ allDay: e.target.checked })}
                className="rounded border-[var(--color-border)]"
              />
              <Label htmlFor="allDay" className="text-xs cursor-pointer">All day event</Label>
            </div>

            {form.allDay ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Start date</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => update({ startDate: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">End date</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => update({ endDate: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Start</Label>
                  <Input
                    type="datetime-local"
                    value={form.startDatetime}
                    onChange={(e) => update({ startDatetime: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">End</Label>
                  <Input
                    type="datetime-local"
                    value={form.endDatetime}
                    onChange={(e) => update({ endDatetime: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <Separator />

            {/* Repeat / Recurrence */}
            <div className="space-y-2">
              <Label className="text-xs">Repeat</Label>
              <Select
                value={form.repeatType}
                onChange={(v) => update({ repeatType: v as RepeatType })}
                options={[
                  { value: 'none', label: 'Does not repeat' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                  { value: 'custom', label: 'Custom...' },
                ]}
              />

              {form.repeatType !== 'none' && (
                <div className="space-y-2.5">
                  {/* Interval */}
                  {(form.repeatType === 'custom' || form.repeatInterval > 1) && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--color-text-muted)]">Every</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={form.repeatInterval}
                        onChange={(e) => update({ repeatInterval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-[4.5rem] pl-2 pr-5 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {form.repeatType === 'daily' ? 'day(s)' :
                         form.repeatType === 'monthly' ? 'month(s)' :
                         form.repeatType === 'yearly' ? 'year(s)' : 'week(s)'}
                      </span>
                    </div>
                  )}

                  {/* Day picker for weekly / custom */}
                  {(form.repeatType === 'weekly' || form.repeatType === 'custom') && (
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">On</span>
                      <div className="flex gap-1 mt-1">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => (
                          <button
                            key={i}
                            type="button"
                            className={cn(
                              'w-7 h-7 rounded-full text-xs font-medium transition-colors',
                              form.repeatDays[i]
                                ? 'bg-[var(--color-accent)] text-white'
                                : 'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15'
                            )}
                            onClick={() => {
                              const days = [...form.repeatDays];
                              days[i] = !days[i];
                              update({ repeatDays: days });
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* End condition */}
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)]">Ends</span>
                    <div className="space-y-1.5 mt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="repeatEnd" checked={form.repeatEndType === 'never'}
                          onChange={() => update({ repeatEndType: 'never' })} className="accent-[var(--color-accent)]" />
                        <span className="text-xs">Never</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="repeatEnd" checked={form.repeatEndType === 'after'}
                          onChange={() => update({ repeatEndType: 'after' })} className="accent-[var(--color-accent)]" />
                        <span className="text-xs">After</span>
                        <Input type="number" min={1} max={999} value={form.repeatCount}
                          onChange={(e) => update({ repeatCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          className="w-[4.5rem] pl-2 pr-5 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          disabled={form.repeatEndType !== 'after'} />
                        <span className="text-xs">time(s)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="repeatEnd" checked={form.repeatEndType === 'on'}
                          onChange={() => update({ repeatEndType: 'on' })} className="accent-[var(--color-accent)]" />
                        <span className="text-xs shrink-0">On</span>
                        <Input type="date" value={form.repeatUntilDate}
                          onChange={(e) => update({ repeatUntilDate: e.target.value })}
                          className="flex-1" disabled={form.repeatEndType !== 'on'} />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-t border-red-500/20 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-black/10 dark:border-white/10">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={saving || !form.summary.trim()}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            {isEdit ? 'Save Changes' : 'Create Event'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Dialog (macOS-style) ──

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-b-xl"
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div className="bg-[#f5f3f1] dark:bg-[#2a2827]
                      border border-black/10 dark:border-white/15 rounded-xl
                      shadow-[0_8px_24px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)]
                      w-[280px] overflow-hidden">
        <div className="px-5 pt-5 pb-4 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-sm font-semibold mb-1">{title}</h3>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{message}</p>
        </div>
        <div className="flex border-t border-black/10 dark:border-white/10">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-xs font-medium text-[var(--color-text-secondary)]
                       hover:bg-black/5 dark:hover:bg-white/5 transition-colors
                       border-r border-black/10 dark:border-white/10"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'flex-1 py-2.5 text-xs font-semibold transition-colors',
              destructive
                ? 'text-red-500 hover:bg-red-500/10'
                : 'text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
