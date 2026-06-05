import { memo } from 'react';
import { ExternalLink, Search, AlertTriangle } from 'lucide-react';
import type { BrowserTab } from '@/stores/browserTabStore';

function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

function hostFromUrl(u: string): string {
  try { return new URL(u).hostname; } catch { return ''; }
}

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <div
      className="border-l-2 border-transparent pl-3.5 py-2 space-y-2 select-none"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2">
        <div className="w-3.5 h-3.5 rounded bg-white/[0.04] animate-pulse shrink-0" />
        <div className="h-3 w-1/4 rounded bg-white/[0.04] animate-pulse" />
        <div className="h-2.5 w-1/3 rounded bg-white/[0.02] animate-pulse" />
      </div>
      <div className="h-4 w-1/2 rounded bg-white/[0.05] animate-pulse" />
      <div className="h-3 w-full rounded bg-white/[0.03] animate-pulse" />
    </div>
  );
}

export const BrowserSearchPage = memo(function BrowserSearchPage({ tab }: { tab: BrowserTab }) {
  if (tab.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center select-none bg-[var(--color-surface)]">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm font-semibold text-red-400 mb-2">Search failed</p>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed">{tab.error}</p>
      </div>
    );
  }

  const loading = tab.status === 'loading';
  const query = tab.query || tab.title;
  const results = tab.results || [];

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-4 opacity-85 select-none">
          <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <Search className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
            Construct Search
          </span>
        </div>

        <div className="mb-6 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] shadow-sm select-none">
          <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-[var(--color-text)] font-sans font-medium truncate">{query}</span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} delay={i * 80} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-[var(--color-text-subtle)] uppercase tracking-wider mb-4 px-1 font-sans select-none opacity-80">
              {results.length === 0
                ? `No results for "${query}"`
                : `${results.length} result${results.length === 1 ? '' : 's'} found`}
            </p>
            <div className="space-y-4">
              {results.map((r, i) => {
                const host = hostFromUrl(r.url);
                return (
                  <a
                    key={`${r.url}-${i}`}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group border-l-2 border-transparent pl-3.5 pr-2 py-2 hover:border-blue-400 hover:bg-white/[0.015] -ml-4 rounded-r-lg transition-all duration-150 animate-[fadeIn_0.25s_ease-out_forwards]"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex flex-col gap-0.5">
                      {/* Top Row: Favicon, Hostname and Full URL */}
                      <div className="flex items-center gap-2 text-xs select-none">
                        {host && (
                          <img
                            src={faviconUrl(host)}
                            alt=""
                            className="w-3.5 h-3.5 rounded-sm opacity-85 shrink-0 group-hover:opacity-100 transition-opacity"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <span className="font-sans font-medium text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors truncate">{host}</span>
                        <span className="text-[var(--color-text-subtle)] text-[10px] truncate max-w-[250px] font-mono opacity-80">{r.url}</span>
                      </div>

                      {/* Middle Row: Title and Hover Underline */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <h3 className="text-[14px] font-medium text-sky-400 group-hover:text-sky-300 transition-colors group-hover:underline leading-snug truncate">
                          {r.title || r.url}
                        </h3>
                        <ExternalLink className="w-3 h-3 text-[var(--color-text-subtle)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>

                      {/* Bottom Row: Date prepended to Snippet */}
                      {r.snippet ? (
                        <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed mt-1 line-clamp-2 font-sans">
                          {r.date && (
                            <span className="text-[var(--color-text-subtle)] font-medium mr-1.5 select-none">
                              {r.date} —
                            </span>
                          )}
                          {r.snippet}
                        </p>
                      ) : (
                        r.date && (
                          <p className="text-[10px] text-[var(--color-text-subtle)] mt-1 font-sans select-none">
                            {r.date}
                          </p>
                        )
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

