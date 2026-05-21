import { AlertCircle, CheckCircle2, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RefreshButton({
  onClick,
  refreshing,
  title = 'Refresh',
  className,
}: {
  onClick: () => void;
  refreshing?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-black/[0.05] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-60 dark:hover:bg-white/[0.08]',
        className,
      )}
      title={title}
      aria-label={title}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
    </button>
  );
}

export function FreshnessText({
  lastUpdatedAt,
  isRefreshing,
  isStale,
  now,
}: {
  lastUpdatedAt: number | null;
  isRefreshing?: boolean;
  isStale?: boolean;
  now?: number;
}) {
  if (isRefreshing) return <span>Updating</span>;
  if (!lastUpdatedAt) return <span>Not updated yet</span>;
  const seconds = Math.max(0, Math.floor(((now ?? lastUpdatedAt) - lastUpdatedAt) / 1000));
  const value = seconds < 5 ? 'now' : seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
  return <span>{isStale ? 'Stale' : 'Updated'} {value}</span>;
}

export function StatusBanner({
  tone = 'info',
  children,
  action,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : tone === 'warning' ? WifiOff : Loader2;
  return (
    <div
      className={cn(
        'flex items-start gap-2 border-b px-3 py-1.5 text-xs',
        tone === 'error' && 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        tone === 'success' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'info' && 'border-[var(--color-border)] bg-black/[0.025] text-[var(--color-text-muted)] dark:bg-white/[0.035]',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone === 'info' && 'hidden')} />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
