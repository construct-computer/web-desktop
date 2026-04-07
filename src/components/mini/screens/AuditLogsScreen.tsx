/**
 * AuditLogsScreen -- Browse, search, and filter agent activity logs
 * in the Telegram Mini App with expandable detail cards.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Terminal, CalendarDays, ArrowDownLeft, ArrowUpRight, Zap,
  Settings, FileText, Search, ChevronDown, Clock,
} from 'lucide-react';
import {
  MiniHeader, Card, Badge, SkeletonList, EmptyState, SectionLabel,
  IconBtn, Spinner,
  api, apiJSON, bg2, textColor, accent, formatRelativeTime, haptic,
} from '../ui';

// -- Constants --

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'tool_call', label: 'Tool Calls' },
  { value: 'calendar_event', label: 'Calendar' },
  { value: 'message_in', label: 'Incoming' },
  { value: 'message_out', label: 'Outgoing' },
  { value: 'background', label: 'Background' },
  { value: 'system', label: 'System' },
] as const;

type DateRange = 'today' | '7d' | '30d' | 'all';

const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

function getDateRangeParams(range: DateRange): { time_min?: string; time_max?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today') return { time_min: today.toISOString() };
  if (range === '7d') return { time_min: new Date(today.getTime() - 7 * 86400000).toISOString() };
  if (range === '30d') return { time_min: new Date(today.getTime() - 30 * 86400000).toISOString() };
  return {};
}

const PAGE_SIZE = 50;

// -- Types --

interface LogEntry {
  id: string;
  timestamp: string;
  category: string;
  action: string;
  tool_name?: string;
  duration_ms?: number;
  result: string;
  context?: Record<string, unknown>;
  session_key?: string;
  // Extended fields from API
  summary?: string;
  detail?: Record<string, unknown> | null;
  sourceType?: string | null;
  sourceMeta?: Record<string, unknown> | null;
  resultDetail?: string | null;
  durationMs?: number | null;
  relatedEventId?: string | null;
  sessionKey?: string | null;
}

// -- Helpers --

function getCategoryIcon(category: string) {
  switch (category) {
    case 'tool_call': return Terminal;
    case 'calendar_event': return CalendarDays;
    case 'message_in': return ArrowDownLeft;
    case 'message_out': return ArrowUpRight;
    case 'background': return Zap;
    case 'system': return Settings;
    default: return FileText;
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'tool_call': return '#3b82f6';
    case 'calendar_event': return '#8b5cf6';
    case 'message_in': return '#10b981';
    case 'message_out': return '#06b6d4';
    case 'background': return '#f59e0b';
    case 'system': return '#6b7280';
    default: return '#94a3b8';
  }
}

function getResultBadge(result: string): { label: string; color: string } {
  switch (result) {
    case 'success': return { label: 'Success', color: '#22c55e' };
    case 'error': return { label: 'Error', color: '#ef4444' };
    case 'pending': return { label: 'Pending', color: '#f59e0b' };
    case 'skipped': return { label: 'Skipped', color: '#6b7280' };
    default: return { label: result, color: '#6b7280' };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ts; }
}

function formatDateLabel(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return ts; }
}

// -- Component --

export function AuditLogsScreen() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offsetRef = useRef(0);

  // -- Fetch --

  const fetchEntries = useCallback(async (append = false) => {
    const offset = append ? offsetRef.current : 0;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (category) params.set('category', category);
    if (searchQuery) params.set('query', searchQuery);
    const { time_min, time_max } = getDateRangeParams(dateRange);
    if (time_min) params.set('time_min', time_min);
    if (time_max) params.set('time_max', time_max);

    const data = await apiJSON<{ entries: LogEntry[]; total: number }>(`/audit/logs?${params}`);
    if (data) {
      if (append) {
        setEntries(prev => [...prev, ...data.entries]);
        offsetRef.current += data.entries.length;
      } else {
        setEntries(data.entries);
        offsetRef.current = data.entries.length;
      }
      setTotal(data.total);
    }
  }, [category, searchQuery, dateRange]);

  // Initial load + filter changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchEntries(false);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, searchQuery, dateRange]);

  // Auto-refresh every 10s (matches desktop)
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchEntries(false), 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, searchQuery, dateRange]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchEntries(true);
    setLoadingMore(false);
  };

  const hasMore = entries.length < total;

  // Group entries by date
  const grouped = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const key = formatDateLabel(entry.timestamp);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      <MiniHeader
        title="Audit Logs"
        actions={
          <IconBtn onClick={() => { setShowSearch(s => !s); haptic(); }}>
            <Search size={16} className="opacity-50" />
          </IconBtn>
        }
      />

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto shrink-0 no-scrollbar" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {CATEGORIES.map(cat => {
          const active = category === cat.value;
          const CatIcon = cat.value ? getCategoryIcon(cat.value) : null;
          return (
            <button
              key={cat.value}
              onClick={() => { setCategory(cat.value); haptic(); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium shrink-0 transition-colors"
              style={{
                backgroundColor: active ? accent() : 'rgba(255,255,255,0.06)',
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {CatIcon && <CatIcon size={12} />}
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Date range filter */}
      <div className="flex items-center gap-1 px-4 py-1.5 shrink-0">
        {DATE_RANGES.map(dr => (
          <button
            key={dr.value}
            onClick={() => { setDateRange(dr.value); haptic(); }}
            className="px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: dateRange === dr.value ? `${accent()}25` : 'transparent',
              color: dateRange === dr.value ? accent() : 'rgba(255,255,255,0.3)',
            }}
          >
            {dr.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-30" />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full text-[13px] pl-8 pr-3 py-2 rounded-xl outline-none"
              style={{ backgroundColor: bg2(), color: textColor() }}
            />
          </div>
        </div>
      )}

      {/* Event count */}
      <div className="px-4 py-1.5 shrink-0">
        <span className="text-[10px] opacity-30">
          {total.toLocaleString()} event{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList count={6} />
        ) : entries.length === 0 ? (
          <EmptyState icon={FileText} message={searchQuery ? 'No matching events' : category ? 'No events in this category' : 'No activity recorded yet'} />
        ) : (
          <div className="pb-4">
            {Array.from(grouped).map(([dateLabel, dayEntries]) => (
              <div key={dateLabel}>
                {/* Date header */}
                <div className="px-4 py-1.5 sticky top-0 z-10" style={{ backgroundColor: bg2() }}>
                  <SectionLabel>{dateLabel}</SectionLabel>
                </div>

                {/* Entries */}
                <div className="px-4 space-y-1.5 py-1">
                  {dayEntries.map(entry => (
                    <AuditEntryCard
                      key={entry.id}
                      entry={entry}
                      expanded={expandedId === entry.id}
                      onToggle={() => { setExpandedId(expandedId === entry.id ? null : entry.id); haptic(); }}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-30"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: accent() }}
                >
                  {loadingMore ? <Spinner size={14} /> : null}
                  Load more ({total - entries.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Audit Entry Card --

function AuditEntryCard({ entry, expanded, onToggle }: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = getCategoryIcon(entry.category);
  const iconColor = getCategoryColor(entry.category);
  const badge = getResultBadge(entry.result);
  const duration = entry.duration_ms ?? entry.durationMs;
  const toolName = entry.tool_name;
  const context = entry.context ?? entry.detail;
  const sessionKey = entry.session_key ?? entry.sessionKey;

  return (
    <Card>
      {/* Clickable summary row */}
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 text-left">
        {/* Category icon */}
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${iconColor}18` }}>
          <Icon size={16} style={{ color: iconColor }} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium truncate">{entry.action}</span>
            <Badge color={badge.color}>{badge.label}</Badge>
          </div>
          {(entry.summary || toolName) && (
            <p className="text-[11px] opacity-40 truncate mt-0.5">{toolName || entry.summary}</p>
          )}
        </div>

        {/* Right side */}
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <span className="text-[10px] opacity-30 tabular-nums">{formatTimestamp(entry.timestamp)}</span>
          {duration != null && (
            <span className="text-[10px] opacity-20 tabular-nums">{formatDuration(duration)}</span>
          )}
        </div>

        {/* Chevron */}
        <ChevronDown
          size={14}
          className="shrink-0 opacity-20 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="mt-2.5 pt-2.5 space-y-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', animation: 'mini-fade-in 150ms ease-out' }}
        >
          {/* Summary */}
          {entry.summary && (
            <div>
              <span className="text-[10px] opacity-30 block mb-0.5">
                {entry.category === 'message_in' ? 'Message' : entry.category === 'message_out' ? 'Response' : 'Summary'}
              </span>
              <div
                className="text-[11px] opacity-70 whitespace-pre-wrap break-words leading-relaxed max-h-[120px] overflow-y-auto rounded-lg p-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                {entry.summary}
              </div>
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] opacity-30">
            <span>Category: <strong className="opacity-80">{entry.category}</strong></span>
            <span>Time: <strong className="opacity-80">{new Date(entry.timestamp).toLocaleString()}</strong></span>
            {toolName && <span>Tool: <strong className="opacity-80 font-mono">{toolName}</strong></span>}
            {duration != null && <span>Duration: <strong className="opacity-80">{formatDuration(duration)}</strong></span>}
            {entry.sourceType && <span>Source: <strong className="opacity-80">{entry.sourceType}</strong></span>}
            {sessionKey && <span>Session: <strong className="opacity-80 font-mono">{sessionKey.slice(0, 12)}...</strong></span>}
            {entry.relatedEventId && <span>Event: <strong className="opacity-80 font-mono">{entry.relatedEventId}</strong></span>}
          </div>

          {/* Result detail */}
          {entry.resultDetail && (
            <div>
              <span className="text-[10px] opacity-30 block mb-0.5">Result</span>
              <pre
                className="text-[11px] font-mono whitespace-pre-wrap break-all opacity-60 max-h-[160px] overflow-y-auto rounded-lg p-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                {entry.resultDetail}
              </pre>
            </div>
          )}

          {/* Context / Detail JSON */}
          {context && Object.keys(context).length > 0 && (
            <div>
              <span className="text-[10px] opacity-30 block mb-0.5">Context</span>
              <pre
                className="text-[11px] font-mono whitespace-pre-wrap break-all opacity-60 max-h-[200px] overflow-y-auto rounded-lg p-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                {JSON.stringify(context, null, 2)}
              </pre>
            </div>
          )}

          {/* Source meta */}
          {entry.sourceMeta && Object.keys(entry.sourceMeta).length > 0 && (
            <div>
              <span className="text-[10px] opacity-30 block mb-0.5">Source details</span>
              <pre
                className="text-[11px] font-mono whitespace-pre-wrap break-all opacity-60 max-h-[120px] overflow-y-auto rounded-lg p-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                {JSON.stringify(entry.sourceMeta, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
