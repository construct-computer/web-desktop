import { memo, useCallback, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { faviconUrlForHost } from '@/lib/favicon';
import { breadcrumbFromUrl, formatSearchDate } from '@/lib/searchResultFormat';
import type { BrowserSearchResult } from '@/stores/browserTabStore';

export const SearchResultRow = memo(function SearchResultRow({
  result,
  index,
  compact = false,
}: {
  result: BrowserSearchResult;
  index?: number;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const breadcrumb = breadcrumbFromUrl(result.url);
  const formattedDate = formatSearchDate(result.date);
  const title = result.title || result.url || 'Untitled';

  const copyLink = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!result.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* */ }
  }, [result.url]);

  if (compact) {
    return (
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block py-1 hover:bg-black/[0.04] rounded px-1 -mx-1"
      >
        <div className="search-result-title text-[11px] font-medium line-clamp-1">
          {title}
        </div>
        {result.snippet && (
          <p className="search-result-snippet text-[10px] line-clamp-1 mt-0.5 opacity-80">
            {result.snippet}
          </p>
        )}
      </a>
    );
  }

  return (
    <article className="search-result group relative px-3 py-4 rounded-lg hover:bg-black/[0.04] transition-colors">
      <div className="flex items-start gap-2 min-w-0">
        {typeof index === 'number' && (
          <span className="search-result-rank shrink-0 w-5 text-right pt-0.5 tabular-nums">
            {index + 1}.
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="search-result-breadcrumb flex items-center gap-1.5 min-w-0 mb-1">
            {breadcrumb.host && !faviconFailed && (
              <img
                src={faviconUrlForHost(breadcrumb.host)}
                alt=""
                className="w-4 h-4 rounded-sm shrink-0 opacity-90"
                loading="lazy"
                decoding="async"
                onError={() => setFaviconFailed(true)}
              />
            )}
            <span className="truncate" title={result.url}>
              {breadcrumb.display || result.url}
            </span>
          </div>

          <h3 className="search-result-title m-0">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 hover:underline underline-offset-2"
              title={result.url}
            >
              {title}
            </a>
          </h3>

          {(formattedDate || result.snippet) && (
            <p className="search-result-snippet mt-1.5 m-0 line-clamp-3">
              {formattedDate && (
                <span className="search-result-date">{formattedDate}</span>
              )}
              {formattedDate && result.snippet && (
                <span className="text-[var(--color-text-subtle)] mx-1.5" aria-hidden>·</span>
              )}
              {result.snippet}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={copyLink}
          className="shrink-0 p-1.5 rounded-md opacity-0 group-hover:opacity-100
                     text-[var(--color-text-subtle)] hover:text-[var(--color-text)]
                     hover:bg-white/[0.06] transition-all"
          title="Copy link"
          aria-label="Copy link"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </article>
  );
});
