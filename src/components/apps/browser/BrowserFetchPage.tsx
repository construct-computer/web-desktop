import { memo, useEffect, useState } from 'react';
import { AlertTriangle, Globe, Loader2, Calendar, BookOpen, AlertCircle } from 'lucide-react';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import type { BrowserTab } from '@/stores/browserTabStore';
import { STORAGE_KEYS } from '@/lib/constants';

function FetchSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-12 space-y-6 select-none">
      <div className="space-y-3">
        <div className="h-7 w-5/6 rounded bg-white/[0.05] animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-white/[0.03] animate-pulse" />
      </div>
      <div className="h-px bg-white/[0.06] w-full" />
      <div className="space-y-4 pt-4">
        <div className="h-4 w-full rounded bg-white/[0.03] animate-pulse" />
        <div className="h-4 w-full rounded bg-white/[0.03] animate-pulse" />
        <div className="h-4 w-11/12 rounded bg-white/[0.03] animate-pulse" />
        <div className="h-4 w-10/12 rounded bg-white/[0.03] animate-pulse" />
      </div>
      <div className="space-y-4 pt-2">
        <div className="h-4 w-full rounded bg-white/[0.03] animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-white/[0.03] animate-pulse" />
        <div className="h-4 w-4/5 rounded bg-white/[0.03] animate-pulse" />
      </div>
    </div>
  );
}

function SitePreview({ proxyUrl }: { proxyUrl: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setHtml(null);

    const token = localStorage.getItem(STORAGE_KEYS.token);
    fetch(proxyUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((body) => {
        if (!cancelled) {
          setHtml(body);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [proxyUrl]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-subtle)] bg-[var(--color-surface)] select-none">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--color-accent)]" />
        <span className="text-xs font-sans tracking-wide">Loading secure site preview…</span>
      </div>
    );
  }

  if (failed || !html) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center bg-[var(--color-surface)] select-none">
        <Globe className="w-10 h-10 opacity-20 text-[var(--color-text-subtle)]" />
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Site preview unavailable</p>
        <p className="text-xs text-[var(--color-text-subtle)] max-w-xs leading-relaxed">
          The page content could not be proxied securely. Switch to <strong>Reader View</strong> for the extracted text.
        </p>
      </div>
    );
  }

  return (
    <iframe
      title="Page preview"
      srcDoc={html}
      className="w-full h-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  );
}

export const BrowserFetchPage = memo(function BrowserFetchPage({
  tab,
  fetchView,
}: {
  tab: BrowserTab;
  fetchView: 'site' | 'reader';
}) {
  if (tab.status === 'error') {
    const botHint = tab.error?.toLowerCase().includes('bot');
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center max-w-md mx-auto bg-[var(--color-surface)]">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 border border-red-500/20">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Could not read this page</h3>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-4">{tab.error}</p>
        {botHint && (
          <div className="px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/90 leading-relaxed">
            Hint: Ask Construct to use the <strong>interactive browser</strong> (Browser Use) for sites that block automated text readers.
          </div>
        )}
      </div>
    );
  }

  if (tab.status === 'loading') {
    return (
      <div className="h-full relative bg-[var(--color-surface)]">
        <div className="absolute top-4 right-6 flex items-center gap-2 text-[11px] text-[var(--color-text-subtle)] select-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)]" />
          Loading page…
        </div>
        <FetchSkeleton />
      </div>
    );
  }

  if (fetchView === 'site' && tab.proxyUrl) {
    return <SitePreview proxyUrl={tab.proxyUrl} />;
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)]">
      <article className="max-w-3xl mx-auto px-8 py-10">
        {tab.pageTitle && (
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)] mb-3 leading-snug">
            {tab.pageTitle}
          </h1>
        )}
        
        {(tab.publishedTime || tab.url) && (
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--color-text-subtle)] mb-8 select-none border-b border-white/[0.06] pb-4">
            {tab.publishedTime && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {tab.publishedTime}
              </span>
            )}
            {tab.url && (
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                <a href={tab.url} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[var(--color-accent)] truncate max-w-sm">
                  {tab.url}
                </a>
              </span>
            )}
          </div>
        )}

        {tab.readerTruncated && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-[var(--color-warning-muted)] border border-[var(--color-warning)]/20 text-[11px] text-[var(--color-warning)]/90 flex items-start gap-2.5 shadow-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              <strong>Extracted content was truncated.</strong> Ask Construct to fetch a specific section of the page if you need to read more.
            </p>
          </div>
        )}

        <div className="prose prose-invert max-w-none text-sm leading-relaxed antialiased font-sans select-text">
          {tab.readerContent ? (
            <MarkdownRenderer content={tab.readerContent} />
          ) : (
            <p className="text-sm text-[var(--color-text-muted)] italic">No readable text content could be extracted from this page.</p>
          )}
        </div>
      </article>
    </div>
  );
});

