import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  AlertCircle,
  Terminal,
  ArrowDownLeft,
  ArrowUpRight,
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
  { value: '', label: 'All activity' },
  { value: 'tool', label: 'Tools & Actions' },
  { value: 'message', label: 'Messages' },
  { value: 'system', label: 'System events' },
  { value: 'error', label: 'Errors' },
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

function getCategoryIcon(category: string, action: string) {
  if (category === 'tool') return Terminal;
  if (category === 'message') {
    return action.includes('out') ? ArrowUpRight : ArrowDownLeft;
  }
  if (category === 'system') return Settings;
  if (category === 'error') return AlertCircle;
  return FileText;
}

function getCategoryColor(category: string, action: string): string {
  if (category === 'tool') return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
  if (category === 'message') {
    return action.includes('out') ? 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
  }
  if (category === 'system') return 'text-neutral-500 bg-neutral-500/10 border-neutral-500/20';
  if (category === 'error') return 'text-red-500 bg-red-500/10 border-red-500/20';
  return 'text-neutral-400 bg-neutral-500/10 border-neutral-500/20';
}

function getResultBadge(result: string): { label: string; className: string } {
  switch (result) {
    case 'success':
      return { label: 'Success', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
    case 'error':
      return { label: 'Error', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' };
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
    case 'skipped':
      return { label: 'Skipped', className: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20' };
    default:
      return { label: result, className: 'bg-neutral-500/10 text-neutral-500 border-neutral-500/20' };
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

function recursivelyParseJSON(obj: any): any {
  if (typeof obj === 'string') {
    try {
      const parsed = JSON.parse(obj);
      if (typeof parsed === 'object' && parsed !== null) {
        return recursivelyParseJSON(parsed);
      }
      return parsed;
    } catch {
      return obj;
    }
  } else if (Array.isArray(obj)) {
    return obj.map(recursivelyParseJSON);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = recursivelyParseJSON(obj[key]);
    }
    return newObj;
  }
  return obj;
}

function formatDetailData(data: any): string {
  if (!data) return '';
  let parsed = data;
  
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return data; // Return unescaped string if it's not valid JSON (e.g. truncated)
    }
  }
  
  parsed = recursivelyParseJSON(parsed);
  
  if (typeof parsed === 'string') {
    return parsed;
  }
  
  return JSON.stringify(parsed, null, 2);
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
      <div className="flex flex-col border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-[var(--color-text)]">
            <FileText className="w-5 h-5 text-[var(--color-text-muted)]" />
            <span className="font-semibold text-sm">Activity Log</span>
          </div>
          <span className="text-xs font-medium text-[var(--color-text-muted)] bg-black/5 dark:bg-white/10 px-2 py-1 rounded-full tabular-nums">
            {total.toLocaleString()} event{total !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          {/* Category filter */}
          <div ref={categoryRef} className="relative">
            <button
              ref={categoryBtnRef}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)]
                         bg-[var(--color-surface)] hover:bg-[var(--color-accent-muted)] transition-colors shadow-sm"
              onClick={() => {
                if (showCategoryDropdown) {
                  setShowCategoryDropdown(false);
                } else {
                  setCategoryRect(categoryBtnRef.current?.getBoundingClientRect() ?? null);
                  setShowCategoryDropdown(true);
                }
              }}
            >
              <span className="truncate max-w-[120px]">{selectedCategoryLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
            </button>
            {showCategoryDropdown && categoryRect && createPortal(
              <div
                id="auditlog-category-dropdown"
                className="fixed w-48 bg-[var(--color-surface)] backdrop-blur-2xl
                            border border-black/10 dark:border-white/15 rounded-xl shadow-xl z-[9999] p-1.5 flex flex-col gap-0.5"
                style={{ top: categoryRect.bottom + 6, left: categoryRect.left }}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs font-medium rounded-md hover:bg-[var(--color-accent-muted)] transition-colors',
                      category === opt.value && 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
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
          <div className="flex items-center bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-0.5 shadow-sm">
            {DATE_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                  dateRange === opt.value ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                )}
                onClick={() => setDateRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[20px]" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-[200px] text-xs rounded-lg border border-[var(--color-border)]
                         bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] shadow-sm transition-all"
            />
          </div>
        </div>
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
        <div className="flex-1 flex items-center justify-center bg-[var(--color-background)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--color-text-muted)] bg-[var(--color-background)]">
          <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center mb-2 border border-[var(--color-border)]/50">
            <FileText className="w-8 h-8 opacity-40" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-[var(--color-text)]">No activity found</p>
            <p className="text-xs opacity-80 max-w-[250px] leading-relaxed">
              {category || dateRange !== 'all' || searchQuery 
                ? 'Try adjusting your filters or search query to find what you are looking for.' 
                : 'Activity logs will appear here automatically as the agent works.'}
            </p>
          </div>
          {(category || dateRange !== 'all' || searchQuery) && (
            <Button variant="ghost" size="sm" onClick={() => {
              setCategory('');
              setDateRange('all');
              setSearchQuery('');
            }} className="mt-2 text-xs h-8">
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 bg-[var(--color-background)]">
          {Array.from(grouped).map(([dateLabel, dayEntries]) => (
            <div key={dateLabel} className="mb-4 last:mb-0">
              <div className="px-4 py-2 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-black/5 dark:bg-white/5 backdrop-blur-md sticky top-0 z-10 border-y border-[var(--color-border)]/50">
                {dateLabel}
              </div>
              <div className="bg-[var(--color-surface)]">
                {dayEntries.map(entry => {
                  const Icon = getCategoryIcon(entry.category, entry.action);
                  const iconColor = getCategoryColor(entry.category, entry.action);
                  const badge = getResultBadge(entry.result);
                  const isExpanded = expandedId === entry.id;

                  return (
                    <div key={entry.id} className="group border-b border-[var(--color-border)]/50 last:border-0 relative">
                      {/* Highlight bar on hover */}
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-transparent group-hover:bg-[var(--color-accent)] transition-colors" />
                      
                      <button
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left",
                          isExpanded && "bg-black/[0.02] dark:bg-white/[0.02]"
                        )}
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        {/* Category icon */}
                        <div className={cn('shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center mt-0.5', iconColor)}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--color-text)] truncate">{entry.action}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-current/10', badge.className)}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-[12px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                            {entry.summary}
                          </p>
                        </div>

                        {/* Right side: duration + time */}
                        <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                            <span>{formatAuditTimestamp(entry.timestamp)}</span>
                          </div>
                          {entry.durationMs != null && (
                            <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums opacity-60 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded-md">
                              {formatDuration(entry.durationMs)}
                            </span>
                          )}
                        </div>

                        {/* Expand chevron */}
                        <ChevronDown className={cn('w-4 h-4 mt-1 shrink-0 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-all', isExpanded && 'rotate-180 opacity-100')} />
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-black/[0.02] dark:bg-white/[0.02]">
                          <div className="ml-11 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm space-y-3">
                             {/* Full message content — scrollable fixed-height section */}
                             {entry.summary && (
                               <div>
                                 <span className="text-[11px] font-medium text-[var(--color-text)] uppercase tracking-wider opacity-60">
                                   {entry.category === 'message' ? (entry.action.includes('out') ? 'Response:' : 'Message:') : 'Summary:'}
                                 </span>
                                 <div className="mt-1.5 max-h-[140px] overflow-y-auto rounded-lg bg-[var(--color-background)] border border-[var(--color-border)]/50 p-2.5">
                                   <p className="text-[12px] text-[var(--color-text)] whitespace-pre-wrap break-words leading-relaxed font-mono">
                                     {entry.summary}
                                   </p>
                                 </div>
                               </div>
                             )}

                             {/* Meta info row */}
                             <div className="flex flex-wrap gap-x-5 gap-y-2 py-2 border-y border-[var(--color-border)]/50">
                               <div className="flex flex-col gap-0.5">
                                 <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Category</span>
                                 <span className="text-[12px] text-[var(--color-text)]">{entry.category}</span>
                               </div>
                               {entry.sourceType && (
                                 <div className="flex flex-col gap-0.5">
                                   <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Source</span>
                                   <span className="text-[12px] text-[var(--color-text)]">{entry.sourceType}</span>
                                 </div>
                               )}
                               {entry.relatedEventId && (
                                 <div className="flex flex-col gap-0.5">
                                   <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Event ID</span>
                                   <span className="text-[12px] text-[var(--color-text)] font-mono">{entry.relatedEventId}</span>
                                 </div>
                               )}
                               {entry.sessionKey && (
                                 <div className="flex flex-col gap-0.5">
                                   <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Session</span>
                                   <span className="text-[12px] text-[var(--color-text)] font-mono">{entry.sessionKey.slice(0, 8)}...</span>
                                 </div>
                               )}
                             </div>

                             {/* Result detail */}
                             {entry.resultDetail && (
                               <div>
                                 <span className="text-[11px] font-medium text-[var(--color-text)] uppercase tracking-wider opacity-60">Result:</span>
                                 <pre className="mt-1.5 p-2.5 rounded-lg bg-[var(--color-background)] border border-red-500/20 text-red-600 dark:text-red-400 text-[12px] font-mono whitespace-pre-wrap break-all max-h-[160px] overflow-y-auto">
                                   {entry.resultDetail}
                                 </pre>
                               </div>
                             )}

                             {/* Detail JSON */}
                             {entry.detail && (() => {
                               const detailStr = formatDetailData(entry.detail);
                               if (!detailStr || detailStr === '{}' || detailStr === '[]') return null;
                               return (
                                 <div>
                                   <span className="text-[11px] font-medium text-[var(--color-text)] uppercase tracking-wider opacity-60">Details:</span>
                                   <pre className="mt-1.5 p-2.5 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)]/50 text-[11px] font-mono whitespace-pre-wrap break-all text-[var(--color-text)] max-h-[200px] overflow-y-auto">
                                     {detailStr}
                                   </pre>
                                 </div>
                               );
                             })()}

                             {/* Source meta */}
                             {entry.sourceMeta && (() => {
                               const metaStr = formatDetailData(entry.sourceMeta);
                               if (!metaStr || metaStr === '{}' || metaStr === '[]') return null;
                               return (
                                 <div>
                                   <span className="text-[11px] font-medium text-[var(--color-text)] uppercase tracking-wider opacity-60">Source Meta:</span>
                                   <pre className="mt-1.5 p-2.5 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)]/50 text-[11px] font-mono whitespace-pre-wrap break-all text-[var(--color-text)] max-h-[120px] overflow-y-auto">
                                     {metaStr}
                                   </pre>
                                 </div>
                               );
                             })()}
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
