import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  CalendarDays,
  AlertCircle,
  Terminal,
  ArrowDownLeft,
  ArrowUpRight,
  Zap,
  Settings,
  Search,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { listAuditLogs, type AuditLogEvent } from '@/services/api';
import type { WindowConfig } from '@/types';

// ── Constants ──

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'tool_call', label: 'Tool calls' },
  { value: 'calendar_event', label: 'Calendar events' },
  { value: 'message_in', label: 'Incoming messages' },
  { value: 'message_out', label: 'Outgoing messages' },
  { value: 'background', label: 'Background tasks' },
  { value: 'system', label: 'System events' },
] as const;

const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
] as const;

type DateRangeValue = (typeof DATE_RANGE_OPTIONS)[number]['value'];

// ── Helpers ──

function getDateRangeBounds(range: DateRangeValue): { timeMin?: string; timeMax?: string } {
  const now = new Date();
  switch (range) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { timeMin: start.toISOString() };
    }
    case '7d': {
      const start = new Date(now.getTime() - 7 * 86400000);
      return { timeMin: start.toISOString() };
    }
    case '30d': {
      const start = new Date(now.getTime() - 30 * 86400000);
      return { timeMin: start.toISOString() };
    }
    case 'all':
    default:
      return {};
  }
}

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
    case 'tool_call': return 'text-blue-500';
    case 'calendar_event': return 'text-violet-500';
    case 'message_in': return 'text-emerald-500';
    case 'message_out': return 'text-cyan-500';
    case 'background': return 'text-amber-500';
    case 'system': return 'text-neutral-500';
    default: return 'text-neutral-400';
  }
}

function getResultBadge(result: string): { label: string; className: string } {
  switch (result) {
    case 'success':
      return { label: 'Success', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
    case 'error':
      return { label: 'Error', className: 'bg-red-500/15 text-red-600 dark:text-red-400' };
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' };
    case 'skipped':
      return { label: 'Skipped', className: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-400' };
    default:
      return { label: result, className: 'bg-neutral-500/15 text-neutral-500' };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatAuditTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  } catch {
    return ts;
  }
}

function formatAuditDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return ts;
  }
}

// ── Component ──

export function AuditLogsWindow({ config: _config }: { config: WindowConfig }) {
  const [entries, setEntries] = useState<AuditLogEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categoryRect, setCategoryRect] = useState<DOMRect | null>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const categoryBtnRef = useRef<HTMLButtonElement>(null);

  void _config; // suppress unused warning

  const PAGE_SIZE = 50;

  const fetchEntries = useCallback(async (append = false) => {
    try {
      if (!append) setError(null);
      const bounds = getDateRangeBounds(dateRange);
      const result = await listAuditLogs({
        ...bounds,
        category: category || undefined,
        query: searchQuery || undefined,
        limit: PAGE_SIZE,
        offset: append ? entries.length : 0,
      });
      if (result.success) {
        if (append) {
          setEntries(prev => [...prev, ...result.data.entries]);
        } else {
          setEntries(result.data.entries);
        }
        setTotal(result.data.total);
      } else {
        setError(result.error || 'Failed to load audit logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    }
  }, [category, dateRange, searchQuery, entries.length]);

  // Initial load + auto-refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchEntries(false);
      if (!cancelled) setLoading(false);
    })();
    const interval = setInterval(() => fetchEntries(false), 10_000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, dateRange, searchQuery]);

  // Close category dropdown on outside click
  useEffect(() => {
    if (!showCategoryDropdown) return;
    function handler(e: MouseEvent) {
      if (categoryRef.current?.contains(e.target as Node)) return;
      const portal = document.getElementById('auditlog-category-dropdown');
      if (portal?.contains(e.target as Node)) return;
      setShowCategoryDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCategoryDropdown]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchEntries(true);
    setLoadingMore(false);
  };

  const hasMore = entries.length < total;

  // Group entries by date
  const grouped = new Map<string, AuditLogEvent[]>();
  for (const entry of entries) {
    const dateKey = formatAuditDate(entry.timestamp);
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(entry);
  }

  const selectedCategoryLabel = CATEGORY_OPTIONS.find(c => c.value === category)?.label || 'All categories';

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 h-full bg-[var(--color-surface)]">
      {/* Filters bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        {/* Category filter */}
        <div ref={categoryRef}>
          <button
            ref={categoryBtnRef}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-[var(--color-border)]
                       bg-[var(--color-surface)] hover:bg-[var(--color-accent-muted)] transition-colors"
            onClick={() => {
              if (showCategoryDropdown) {
                setShowCategoryDropdown(false);
              } else {
                setCategoryRect(categoryBtnRef.current?.getBoundingClientRect() ?? null);
                setShowCategoryDropdown(true);
              }
            }}
          >
            <span className="truncate max-w-[100px]">{selectedCategoryLabel}</span>
            <ChevronDown className="w-3 h-3 shrink-0" />
          </button>
          {showCategoryDropdown && categoryRect && createPortal(
            <div
              id="auditlog-category-dropdown"
              className="fixed w-44 bg-[var(--color-surface)] backdrop-blur-2xl
                          border border-black/10 dark:border-white/15 rounded-lg shadow-xl z-[9999] py-1"
              style={{ top: categoryRect.bottom + 4, left: categoryRect.left }}
            >
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-accent-muted)] transition-colors',
                    category === opt.value && 'font-medium text-[var(--color-accent)]',
                  )}
                  onClick={() => { setCategory(opt.value); setShowCategoryDropdown(false); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>,
            document.body,
          )}
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-0.5 bg-[var(--color-surface)] rounded-md border border-[var(--color-border)] p-0.5">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap',
                dateRange === opt.value ? 'bg-[var(--color-accent)] text-white' : 'hover:bg-[var(--color-accent-muted)]',
              )}
              onClick={() => setDateRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-1 w-[160px] text-xs rounded-md border border-[var(--color-border)]
                       bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        {/* Count badge */}
        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
          {total.toLocaleString()} event{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
          <FileText className="w-10 h-10 opacity-40" />
          <p className="text-sm">No activity recorded</p>
          <p className="text-xs opacity-60">
            {category ? 'Try a different category filter' : dateRange !== 'all' ? 'Try expanding the date range' : 'Activity will appear here as the agent works'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          {Array.from(grouped).map(([dateLabel, dayEntries]) => (
            <div key={dateLabel}>
              <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-titlebar)] sticky top-0 z-10">
                {dateLabel}
              </div>
              <div className="divide-y divide-[var(--color-border)]/50">
                {dayEntries.map(entry => {
                  const Icon = getCategoryIcon(entry.category);
                  const iconColor = getCategoryColor(entry.category);
                  const badge = getResultBadge(entry.result);
                  const isExpanded = expandedId === entry.id;

                  return (
                    <div key={entry.id}>
                      <button
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--color-accent-muted)] transition-colors text-left"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        {/* Category icon */}
                        <div className={cn('shrink-0', iconColor)}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium truncate">{entry.action}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', badge.className)}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
                            {entry.summary}
                          </p>
                        </div>

                        {/* Right side: duration + time */}
                        <div className="shrink-0 flex flex-col items-end gap-0.5">
                          <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                            {formatAuditTimestamp(entry.timestamp)}
                          </span>
                          {entry.durationMs != null && (
                            <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums opacity-60">
                              {formatDuration(entry.durationMs)}
                            </span>
                          )}
                        </div>

                        {/* Expand chevron */}
                        <ChevronDown className={cn('w-3 h-3 shrink-0 text-[var(--color-text-muted)] transition-transform', isExpanded && 'rotate-180')} />
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0">
                          <div className="ml-6.5 p-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-[var(--color-border)]/50 space-y-2">
                             {/* Full message content — scrollable fixed-height section */}
                             {entry.summary && (
                               <div>
                                 <span className="text-[10px] text-[var(--color-text-muted)]">
                                   {entry.category === 'message_in' ? 'Message:' : entry.category === 'message_out' ? 'Response:' : 'Summary:'}
                                 </span>
                                 <div className="mt-0.5 max-h-[120px] overflow-y-auto rounded bg-black/[0.03] dark:bg-white/[0.03] border border-[var(--color-border)]/30 p-2">
                                   <p className="text-[11px] text-[var(--color-text)] whitespace-pre-wrap break-words leading-relaxed">
                                     {entry.summary}
                                   </p>
                                 </div>
                               </div>
                             )}

                             {/* Meta info row */}
                             <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-muted)]">
                               <span>Category: <strong className="font-medium text-[var(--color-text)]">{entry.category}</strong></span>
                               {entry.sourceType && (
                                 <span>Source: <strong className="font-medium text-[var(--color-text)]">{entry.sourceType}</strong></span>
                               )}
                               {entry.relatedEventId && (
                                 <span>Event: <strong className="font-medium text-[var(--color-text)] font-mono">{entry.relatedEventId}</strong></span>
                               )}
                               {entry.sessionKey && (
                                 <span>Session: <strong className="font-medium text-[var(--color-text)] font-mono">{entry.sessionKey.slice(0, 12)}...</strong></span>
                               )}
                             </div>

                             {/* Result detail */}
                             {entry.resultDetail && (
                               <div>
                                 <span className="text-[10px] text-[var(--color-text-muted)]">Result:</span>
                                 <pre className="mt-0.5 text-[11px] font-mono whitespace-pre-wrap break-all text-[var(--color-text)] max-h-[160px] overflow-y-auto">
                                   {entry.resultDetail}
                                 </pre>
                               </div>
                             )}

                             {/* Detail JSON */}
                             {entry.detail && Object.keys(entry.detail).length > 0 && (
                               <div>
                                 <span className="text-[10px] text-[var(--color-text-muted)]">Details:</span>
                                 <pre className="mt-0.5 text-[11px] font-mono whitespace-pre-wrap break-all text-[var(--color-text)] max-h-[200px] overflow-y-auto">
                                   {JSON.stringify(entry.detail, null, 2)}
                                 </pre>
                               </div>
                             )}

                             {/* Source meta */}
                             {entry.sourceMeta && Object.keys(entry.sourceMeta).length > 0 && (
                               <div>
                                 <span className="text-[10px] text-[var(--color-text-muted)]">Source details:</span>
                                 <pre className="mt-0.5 text-[11px] font-mono whitespace-pre-wrap break-all text-[var(--color-text)] max-h-[120px] overflow-y-auto">
                                   {JSON.stringify(entry.sourceMeta, null, 2)}
                                 </pre>
                               </div>
                             )}
                           </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center py-3">
              <Button variant="ghost" size="sm" onClick={handleLoadMore} disabled={loadingMore} className="text-xs">
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Load more ({total - entries.length} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
