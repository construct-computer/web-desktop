import { memo, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatPublishedAbsolute, formatPublishedRelative } from '@/lib/format';
import { faviconUrlForPage } from '@/lib/favicon';
import { breadcrumbFromUrl } from '@/lib/searchResultFormat';
import type { BrowserTab } from '@/stores/browserTabStore';

function hostFromUrl(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

function resolveTitle(tab: BrowserTab): string {
  if (tab.pageTitle?.trim()) return tab.pageTitle.trim();
  const host = hostFromUrl(tab.url);
  if (host) return host;
  return 'Untitled page';
}

function MetaSeparator() {
  return <span className="fetch-reader-meta-sep" aria-hidden="true">·</span>;
}

export const FetchReaderHeader = memo(function FetchReaderHeader({ tab }: { tab: BrowserTab }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const title = resolveTitle(tab);
  const faviconUrl = faviconUrlForPage(tab.url);
  const breadcrumb = useMemo(
    () => (tab.url ? breadcrumbFromUrl(tab.url) : null),
    [tab.url],
  );

  const publishedRelative = tab.publishedTime
    ? formatPublishedRelative(tab.publishedTime)
    : null;
  const publishedAbsolute = tab.publishedTime
    ? formatPublishedAbsolute(tab.publishedTime)
    : null;

  const metaItems: Array<{ key: string; node: React.ReactNode }> = [];

  if (breadcrumb?.display && tab.url) {
    metaItems.push({
      key: 'source',
      node: (
        <a
          href={tab.url}
          target="_blank"
          rel="noopener noreferrer"
          className="fetch-reader-meta-link inline-flex items-center gap-1 hover:underline underline-offset-2"
          title={tab.url}
        >
          <span className="truncate max-w-[min(100%,28rem)]">{breadcrumb.display}</span>
          <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
        </a>
      ),
    });
  }

  if (publishedRelative) {
    metaItems.push({
      key: 'published',
      node: (
        <time dateTime={tab.publishedTime} title={publishedAbsolute ?? undefined}>
          {publishedRelative}
        </time>
      ),
    });
  }

  if (tab.readerTruncated) {
    metaItems.push({
      key: 'truncated',
      node: <span>Truncated</span>,
    });
  }

  if (tab.contentFormat === 'json' && tab.structuredSummary?.trim()) {
    metaItems.push({
      key: 'json-summary',
      node: <span>{tab.structuredSummary.trim()}</span>,
    });
  }

  if (tab.pageDescription?.trim()) {
    const description = tab.pageDescription.trim();
    metaItems.push({
      key: 'description',
      node: (
        <span className="truncate max-w-[min(100%,24rem)]" title={description}>
          {description.length > 80 ? `${description.slice(0, 79)}…` : description}
        </span>
      ),
    });
  }

  return (
    <header className="fetch-reader-header mb-6 border-b border-black/[0.08] pb-4">
      <div className="fetch-reader-header-title-row flex items-start gap-3 min-w-0">
        {faviconUrl && !faviconFailed && (
          <img
            src={faviconUrl}
            alt=""
            className="fetch-reader-header-favicon shrink-0 rounded-[4px] opacity-90"
            loading="lazy"
            decoding="async"
            onError={() => setFaviconFailed(true)}
          />
        )}
        <div className="fetch-reader-header-body min-w-0 flex-1">
          <h1 className="reader-article-title text-[var(--color-text)] leading-snug">
            {title}
          </h1>

          {metaItems.length > 0 && (
            <div className="fetch-reader-meta mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--color-text-subtle)] select-none min-w-0">
              {metaItems.map((item, index) => (
                <span key={item.key} className="inline-flex items-center gap-2 min-w-0">
                  {index > 0 && <MetaSeparator />}
                  {item.node}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
});
