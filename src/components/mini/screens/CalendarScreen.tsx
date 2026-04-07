/**
 * CalendarScreen — Month view + list view + events for the Telegram Mini App.
 * 1:1 parity with desktop CalendarWindow:
 *   - Month/List view toggle
 *   - Recurrence (RRULE builder: daily/weekly/monthly/yearly, interval, day picker, end conditions)
 *   - Auto-refresh every 10 seconds
 *   - Source attribution (Telegram, Slack, Chat, Self-scheduled)
 *   - Completion tracking (strikethrough + dim)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Clock, MapPin, CalendarDays,
  List, LayoutGrid, RefreshCw, Repeat, MessageCircle, Hash, Monitor, Bot,
} from 'lucide-react';
import {
  MiniHeader, Card, ConfirmDialog, Field, Toggle, Spinner, EmptyState,
  SectionLabel, useToast, haptic,
  accent, bg, bg2, textColor, api,
} from '../ui';

// ── Types ──

interface CalendarEvent {
  id: string;
  title?: string;
  summary?: string;
  description?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  status?: string;
  recurrence?: string[] | null;
  sourceType?: string | null;
  sourceMeta?: Record<string, unknown> | null;
  completedOccurrences?: string[] | null;
}

type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type RepeatEndType = 'never' | 'after' | 'on';

interface EventFormState {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  allDay: boolean;
  repeatType: RepeatType;
  repeatInterval: number;
  repeatDays: boolean[];
  repeatEndType: RepeatEndType;
  repeatCount: number;
  repeatUntilDate: string;
}

type ViewMode = 'month' | 'list';

// ── Helpers ──

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toLocalDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function formatTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

function getTitle(ev: CalendarEvent): string { return ev.title || ev.summary || 'Untitled'; }

function isCompleted(ev: CalendarEvent): boolean {
  return ev.status === 'completed';
}

function formatSource(ev: CalendarEvent): { label: string; Icon: typeof MessageCircle } | null {
  if (!ev.sourceType) return null;
  const username = ev.sourceMeta?.username as string | undefined;
  switch (ev.sourceType) {
    case 'telegram': return { label: username ? `@${username} via Telegram` : 'via Telegram', Icon: MessageCircle };
    case 'slack': return { label: username ? `${username} via Slack` : 'via Slack', Icon: Hash };
    case 'chat': return { label: 'via Chat', Icon: Monitor };
    case 'self': return { label: 'Self-scheduled', Icon: Bot };
    case 'scheduled_task': return { label: 'Scheduled task', Icon: Clock };
    default: return { label: `via ${ev.sourceType}`, Icon: MessageCircle };
  }
}

const EVENT_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#FB923C'];
const COMPLETED_COLOR = 'rgba(255,255,255,0.15)';
function eventColor(ev: CalendarEvent, idx: number): string {
  if (isCompleted(ev)) return COMPLETED_COLOR;
  return EVENT_COLORS[idx % EVENT_COLORS.length];
}

function emptyForm(defaultDate: Date): EventFormState {
  return {
    title: '', description: '',
    date: toLocalDateStr(defaultDate),
    startTime: '09:00', endTime: '10:00',
    location: '', allDay: false,
    repeatType: 'none', repeatInterval: 1,
    repeatDays: [false, false, false, false, false, false, false],
    repeatEndType: 'never', repeatCount: 10,
    repeatUntilDate: toLocalDateStr(new Date(defaultDate.getTime() + 30 * 86400000)),
  };
}

function formFromEvent(ev: CalendarEvent): EventFormState {
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : null;
  const f: EventFormState = {
    title: getTitle(ev), description: ev.description || '',
    date: toLocalDateStr(start),
    startTime: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
    endTime: end ? `${pad2(end.getHours())}:${pad2(end.getMinutes())}` : `${pad2(start.getHours() + 1)}:${pad2(start.getMinutes())}`,
    location: ev.location || '', allDay: ev.allDay || false,
    repeatType: 'none', repeatInterval: 1,
    repeatDays: [false, false, false, false, false, false, false],
    repeatEndType: 'never', repeatCount: 10,
    repeatUntilDate: toLocalDateStr(new Date(start.getTime() + 30 * 86400000)),
  };
  // Parse existing RRULE
  if (ev.recurrence && ev.recurrence.length > 0) {
    const rule = ev.recurrence[0].replace('RRULE:', '');
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
  return f;
}

function buildRrule(form: EventFormState): string[] | undefined {
  if (form.repeatType === 'none') return undefined;
  const freqMap: Record<string, string> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY', custom: 'WEEKLY' };
  const parts: string[] = [`FREQ=${freqMap[form.repeatType]}`];
  if (form.repeatInterval > 1) parts.push(`INTERVAL=${form.repeatInterval}`);
  if (form.repeatType === 'weekly' || form.repeatType === 'custom') {
    const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const selected = form.repeatDays.map((on, i) => on ? dayNames[i] : null).filter(Boolean);
    if (selected.length > 0) parts.push(`BYDAY=${selected.join(',')}`);
  }
  if (form.repeatEndType === 'after' && form.repeatCount > 0) parts.push(`COUNT=${form.repeatCount}`);
  else if (form.repeatEndType === 'on' && form.repeatUntilDate) parts.push(`UNTIL=${form.repeatUntilDate.replace(/-/g, '')}T235959Z`);
  return [`RRULE:${parts.join(';')}`];
}

function formToPayload(form: EventFormState) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const recurrence = buildRrule(form);
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    location: form.location.trim() || undefined,
    time_zone: tz,
  };
  if (form.allDay) {
    payload.start = `${form.date}T00:00:00`;
    payload.end = `${form.date}T23:59:59`;
    payload.allDay = true;
    payload.start_date = form.date;
    payload.end_date = form.date;
    payload.all_day = true;
  } else {
    payload.start = `${form.date}T${form.startTime}:00`;
    payload.end = `${form.date}T${form.endTime}:00`;
    payload.start_datetime = new Date(`${form.date}T${form.startTime}:00`).toISOString();
    payload.end_datetime = new Date(`${form.date}T${form.endTime}:00`).toISOString();
  }
  if (recurrence) payload.recurrence = recurrence;
  return payload;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Main Component ──

export function CalendarScreen() {
  const toast = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('month');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyForm(new Date()));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // ── Fetch events ──

  const fetchEvents = useCallback(async () => {
    const rangeStart = new Date(year, month, -7);
    const rangeEnd = new Date(year, month + 1, 7, 23, 59, 59);
    try {
      const res = await api(`/calendar/agent/events?time_min=${rangeStart.toISOString()}&time_max=${rangeEnd.toISOString()}&max_results=200`);
      if (res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : data.events || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { setLoading(true); fetchEvents(); }, [fetchEvents]);

  // Auto-refresh every 10 seconds (matches desktop)
  useEffect(() => {
    const iv = setInterval(fetchEvents, 10_000);
    return () => clearInterval(iv);
  }, [fetchEvents]);

  // ── Month navigation ──

  const prevMonth = () => { haptic('light'); setCurrentDate(new Date(year, month - 1, 1)); };
  const nextMonth = () => { haptic('light'); setCurrentDate(new Date(year, month + 1, 1)); };
  const goToday = () => {
    haptic('light');
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now.getDate());
  };

  // ── Calendar grid ──

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const weeks = useMemo(() => {
    const grid: (number | null)[][] = [];
    let week: (number | null)[] = Array(firstDayOfWeek).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d);
      if (week.length === 7) { grid.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); grid.push(week); }
    return grid;
  }, [daysInMonth, firstDayOfWeek]);

  // ── Events for selected day ──

  const dayEvents = useMemo(() => {
    return events
      .filter(ev => {
        const d = new Date(ev.start);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === selectedDay;
      })
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });
  }, [events, selectedDay, year, month]);

  // ── Events grouped by date for list view ──

  const listEvents = useMemo(() => {
    const filtered = events
      .filter(ev => {
        const d = new Date(ev.start);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const groups: Array<{ date: string; label: string; events: CalendarEvent[] }> = [];
    for (const ev of filtered) {
      const d = new Date(ev.start);
      const key = toLocalDateStr(d);
      const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      let group = groups.find(g => g.date === key);
      if (!group) { group = { date: key, label, events: [] }; groups.push(group); }
      group.events.push(ev);
    }
    return groups;
  }, [events, year, month]);

  // ── Days with events (for dots) ──

  const eventDays = useMemo(() => {
    const days = new Set<number>();
    events.forEach(ev => {
      const d = new Date(ev.start);
      if (d.getFullYear() === year && d.getMonth() === month) days.add(d.getDate());
    });
    return days;
  }, [events, year, month]);

  const today = new Date();
  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const handleDayTap = (day: number) => { haptic('light'); setSelectedDay(day); };

  const openCreate = () => {
    haptic('medium');
    setForm(emptyForm(new Date(year, month, selectedDay)));
    setEditingEvent(null);
    setModalMode('create');
  };

  const openEdit = (ev: CalendarEvent) => {
    haptic('medium');
    setForm(formFromEvent(ev));
    setEditingEvent(ev);
    setModalMode('edit');
  };

  // ── Save ──

  const handleSave = async () => {
    if (!form.title.trim()) { toast.show('Title is required', 'error'); return; }
    setSaving(true);
    const payload = formToPayload(form);
    try {
      const url = modalMode === 'edit' && editingEvent
        ? `/calendar/agent/events/${editingEvent.id}`
        : '/calendar/agent/events';
      const method = modalMode === 'edit' && editingEvent ? 'PUT' : 'POST';
      const res = await api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        haptic('success');
        toast.show(modalMode === 'edit' ? 'Event updated' : 'Event created', 'success');
        setModalMode(null);
        fetchEvents();
      } else { haptic('error'); toast.show('Failed to save event', 'error'); }
    } catch { haptic('error'); toast.show('Network error', 'error'); }
    setSaving(false);
  };

  // ── Delete ──

  const handleDelete = async (eventId: string) => {
    try {
      const res = await api(`/calendar/agent/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) {
        haptic('success'); toast.show('Event deleted', 'success');
        setEvents(ev => ev.filter(e => e.id !== eventId));
        setDeleteTarget(null);
        if (editingEvent?.id === eventId) setModalMode(null);
      } else { haptic('error'); toast.show('Failed to delete event', 'error'); }
    } catch { haptic('error'); toast.show('Network error', 'error'); }
  };

  const updateForm = (patch: Partial<EventFormState>) => setForm(f => ({ ...f, ...patch }));

  const selectedDateStr = new Date(year, month, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      {/* Header */}
      <MiniHeader
        title={`${MONTH_NAMES[month]} ${year}`}
        actions={
          <div className="flex items-center gap-0.5">
            <button onClick={() => { setView(v => v === 'month' ? 'list' : 'month'); haptic('light'); }} className="p-2 rounded-lg active:bg-white/5">
              {view === 'month' ? <List size={16} className="opacity-50" /> : <LayoutGrid size={16} className="opacity-50" />}
            </button>
            <button onClick={prevMonth} className="p-2 rounded-lg active:bg-white/5"><ChevronLeft size={18} className="opacity-50" /></button>
            <button onClick={goToday} className="px-1.5 py-1 rounded-lg active:bg-white/5 text-[11px] font-medium opacity-40">Today</button>
            <button onClick={nextMonth} className="p-2 rounded-lg active:bg-white/5"><ChevronRight size={18} className="opacity-50" /></button>
            <button onClick={openCreate} className="p-2 rounded-lg active:bg-white/5"><Plus size={18} style={{ color: accent() }} /></button>
          </div>
        }
      />

      {view === 'month' ? (
        <>
          {/* Day names */}
          <div className="grid grid-cols-7 px-3 pb-1">
            {DAY_LABELS.map((d, i) => (
              <span key={i} className="text-center text-[11px] opacity-30 font-medium">{d}</span>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="px-3 pb-2">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  const selected = day === selectedDay;
                  const todayCell = day !== null && isToday(day);
                  const hasEvent = day !== null && eventDays.has(day);
                  return (
                    <button key={di} onClick={() => day !== null && handleDayTap(day)} disabled={day === null}
                      className="flex flex-col items-center justify-center py-1.5 rounded-lg" style={{ opacity: day === null ? 0 : 1 }}>
                      <span className="w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium" style={{
                        backgroundColor: selected ? accent() : todayCell ? `${accent()}25` : 'transparent',
                        color: selected ? '#fff' : textColor(), opacity: selected ? 1 : 0.7, fontWeight: todayCell || selected ? 700 : 500,
                      }}>{day ?? ''}</span>
                      <span className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: hasEvent && !selected ? accent() : 'transparent' }} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Events list for selected day */}
          <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] font-medium opacity-50">{selectedDateStr}</span>
              {loading && <Spinner size={14} />}
            </div>
            {loading && events.length === 0 ? (
              <div className="flex justify-center py-8"><Spinner size={20} /></div>
            ) : dayEvents.length === 0 ? (
              <EmptyState icon={CalendarDays} message="No events this day" />
            ) : (
              <div className="space-y-2">
                {dayEvents.map((ev, i) => (
                  <EventCard key={ev.id} event={ev} colorIndex={i} onClick={() => openEdit(ev)} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── List View ── */
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && events.length === 0 ? (
            <div className="flex justify-center py-8"><Spinner size={20} /></div>
          ) : listEvents.length === 0 ? (
            <EmptyState icon={CalendarDays} message="No events this month" />
          ) : (
            <div className="space-y-4">
              {listEvents.map(group => (
                <div key={group.date}>
                  <p className="text-[12px] font-semibold opacity-40 uppercase tracking-wider mb-1.5 mt-2">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.events.map((ev, i) => (
                      <EventCard key={ev.id} event={ev} colorIndex={i} onClick={() => openEdit(ev)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      {modalMode && (
        <EventModal
          mode={modalMode} form={form} saving={saving}
          onUpdate={updateForm} onSave={handleSave}
          onClose={() => setModalMode(null)}
          onDelete={modalMode === 'edit' && editingEvent ? () => setDeleteTarget(editingEvent) : undefined}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Event"
          message={`Are you sure you want to delete "${getTitle(deleteTarget)}"?`}
          confirmLabel="Delete" destructive
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Event Card ──

function EventCard({ event, colorIndex, onClick }: { event: CalendarEvent; colorIndex: number; onClick: () => void }) {
  const completed = isCompleted(event);
  const source = formatSource(event);
  const color = eventColor(event, colorIndex);

  return (
    <Card onClick={onClick}>
      <div className="flex gap-3">
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium truncate" style={{
            textDecoration: completed ? 'line-through' : undefined,
            opacity: completed ? 0.4 : 1,
          }}>
            {getTitle(event)}
          </p>
          <div className="flex items-center gap-1.5 mt-1 opacity-40">
            <Clock size={11} />
            <span className="text-[12px]">
              {event.allDay ? 'All day' : `${formatTime(event.start)}${event.end ? ` - ${formatTime(event.end)}` : ''}`}
            </span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1.5 mt-0.5 opacity-30">
              <MapPin size={11} />
              <span className="text-[12px] truncate">{event.location}</span>
            </div>
          )}
          {/* Recurrence badge */}
          {event.recurrence && event.recurrence.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5 opacity-30">
              <Repeat size={10} />
              <span className="text-[11px]">Recurring</span>
            </div>
          )}
          {/* Source attribution */}
          {source && (
            <div className="flex items-center gap-1 mt-0.5 opacity-25">
              <source.Icon size={10} />
              <span className="text-[11px]">{source.label}</span>
            </div>
          )}
          {event.description && (
            <p className="text-[12px] opacity-25 mt-1 line-clamp-2">{event.description}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Event Create/Edit Modal ──

function EventModal({ mode, form, saving, onUpdate, onSave, onClose, onDelete }: {
  mode: 'create' | 'edit'; form: EventFormState; saving: boolean;
  onUpdate: (patch: Partial<EventFormState>) => void; onSave: () => void;
  onClose: () => void; onDelete?: () => void;
}) {
  const REPEAT_OPTIONS: Array<{ value: RepeatType; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'custom', label: 'Custom (pick days)' },
  ];

  return (
    <div className="absolute inset-0 z-40 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
      <div className="shrink-0 h-12" onClick={onClose} />
      <div className="flex-1 rounded-t-2xl flex flex-col overflow-hidden" style={{ backgroundColor: bg(), animation: 'mini-sheet-up 200ms ease-out' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} className="text-[14px] opacity-50">Cancel</button>
          <span className="text-[15px] font-semibold">{mode === 'edit' ? 'Edit Event' : 'New Event'}</span>
          <button onClick={onSave} disabled={!form.title.trim() || saving} className="text-[14px] font-semibold disabled:opacity-30" style={{ color: accent() }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Field label="Title" value={form.title} onChange={v => onUpdate({ title: v })} placeholder="Event title" />
          <Field label="Description" value={form.description} onChange={v => onUpdate({ description: v })} placeholder="Optional description" />
          <Field label="Location" value={form.location} onChange={v => onUpdate({ location: v })} placeholder="Optional location" />
          <Field label="Date" value={form.date} onChange={v => onUpdate({ date: v })} type="date" />

          <Toggle checked={form.allDay} onChange={v => onUpdate({ allDay: v })} label="All day" />

          {!form.allDay && (
            <div className="flex gap-3">
              <div className="flex-1"><Field label="Start Time" value={form.startTime} onChange={v => onUpdate({ startTime: v })} type="time" /></div>
              <div className="flex-1"><Field label="End Time" value={form.endTime} onChange={v => onUpdate({ endTime: v })} type="time" /></div>
            </div>
          )}

          {/* Recurrence section */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider opacity-40 mb-1.5 block">Repeat</label>
            <div className="flex flex-wrap gap-1.5">
              {REPEAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onUpdate({ repeatType: opt.value })}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                  style={{
                    backgroundColor: form.repeatType === opt.value ? accent() : 'rgba(255,255,255,0.06)',
                    color: form.repeatType === opt.value ? '#fff' : textColor(),
                    opacity: form.repeatType === opt.value ? 1 : 0.5,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recurrence details */}
          {form.repeatType !== 'none' && (
            <div className="space-y-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              {/* Interval */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] opacity-50 shrink-0">Every</span>
                <input
                  type="number" min={1} max={99}
                  value={form.repeatInterval}
                  onChange={e => onUpdate({ repeatInterval: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-14 text-[13px] px-2 py-1.5 rounded-lg outline-none text-center"
                  style={{ backgroundColor: bg2(), color: textColor() }}
                />
                <span className="text-[12px] opacity-50">
                  {form.repeatType === 'daily' ? 'day(s)' : form.repeatType === 'weekly' || form.repeatType === 'custom' ? 'week(s)' : form.repeatType === 'monthly' ? 'month(s)' : 'year(s)'}
                </span>
              </div>

              {/* Day picker (weekly/custom) */}
              {(form.repeatType === 'weekly' || form.repeatType === 'custom') && (
                <div>
                  <span className="text-[11px] opacity-40 block mb-1.5">On days</span>
                  <div className="flex gap-1.5">
                    {DAY_NAMES_FULL.map((name, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const days = [...form.repeatDays];
                          days[i] = !days[i];
                          onUpdate({ repeatDays: days });
                        }}
                        className="w-9 h-9 rounded-full text-[11px] font-medium flex items-center justify-center"
                        style={{
                          backgroundColor: form.repeatDays[i] ? accent() : 'rgba(255,255,255,0.06)',
                          color: form.repeatDays[i] ? '#fff' : textColor(),
                          opacity: form.repeatDays[i] ? 1 : 0.4,
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* End condition */}
              <div>
                <span className="text-[11px] opacity-40 block mb-1.5">Ends</span>
                <div className="flex gap-1.5 mb-2">
                  {([['never', 'Never'], ['after', 'After'], ['on', 'On date']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => onUpdate({ repeatEndType: val })}
                      className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                      style={{
                        backgroundColor: form.repeatEndType === val ? accent() : 'rgba(255,255,255,0.06)',
                        color: form.repeatEndType === val ? '#fff' : textColor(),
                        opacity: form.repeatEndType === val ? 1 : 0.5,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.repeatEndType === 'after' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={1} max={999}
                      value={form.repeatCount}
                      onChange={e => onUpdate({ repeatCount: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-16 text-[13px] px-2 py-1.5 rounded-lg outline-none text-center"
                      style={{ backgroundColor: bg2(), color: textColor() }}
                    />
                    <span className="text-[12px] opacity-50">occurrence(s)</span>
                  </div>
                )}
                {form.repeatEndType === 'on' && (
                  <Field label="" value={form.repeatUntilDate} onChange={v => onUpdate({ repeatUntilDate: v })} type="date" />
                )}
              </div>
            </div>
          )}

          {/* Delete button */}
          {onDelete && (
            <button onClick={() => { haptic('warning'); onDelete(); }}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[14px] font-medium mt-4"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              <Trash2 size={14} /> Delete Event
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
