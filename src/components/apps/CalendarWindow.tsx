import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Loader2,
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
import { Button, ConfirmDialog, FreshnessText, Input, Label, RefreshButton, Select, StatusBanner } from '@/components/ui';
import { useFreshness } from '@/hooks/useFreshness';
import { useDelayUnmount } from '@/hooks/useDelayUnmount';
import {
  listAgentCalendarEvents,
  createAgentCalendarEvent,
  updateAgentCalendarEvent,
  deleteAgentCalendarEvent,
  completeAgentCalendarOccurrence,
  uncompleteAgentCalendarOccurrence,
  type AgentCalendarEvent,
} from '@/services/api';
import { occurrenceArrayIncludes } from '@/lib/calendarOccurrences';
import { expandAllRecurrences } from '@/lib/calendarRecurrence';
import { AGENT_CALENDAR_REFRESH_EVENT, dispatchAgentCalendarRefresh } from '@/lib/agentUiEvents';
import type { WindowConfig } from '@/types';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  formatEventSidebarTime,
  formatPreviewTime,
  formatRecurrenceLabel,
  getEventToneClass,
  getEventsForCalendarDay,
  getMonthCellPreviewLimit,
  sliceMonthCellPreviews,
  sortEventsForDayCell,
} from './calendarMonthUtils';

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

function eventActionKey(event: Pick<AgentCalendarEvent, 'id' | 'start'>): string {
  return `${event.id}:${event.start}`;
}

type DeleteConfirmTarget = {
  seriesId: string;
  occurrenceStart: string;
  summary: string;
  isRecurring: boolean;
};

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

/**
 * Check if a specific event occurrence is completed.
 * For non-recurring events: checks status === 'completed'.
 * For recurring events: checks if this occurrence's start is in completedOccurrences.
 */
function isOccurrenceCompleted(event: AgentCalendarEvent): boolean {
  if (isRecurringEvent(event)) {
    return occurrenceArrayIncludes(event.completedOccurrences, event.start);
  }
  return event.status === 'completed';
}

function isRecurringEvent(event: AgentCalendarEvent): boolean {
  return !!(event.recurrence && event.recurrence.length > 0);
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

type RepeatType = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
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

/** Populate repeat fields from stored recurrence rules (array or legacy string). */
function applyRecurrenceToForm(form: EventFormData, recurrence: string[] | string | null | undefined): void {
  const rules = Array.isArray(recurrence)
    ? recurrence
    : typeof recurrence === 'string' && recurrence.trim()
      ? [recurrence.trim()]
      : [];
  if (rules.length === 0) return;

  const rule = rules[0].replace(/^RRULE:/i, '');
  const parts = Object.fromEntries(rule.split(';').map(p => { const [k, v] = p.split('='); return [k, v]; }));
  const freq = parts.FREQ?.toLowerCase();
  if (freq === 'hourly') form.repeatType = 'hourly';
  else if (freq === 'daily') form.repeatType = 'daily';
  else if (freq === 'monthly') form.repeatType = 'monthly';
  else if (freq === 'yearly') form.repeatType = 'yearly';
  else if (freq === 'weekly' && parts.BYDAY) form.repeatType = 'custom';
  else if (freq === 'weekly') form.repeatType = 'weekly';
  if (parts.INTERVAL) form.repeatInterval = parseInt(parts.INTERVAL, 10) || 1;
  if (parts.BYDAY) {
    const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const days = [false, false, false, false, false, false, false];
    parts.BYDAY.split(',').forEach(d => { if (dayMap[d] !== undefined) days[dayMap[d]] = true; });
    form.repeatDays = days;
  }
  if (parts.COUNT) { form.repeatEndType = 'after'; form.repeatCount = parseInt(parts.COUNT, 10) || 10; }
  else if (parts.UNTIL) {
    form.repeatEndType = 'on';
    const u = parts.UNTIL.replace(/T.*$/, '');
    form.repeatUntilDate = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
  }
}

/** Build an RRULE string from the visual form fields. Returns undefined if no repeat. */
function buildRrule(form: EventFormData): string[] | undefined {
  if (form.repeatType === 'none') return undefined;

  const freqMap: Record<string, string> = {
    hourly: 'HOURLY',
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

export function CalendarWindow(props: CalendarWindowProps) {
  void props;
  const isMobile = useIsMobile();
  const [events, setEvents] = useState<AgentCalendarEvent[]>([]);
  const rawEventsRef = useRef<AgentCalendarEvent[]>([]); // unexpanded originals
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [view, setView] = useState<'month' | 'list'>('month');
  const calendarRequestSeqRef = useRef(0);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AgentCalendarEvent | null>(null);
  const [form, setForm] = useState<EventFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeleteConfirmTarget | null>(null);

  const fetchEvents = useCallback(async () => {
    const requestSeq = ++calendarRequestSeqRef.current;
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
      if (requestSeq !== calendarRequestSeqRef.current) return;
      if (result.success) {
        const raw = result.data.events;
        rawEventsRef.current = raw;
        const expanded = expandAllRecurrences(raw, rangeStart, rangeEnd);
        setEvents(expanded);
      } else {
        setError(result.error || 'Failed to load events');
      }
    } catch (err) {
      if (requestSeq !== calendarRequestSeqRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load events');
    }
  }, [currentMonth]);

  const calendarFreshness = useFreshness(fetchEvents, {
    intervalMs: 10_000,
    staleMs: 25_000,
    refreshOnFocus: true,
    refreshOnOnline: true,
  });
  const { refreshNow } = calendarFreshness;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await refreshNow({ force: true });
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshNow, currentMonth]);

  // Live refresh when calendar data changes (scheduled task completion, local edits).
  useEffect(() => {
    const handler = () => { void refreshNow({ force: true }); };
    window.addEventListener(AGENT_CALENDAR_REFRESH_EVENT, handler);
    return () => { window.removeEventListener(AGENT_CALENDAR_REFRESH_EVENT, handler); };
  }, [refreshNow]);

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
    applyRecurrenceToForm(f, original.recurrence);
    if (f.repeatType === 'none') {
      const meta = original.sourceMeta as { recurrenceRule?: string; recurrence_rule?: string } | null | undefined;
      const ruleFromMeta = meta?.recurrenceRule || meta?.recurrence_rule;
      if (ruleFromMeta) {
        applyRecurrenceToForm(f, [ruleFromMeta.startsWith('RRULE:') ? ruleFromMeta : `RRULE:${ruleFromMeta}`]);
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
          all_day: form.allDay,
          recurrence: recurrence || null,
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
      dispatchAgentCalendarRefresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (event: AgentCalendarEvent) => {
    setConfirmDelete({
      seriesId: event.id,
      occurrenceStart: event.start,
      summary: event.summary || 'this event',
      isRecurring: isRecurringEvent(event),
    });
  };

  const executeDelete = async (scope: 'series' | 'occurrence') => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    const actionKey = eventActionKey({ id: target.seriesId, start: target.occurrenceStart });
    setDeleting(actionKey);
    try {
      if (scope === 'occurrence') {
        const result = await deleteAgentCalendarEvent(target.seriesId, {
          scope: 'occurrence',
          occurrenceStart: target.occurrenceStart,
        });
        if (!result.success) throw new Error(result.error || 'Delete failed');
      } else {
        const result = await deleteAgentCalendarEvent(target.seriesId);
        if (!result.success) throw new Error(result.error || 'Delete failed');
      }
      await fetchEvents();
      dispatchAgentCalendarRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleComplete = async (event: AgentCalendarEvent) => {
    const actionKey = eventActionKey(event);
    setCompleting(actionKey);
    try {
      const completed = isOccurrenceCompleted(event);
      const recurring = isRecurringEvent(event);
      if (completed) {
        if (recurring) {
          const result = await uncompleteAgentCalendarOccurrence(event.id, event.start);
          if (!result.success) throw new Error(result.error || 'Failed to update event');
        } else {
          const result = await updateAgentCalendarEvent(event.id, { status: 'confirmed' });
          if (!result.success) throw new Error(result.error || 'Failed to update event');
        }
      } else {
        const result = await completeAgentCalendarOccurrence(event.id, event.start);
        if (!result.success) throw new Error(result.error || 'Failed to update event');
      }
      await fetchEvents();
      dispatchAgentCalendarRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setCompleting(null);
    }
  };

  const getEventsForDay = (date: Date) => getEventsForCalendarDay(date, events);

  const selectedDayEvents = sortEventsForDayCell(getEventsForDay(selectedDate));

  return (
    <div className="calendar-app relative flex flex-col h-full select-none text-[var(--color-text)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] surface-toolbar">
        <Button variant="ghost" size="sm" onClick={handleToday} className="text-xs">
          Today
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm sm:text-base font-medium sm:font-semibold min-w-[110px] sm:min-w-[140px] text-center">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={handleNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 min-w-0" />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 text-xs rounded-md transition-colors min-h-[28px]',
              view === 'month'
                ? 'bg-[var(--color-accent)] text-white font-medium'
                : 'text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
            )}
            onClick={() => setView('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 text-xs rounded-md transition-colors min-h-[28px]',
              view === 'list'
                ? 'bg-[var(--color-accent)] text-white font-medium'
                : 'text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
            )}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
        <div className="hidden items-center text-[10px] text-[var(--color-text-muted)] md:flex">
          <FreshnessText
            lastUpdatedAt={calendarFreshness.lastUpdatedAt}
            now={calendarFreshness.now}
            isRefreshing={calendarFreshness.isRefreshing || loading}
            isStale={calendarFreshness.isStale}
          />
        </div>
        <RefreshButton
          onClick={() => void refreshNow()}
          refreshing={calendarFreshness.isRefreshing || loading}
        />
        <Button variant="primary" size="sm" onClick={() => handleNewEvent()} className="text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />
          {isMobile ? 'New' : 'New Event'}
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <StatusBanner tone="error" action={<button className="text-xs underline" onClick={() => setError(null)}>dismiss</button>}>
          <span className="truncate">{error}</span>
        </StatusBanner>
      )}

      {!error && calendarFreshness.isStale && (
        <StatusBanner
          tone="warning"
          action={<button className="text-xs underline" onClick={() => void calendarFreshness.refreshNow()}>Refresh</button>}
        >
          Calendar may be out of date.
        </StatusBanner>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : view === 'month' ? (
        <div className={`flex ${isMobile ? 'flex-col' : ''} flex-1 overflow-hidden`}>
          {/* Month grid */}
          <div className={`calendar-month-pane flex-1 flex flex-col min-w-0 min-h-0 ${isMobile ? 'max-h-[60%]' : ''} overflow-y-auto`}>
            <MonthGrid
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              events={events}
              isMobile={isMobile}
              onDateClick={handleDateClick}
            />
          </div>

          <DayEventsSidebar
            selectedDate={selectedDate}
            events={selectedDayEvents}
            isMobile={isMobile}
            onEdit={handleEditEvent}
            onDelete={handleDelete}
            onToggleComplete={handleToggleComplete}
            deleting={deleting}
            completing={completing}
          />
        </div>
      ) : (
        /* List view */
        <EventListView
          events={events}
          onEdit={handleEditEvent}
          onDelete={handleDelete}
          onToggleComplete={handleToggleComplete}
          deleting={deleting}
          completing={completing}
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
        isMobile={isMobile}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Event"
        message={
          confirmDelete?.isRecurring
            ? `Remove "${confirmDelete.summary}" from your calendar.`
            : `Are you sure you want to delete "${confirmDelete?.summary}"? This action cannot be undone.`
        }
        confirmLabel={confirmDelete?.isRecurring ? undefined : 'Delete'}
        destructive
        recurringOptions={confirmDelete?.isRecurring ? {
          onDeleteOccurrence: () => void executeDelete('occurrence'),
          onDeleteSeries: () => void executeDelete('series'),
        } : undefined}
        onConfirm={() => confirmDelete && !confirmDelete.isRecurring && void executeDelete('series')}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ── Month cell event preview ──

function MonthEventPreview({
  event,
  variant,
  completed,
}: {
  event: AgentCalendarEvent;
  variant: 'timed' | 'allDay';
  completed: boolean;
}) {
  const toneClass = getEventToneClass(event, completed);

  if (variant === 'allDay') {
    return (
      <div className={cn('calendar-event-preview-allday text-[10px] pointer-events-none', toneClass)}>
        <CalendarDays className="w-2.5 h-2.5 shrink-0 opacity-70" />
        <span className={cn('truncate font-medium', completed && 'line-through opacity-60')}>
          {event.summary}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('calendar-event-preview-timed pointer-events-none', toneClass)}>
      <div className="calendar-event-accent-rail" aria-hidden />
      <div className="calendar-event-preview-body">
        <span className={cn('truncate flex-1 text-[10px] font-medium leading-tight text-[var(--color-text)]', completed && 'line-through opacity-60')}>
          {event.summary}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)] leading-tight">
          {formatPreviewTime(event.start)}
        </span>
      </div>
    </div>
  );
}

// ── Month Grid ──

function MonthGrid({
  currentMonth,
  selectedDate,
  events,
  isMobile,
  onDateClick,
}: {
  currentMonth: Date;
  selectedDate: Date;
  events: AgentCalendarEvent[];
  isMobile: boolean;
  onDateClick: (d: Date) => void;
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

  const previewLimit = getMonthCellPreviewLimit(isMobile);

  return (
    <div className="flex flex-col flex-1 p-2 min-h-0">
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-[var(--color-text-muted)] py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="calendar-month-grid grid grid-cols-7 flex-1 rounded-md overflow-hidden">
        {cells.map(({ date, isCurrentMonth }, i) => {
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const dayEvents = sortEventsForDayCell(getEventsForCalendarDay(date, events));
          const { previews, overflowCount } = sliceMonthCellPreviews(dayEvents, previewLimit);

          return (
            <button
              key={i}
              type="button"
              className={cn(
                'calendar-day-cell relative flex flex-col items-stretch p-1 transition-colors',
                isMobile ? 'min-h-[64px]' : 'min-h-[80px]',
                !isCurrentMonth && 'opacity-50 text-[var(--color-text-subtle)]',
                isSelected && 'is-selected',
              )}
              onClick={() => onDateClick(date)}
            >
              <div className="flex justify-end shrink-0">
                <span
                  className={cn(
                    'text-xs w-6 h-6 flex items-center justify-center rounded-full',
                    isToday && 'bg-[var(--color-accent)] text-white font-bold',
                  )}
                >
                  {date.getDate()}
                </span>
              </div>
              {previews.length > 0 && (
                <div className="flex flex-col items-stretch gap-1 mt-0.5 flex-1 min-h-0 overflow-hidden w-full pointer-events-none">
                  {previews.map((evt) => (
                    <MonthEventPreview
                      key={`${evt.id}:${evt.start}`}
                      event={evt}
                      variant={evt.allDay ? 'allDay' : 'timed'}
                      completed={isOccurrenceCompleted(evt)}
                    />
                  ))}
                  {overflowCount > 0 && (
                    <span className="text-[9px] text-[var(--color-text-muted)] pl-0.5">
                      +{overflowCount} more
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

// ── Day events sidebar (month view) ──

function DayEventsSidebar({
  selectedDate,
  events,
  isMobile,
  onEdit,
  onDelete,
  onToggleComplete,
  deleting,
  completing,
}: {
  selectedDate: Date;
  events: AgentCalendarEvent[];
  isMobile: boolean;
  onEdit: (e: AgentCalendarEvent) => void;
  onDelete: (e: AgentCalendarEvent) => void;
  onToggleComplete: (e: AgentCalendarEvent) => void;
  deleting: string | null;
  completing: string | null;
}) {
  const isToday = isSameDay(selectedDate, new Date());
  const eventLabel = events.length === 1 ? '1 event' : `${events.length} events`;

  return (
    <div
      className={cn(
        'border-[var(--color-border)] flex flex-col min-h-0 overflow-hidden surface-sidebar',
        isMobile ? 'w-full border-t flex-1' : 'w-[min(100%,280px)] shrink-0 border-l',
      )}
    >
      <div className="px-3 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
              {isToday && (
                <span className="ml-1.5 normal-case tracking-normal text-[var(--color-accent)]">· Today</span>
              )}
            </p>
            <h2 className="text-xl font-semibold leading-tight mt-0.5">
              {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </h2>
          </div>
          {events.length > 0 && (
            <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)]">
              {eventLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
            <CalendarDays className="w-8 h-8 text-[var(--color-text-muted)] opacity-50 mb-2" />
            <p className="text-sm font-medium text-[var(--color-text-muted)]">Nothing scheduled</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-[200px]">
              Use <span className="font-medium">New Event</span> above to schedule something.
            </p>
          </div>
        ) : (
          events.map((event) => (
            <DayEventCard
              key={`${event.id}:${event.start}`}
              event={event}
              isMobile={isMobile}
              onEdit={() => onEdit(event)}
              onDelete={() => onDelete(event)}
              onToggleComplete={() => onToggleComplete(event)}
              isDeleting={deleting === eventActionKey(event)}
              isCompleting={completing === eventActionKey(event)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EventMetaChip({
  icon: Icon,
  label,
}: {
  icon: typeof Clock;
  label: string;
}) {
  return (
    <span className="calendar-event-meta-chip">
      <Icon className="w-2.5 h-2.5 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function DayEventCard({
  event,
  isMobile,
  onEdit,
  onDelete,
  onToggleComplete,
  isDeleting,
  isCompleting,
}: {
  event: AgentCalendarEvent;
  isMobile: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  isDeleting: boolean;
  isCompleting: boolean;
}) {
  const completed = isOccurrenceCompleted(event);
  const toneClass = getEventToneClass(event, completed);
  const recurrence = formatRecurrenceLabel(event.recurrence);
  const source = formatSource(event);
  const showActions = isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100';

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        'calendar-event-sidebar-card group text-left w-full cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-md',
        toneClass,
        completed && 'opacity-70',
      )}
    >
      <div className="calendar-event-accent-rail" aria-hidden />
      <div className="calendar-event-sidebar-body pl-3 pr-2 py-2.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className={cn('text-sm font-medium leading-snug pr-1', completed && 'line-through text-[var(--color-text-muted)]')}>
              {event.summary}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 tabular-nums">
              {formatEventSidebarTime(event)}
            </p>
          </div>
          <div className={cn('flex gap-0.5 shrink-0 transition-opacity', showActions)}>
            <button
              type="button"
              aria-label={completed ? 'Mark as not done' : 'Mark as done'}
              className={cn(
                'p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10',
                completed && 'text-[var(--color-accent)]',
              )}
              onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
              disabled={isCompleting || isDeleting}
            >
              {isCompleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              aria-label="Edit event"
              className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete event"
              className="p-1.5 rounded-md hover:bg-red-500/15 text-red-600 dark:text-red-400"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={isDeleting || isCompleting}
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {(event.location || recurrence || source || completed) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {recurrence && <EventMetaChip icon={Repeat} label={recurrence} />}
            {source && <EventMetaChip icon={source.Icon} label={source.label} />}
            {event.location && <EventMetaChip icon={MapPin} label={event.location} />}
            {completed && <EventMetaChip icon={Check} label="Completed" />}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Event List View ──

function EventListView({
  events,
  onEdit,
  onDelete,
  onToggleComplete,
  deleting,
  completing,
}: {
  events: AgentCalendarEvent[];
  onEdit: (e: AgentCalendarEvent) => void;
  onDelete: (e: AgentCalendarEvent) => void;
  onToggleComplete: (e: AgentCalendarEvent) => void;
  deleting: string | null;
  completing: string | null;
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
    <div className="flex-1 min-h-0 overflow-y-auto">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-muted)] px-4 text-center">
          <CalendarDays className="w-10 h-10 opacity-40" />
          <p className="text-sm">No events this month</p>
          <p className="text-xs max-w-[220px]">
            Use <span className="font-medium">New Event</span> above to schedule something.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from(grouped).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] surface-toolbar sticky top-0 border-b border-[var(--color-border)]">
                {dateLabel}
              </div>
              <div className="divide-y divide-[var(--color-border)]/50">
                {dayEvents.map((event) => {
                  const isCompleted = isOccurrenceCompleted(event);
                  return (
                  <div
                    key={`${event.id}:${event.start}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-accent-muted)] transition-colors group"
                  >
                    <div
                      className={cn('calendar-event-accent-rail', getEventToneClass(event, isCompleted))}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm font-medium truncate flex items-center gap-1.5', isCompleted && 'text-[var(--color-text-muted)]')}>
                        {isCompleted && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span className={cn(isCompleted && 'line-through')}>{event.summary}</span>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-2 flex-wrap">
                        <span className="tabular-nums">{formatEventSidebarTime(event)}</span>
                        {formatRecurrenceLabel(event.recurrence) && (
                          <span className="flex items-center gap-0.5">
                            <Repeat className="w-2.5 h-2.5" />
                            {formatRecurrenceLabel(event.recurrence)}
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
                          <span className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
                            <Check className="w-2.5 h-2.5" /> Done
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onToggleComplete(event)}
                        disabled={completing === eventActionKey(event) || deleting === eventActionKey(event)}
                        className={cn(isCompleted && 'text-[var(--color-accent)]')}
                        aria-label={isCompleted ? 'Mark as not done' : 'Mark as done'}
                      >
                        {completing === eventActionKey(event)
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Check className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(event)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDelete(event)}
                        disabled={deleting === eventActionKey(event)}
                        className="text-red-500 hover:text-red-600"
                      >
                        {deleting === eventActionKey(event)
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

function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h3 className="text-xs font-semibold text-[var(--color-text)]">{title}</h3>
        {description && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function EventDialog({
  open,
  onClose,
  form,
  setForm,
  onSave,
  saving,
  isEdit,
  error,
  isMobile,
}: {
  open: boolean;
  onClose: () => void;
  form: EventFormData;
  setForm: (f: EventFormData) => void;
  onSave: () => void;
  saving: boolean;
  isEdit: boolean;
  error: string | null;
  isMobile: boolean;
}) {
  const update = (patch: Partial<EventFormData>) => setForm({ ...form, ...patch });
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus title once when the dialog opens — not on every parent re-render (form typing
  // used to pass a new onClose inline and retriggered this effect).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => titleInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, saving]);

  const { shouldRender, isClosing } = useDelayUnmount(open, 250);

  if (!shouldRender) return null;

  const panelClass = 'surface-card rounded-lg border border-[var(--color-border)] p-3 space-y-3';

  return (
    <div
      ref={overlayRef}
      className={cn(
        "absolute inset-0 z-50 flex items-end sm:items-center justify-center contained-scrim rounded-b-xl p-2 sm:p-4",
        isClosing && "closing"
      )}
      onClick={(e) => { if (e.target === overlayRef.current && !saving) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-event-dialog-title"
    >
      <div
        className={cn(
          'soft-popover border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-window)]',
          'w-full flex flex-col overflow-hidden',
          isClosing && 'closing',
          isMobile ? 'max-h-[94%]' : 'max-w-[640px] max-h-[92%]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] surface-toolbar select-none">
          <div className="min-w-0">
            <h2 id="calendar-event-dialog-title" className="text-base font-semibold">
              {isEdit ? 'Edit event' : 'New event'}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {isEdit ? 'Update details, schedule, or recurrence.' : 'Add something to your calendar.'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="shrink-0 hover:bg-[var(--color-error)] hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className={cn('p-4 gap-4', isMobile ? 'flex flex-col' : 'grid grid-cols-2')}>
            <FormSection title="Details" description="What is this event about?">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium">Title</Label>
                  <Input
                    ref={titleInputRef}
                    value={form.summary}
                    onChange={(e) => update({ summary: e.target.value })}
                    placeholder="e.g. Team standup"
                    className="mt-1.5"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && form.summary.trim()) onSave();
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Description</Label>
                  <textarea
                    value={form.description}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Notes or agenda (optional)"
                    className={cn(
                      'mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)]',
                      'surface-control focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 resize-none',
                    )}
                    rows={3}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Location</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => update({ location: e.target.value })}
                    placeholder="Room, link, or address (optional)"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </FormSection>

            <div className="space-y-4">
              <FormSection title="When" description="Set the date and time.">
                <div className={panelClass}>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      id="allDay"
                      checked={form.allDay}
                      onChange={(e) => update({ allDay: e.target.checked })}
                      className="rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                    />
                    <span className="text-sm">All-day event</span>
                  </label>

                  {form.allDay ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-medium">Start date</Label>
                        <Input
                          type="date"
                          value={form.startDate}
                          onChange={(e) => update({ startDate: e.target.value })}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium">End date</Label>
                        <Input
                          type="date"
                          value={form.endDate}
                          onChange={(e) => update({ endDate: e.target.value })}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium">Starts</Label>
                        <Input
                          type="datetime-local"
                          value={form.startDatetime}
                          onChange={(e) => update({ startDatetime: e.target.value })}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium">Ends</Label>
                        <Input
                          type="datetime-local"
                          value={form.endDatetime}
                          onChange={(e) => update({ endDatetime: e.target.value })}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </FormSection>

              <FormSection title="Repeat" description="Optional recurring schedule.">
                <div className={panelClass}>
                  <div>
                    <Label className="text-xs font-medium">Frequency</Label>
                    <Select
                      value={form.repeatType}
                      onChange={(v) => update({ repeatType: v as RepeatType })}
                      options={[
                        { value: 'none', label: 'Does not repeat' },
                        { value: 'hourly', label: 'Hourly' },
                        { value: 'daily', label: 'Daily' },
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'monthly', label: 'Monthly' },
                        { value: 'yearly', label: 'Yearly' },
                        { value: 'custom', label: 'Custom (weekly)' },
                      ]}
                    />
                  </div>

                  {form.repeatType !== 'none' && (
                    <div className="space-y-3 pt-1 border-t border-[var(--color-border)]/60">
                      {(form.repeatType === 'custom' || form.repeatInterval > 1) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-[var(--color-text-muted)]">Every</span>
                          <Input
                            type="number"
                            min={1}
                            max={99}
                            value={form.repeatInterval}
                            onChange={(e) => update({ repeatInterval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            className="w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {form.repeatType === 'daily' ? 'day(s)'
                              : form.repeatType === 'monthly' ? 'month(s)'
                                : form.repeatType === 'yearly' ? 'year(s)'
                                  : form.repeatType === 'hourly' ? 'hour(s)'
                                    : 'week(s)'}
                          </span>
                        </div>
                      )}

                      {(form.repeatType === 'weekly' || form.repeatType === 'custom') && (
                        <div>
                          <p className="text-xs text-[var(--color-text-muted)] mb-1.5">On these days</p>
                          <div className="flex gap-1">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => (
                              <button
                                key={i}
                                type="button"
                                aria-pressed={form.repeatDays[i]}
                                className={cn(
                                  'w-8 h-8 rounded-full text-xs font-medium transition-colors',
                                  form.repeatDays[i]
                                    ? 'bg-[var(--color-accent)] text-white'
                                    : 'surface-control border border-[var(--color-border)] hover:bg-[var(--color-accent-muted)]',
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

                      <div>
                        <p className="text-xs text-[var(--color-text-muted)] mb-1.5">Ends</p>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer min-h-[28px]">
                            <input
                              type="radio"
                              name="repeatEnd"
                              checked={form.repeatEndType === 'never'}
                              onChange={() => update({ repeatEndType: 'never' })}
                              className="accent-[var(--color-accent)]"
                            />
                            <span className="text-sm">Never</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer flex-wrap min-h-[28px]">
                            <input
                              type="radio"
                              name="repeatEnd"
                              checked={form.repeatEndType === 'after'}
                              onChange={() => update({ repeatEndType: 'after' })}
                              className="accent-[var(--color-accent)]"
                            />
                            <span className="text-sm shrink-0">After</span>
                            <Input
                              type="number"
                              min={1}
                              max={999}
                              value={form.repeatCount}
                              onChange={(e) => update({ repeatCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              className="w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                              disabled={form.repeatEndType !== 'after'}
                            />
                            <span className="text-sm text-[var(--color-text-muted)]">occurrences</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer flex-wrap min-h-[28px]">
                            <input
                              type="radio"
                              name="repeatEnd"
                              checked={form.repeatEndType === 'on'}
                              onChange={() => update({ repeatEndType: 'on' })}
                              className="accent-[var(--color-accent)]"
                            />
                            <span className="text-sm shrink-0">On date</span>
                            <Input
                              type="date"
                              value={form.repeatUntilDate}
                              onChange={(e) => update({ repeatUntilDate: e.target.value })}
                              className="flex-1 min-w-[140px]"
                              disabled={form.repeatEndType !== 'on'}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </FormSection>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--color-border)] surface-toolbar">
          <p className="text-[10px] text-[var(--color-text-muted)] hidden sm:block">
            {isEdit ? 'Esc to close' : '⌘↵ to save when title is filled'}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onSave} disabled={saving || !form.summary.trim()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              {isEdit ? 'Save changes' : 'Create event'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

