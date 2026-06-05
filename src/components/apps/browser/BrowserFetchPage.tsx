import { memo, useEffect, useState } from 'react';
import { AlertTriangle, Globe, Loader2 } from 'lucide-react';
import { ReaderMarkdown } from './ReaderMarkdown';
import { FetchReaderHeader } from './FetchReaderHeader';
import { StructuredDataViewer } from '@/components/ui/StructuredDataViewer';
import type { BrowserTab } from '@/stores/browserTabStore';
import { useBrowserTabStore } from '@/stores/browserTabStore';
import { STORAGE_KEYS } from '@/lib/constants';

type PreviewErrorKind = 'bot-blocked' | 'too-large' | 'unsupported-type' | 'generic';

function parsePreviewError(status: number, header: string | null, body: string): PreviewErrorKind {
  if (header === 'bot-blocked') return 'bot-blocked';
  if (header === 'too-large' || status === 413) return 'too-large';
  if (header === 'unsupported-type' || status === 415) return 'unsupported-type';
  if (/bot|cloudflare|incapsula|challenge/i.test(body)) return 'bot-blocked';
  return 'generic';
}

function FetchSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-12 space-y-6 select-none">
      <div className="space-y-3">
        <div className="h-7 w-5/6 rounded bg-black/[0.05] animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-black/[0.04] animate-pulse" />
      </div>
      <div className="h-px bg-black/[0.08] w-full" />
      <div className="space-y-4 pt-4">
        <div className="h-4 w-full rounded bg-black/[0.04] animate-pulse" />
        <div className="h-4 w-full rounded bg-black/[0.04] animate-pulse" />
        <div className="h-4 w-11/12 rounded bg-black/[0.04] animate-pulse" />
        <div className="h-4 w-10/12 rounded bg-black/[0.04] animate-pulse" />
      </div>
      <div className="space-y-4 pt-2">
        <div className="h-4 w-full rounded bg-black/[0.04] animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-black/[0.04] animate-pulse" />
        <div className="h-4 w-4/5 rounded bg-black/[0.04] animate-pulse" />
      </div>
    </div>
  );
}

function SitePreview({
  proxyUrl,
  tabId,
  hasReaderContent,
}: {
  proxyUrl: string;
  tabId: string;
  hasReaderContent: boolean;
}) {
  const setFetchView = useBrowserTabStore((s) => s.setFetchView);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [errorKind, setErrorKind] = useState<PreviewErrorKind>('generic');
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
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          const kind = parsePreviewError(res.status, res.headers.get('X-Preview-Error'), body);
          throw Object.assign(new Error(body || `HTTP ${res.status}`), { kind });
        }
        return res.text();
      })
      .then((body) => {
        if (!cancelled) {
          setHtml(body);
          setLoading(false);
        }
      })
      .catch((err: Error & { kind?: PreviewErrorKind }) => {
        if (!cancelled) {
          setFailed(true);
          setErrorKind(err.kind || 'generic');
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
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center bg-[var(--color-surface)] select-none max-w-md mx-auto">
        <Globe className="w-10 h-10 opacity-20 text-[var(--color-text-subtle)]" />
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Site preview unavailable</p>
        <p className="text-xs text-[var(--color-text-subtle)] leading-relaxed">
          {errorKind === 'bot-blocked'
            ? 'This page blocks automated previews. Reader view or the interactive browser may still work.'
            : errorKind === 'too-large'
              ? 'The page is too large to preview in Site view.'
              : 'The page could not be proxied securely.'}
        </p>
        <div className="flex flex-col gap-2 w-full mt-2">
          {hasReaderContent && (
            <button
              type="button"
              onClick={() => setFetchView(tabId, 'reader')}
              className="w-full px-4 py-2 rounded-lg text-xs font-medium bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/25 hover:bg-[var(--color-accent)]/25 transition-colors"
            >
              Open in Reader view
            </button>
          )}
          {errorKind === 'bot-blocked' && (
            <p className="text-[10px] text-amber-400/80 leading-relaxed">
              Ask Construct to use the <strong>interactive browser</strong> for full page rendering.
            </p>
          )}
        </div>
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
  dataView = 'visual',
}: {
  tab: BrowserTab;
  fetchView: 'site' | 'reader';
  dataView?: 'visual' | 'json';
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

  if (tab.contentFormat === 'json' && tab.structuredRaw) {
    return (
      <div className="h-full overflow-y-auto browser-read-pane">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10">
          <FetchReaderHeader tab={tab} />
          <div className="rounded-xl border border-white/[0.08] bg-black/[0.08] overflow-hidden min-h-[240px]">
            <StructuredDataViewer
              text={tab.structuredRaw}
              dataView={dataView}
              showSummary={false}
            />
          </div>
        </div>
      </div>
    );
  }

  if (fetchView === 'site' && tab.proxyUrl) {
    return (
      <SitePreview
        proxyUrl={tab.proxyUrl}
        tabId={tab.id}
        hasReaderContent={!!tab.readerContent}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto browser-read-pane">
      <article className="reader-article mx-auto px-6 sm:px-8 py-10">
        <FetchReaderHeader tab={tab} />

        <ReaderMarkdown
          content={tab.readerContent || ''}
          fullContent={tab.readerContentFull}
          truncated={tab.readerTruncated}
          remainingSections={tab.readerRemainingSections}
          pageTitle={tab.pageTitle}
          dedupeTitle={tab.readerDedupeTitle}
        />
      </article>
    </div>
  );
});
