import { memo, useCallback } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Search } from 'lucide-react';
import constructLogo from '@/assets/logo.png';
import { countryLabel } from '@/lib/searchResultFormat';
import { formatSearchError, queryHasBooleanSyntax } from '@/lib/jinaSearchErrors';
import type { BrowserTab } from '@/stores/browserTabStore';
import { useBrowserTabStore } from '@/stores/browserTabStore';
import { SearchResultRow } from './SearchResultRow';

const MAX_TAB_RETRIES = 3;

function SearchResultSkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="px-3 py-4 space-y-2 select-none"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-sm bg-black/[0.05] dark:bg-white/[0.05] animate-pulse shrink-0" />
        <div className="h-3 w-2/5 rounded bg-black/[0.05] dark:bg-white/[0.05] animate-pulse" />
      </div>
      <div className="h-4 w-4/5 rounded bg-black/[0.05] dark:bg-white/[0.05] animate-pulse" />
      <div className="h-4 w-3/5 rounded bg-black/[0.05] dark:bg-white/[0.05] animate-pulse" />
      <div className="h-3 w-full rounded bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
      <div className="h-3 w-11/12 rounded bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
    </div>
  );
}

function SearchResultsHeader({
  query,
  resultCount,
  loading,
  country,
}: {
  query: string;
  resultCount: number;
  loading: boolean;
  country?: string;
}) {
  const region = countryLabel(country);
  let stats = '';
  if (loading) {
    stats = 'Searching…';
  } else if (resultCount === 0) {
    stats = `No results for "${query}"`;
  } else {
    stats = `About ${resultCount} result${resultCount === 1 ? '' : 's'}`;
    if (region) stats += ` · ${region}`;
  }

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-border)] backdrop-blur-sm">
      <div className="search-results mx-auto px-5 sm:px-8 py-5">
        <div className="flex items-center gap-2 mb-4">
          <img
            src={constructLogo}
            alt=""
            className="w-6 h-6 shrink-0 opacity-90"
            draggable={false}
          />
          <span className="text-[22px] font-normal text-[var(--color-text-muted)] tracking-tight font-sans select-none">
            Construct
          </span>
        </div>
        <div className="flex items-center gap-3 h-10 px-4 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
          <Search className="w-4 h-4 text-[var(--color-text-subtle)] shrink-0" />
          <span className="text-sm text-[var(--color-text)] font-sans truncate">{query}</span>
        </div>
        <p className="mt-3 text-[13px] text-[var(--color-text-subtle)] font-sans select-none">
          {stats}
        </p>
      </div>
    </header>
  );
}

function SearchEmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-black/[0.04] dark:bg-white/[0.04] flex items-center justify-center mb-4 border border-[var(--color-border)]">
        <Search className="w-6 h-6 text-[var(--color-text-subtle)] opacity-60" />
      </div>
      <p className="text-sm font-medium text-[var(--color-text)] mb-2">
        No results for <span className="text-[var(--color-text-muted)]">&ldquo;{query}&rdquo;</span>
      </p>
      <ul className="text-xs text-[var(--color-text-muted)] leading-relaxed max-w-sm space-y-1 text-left list-disc list-inside">
        <li>Try different or more general keywords</li>
        <li>Check spelling and remove extra punctuation</li>
        <li>Use specific product or site names when possible</li>
      </ul>
    </div>
  );
}

function RetryButton({
  label,
  onClick,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = variant === 'primary'
    ? `${base} bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/25 hover:bg-[var(--color-accent)]/25`
    : `${base} bg-white/[0.04] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-white/[0.08] hover:text-[var(--color-text)]`;
  return (
    <button type="button" className={styles} onClick={onClick} disabled={disabled}>
      <RefreshCw className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function SearchErrorState({ tab }: { tab: BrowserTab }) {
  const retryTab = useBrowserTabStore((s) => s.retryTab);
  const loading = tab.status === 'loading';
  const formatted = formatSearchError(tab.error);
  const query = tab.query || tab.title;
  const canRetry = (tab.retryCount ?? 0) < MAX_TAB_RETRIES;
  const showSimplify = queryHasBooleanSyntax(query);

  const onRetry = useCallback(() => { void retryTab(tab.id); }, [retryTab, tab.id]);
  const onSimplify = useCallback(() => { void retryTab(tab.id, { simplify: true }); }, [retryTab, tab.id]);

  const isAmber = formatted.kind === 'no_results';
  const iconWrap = isAmber
    ? 'bg-amber-500/10 border-amber-500/20'
    : 'bg-red-500/10 border-red-500/20';
  const titleColor = isAmber ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center select-none bg-[var(--color-surface)]">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 border ${iconWrap}`}>
        {loading
          ? <Loader2 className="w-6 h-6 text-[var(--color-accent)] animate-spin" />
          : <AlertTriangle className={`w-6 h-6 ${titleColor}`} />}
      </div>
      <p className={`text-sm font-semibold mb-2 ${titleColor}`}>{formatted.title}</p>
      <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed mb-4">{formatted.body}</p>
      {formatted.hints.length > 0 && (
        <ul className="text-[11px] text-[var(--color-text-subtle)] max-w-sm space-y-1 text-left list-disc list-inside mb-5">
          {formatted.hints.map((hint) => <li key={hint}>{hint}</li>)}
        </ul>
      )}
      <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
        <RetryButton label="Retry" onClick={onRetry} disabled={loading || !canRetry} />
        {showSimplify && (
          <RetryButton
            label="Try simpler search"
            onClick={onSimplify}
            disabled={loading || !canRetry}
            variant="secondary"
          />
        )}
      </div>
      {!canRetry && (
        <p className="text-[10px] text-[var(--color-text-subtle)] mt-3">Maximum retries reached. Ask Construct to search again.</p>
      )}
    </div>
  );
}

export const BrowserSearchPage = memo(function BrowserSearchPage({ tab }: { tab: BrowserTab }) {
  if (tab.status === 'error') {
    return <SearchErrorState tab={tab} />;
  }

  const loading = tab.status === 'loading';
  const query = tab.query || tab.title;
  const results = tab.results || [];
  const resultCount = tab.searchResultCount ?? results.length;

  return (
    <div className="h-full overflow-y-auto browser-read-pane">
      <SearchResultsHeader
        query={query}
        resultCount={resultCount}
        loading={loading}
        country={tab.searchCountry}
      />

      <div className="search-results mx-auto px-5 sm:px-8 py-4 pb-10">
        {loading ? (
          <div className="flex flex-col gap-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <SearchResultSkeleton key={i} delay={i * 70} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <SearchEmptyState query={query} />
        ) : (
          <div className="flex flex-col gap-5">
            {results.map((r, i) => (
              <SearchResultRow key={`${r.url}-${i}`} result={r} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
