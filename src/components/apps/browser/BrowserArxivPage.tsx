import { memo } from 'react';
import { BookOpen, ExternalLink, FileText, Calendar, Users, AlertTriangle } from 'lucide-react';
import type { BrowserTab } from '@/stores/browserTabStore';

function SkeletonPaper() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 space-y-3">
      <div className="h-4 w-4/5 rounded bg-black/[0.05] dark:bg-white/[0.05] animate-pulse" />
      <div className="h-3 w-1/3 rounded bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
      <div className="h-3 w-full rounded bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
    </div>
  );
}

export const BrowserArxivPage = memo(function BrowserArxivPage({ tab }: { tab: BrowserTab }) {
  if (tab.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-[var(--color-surface)] select-none">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm font-semibold text-red-400 mb-2">arXiv search failed</p>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed">{tab.error}</p>
      </div>
    );
  }

  const loading = tab.status === 'loading';
  const papers = tab.papers || [];

  return (
    <div className="h-full overflow-y-auto browser-read-pane">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center gap-2.5 mb-8 opacity-90 select-none">
          <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center border border-purple-500/20">
            <BookOpen className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              arXiv Database
            </h2>
            <p className="text-[10px] text-[var(--color-text-subtle)] mt-0.5 font-mono">{tab.query || tab.title}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonPaper key={i} />)}
          </div>
        ) : papers.length === 0 ? (
          <div className="text-center py-10 select-none">
            <BookOpen className="w-10 h-10 text-[var(--color-text-subtle)] opacity-10 mx-auto mb-2" />
            <p className="text-xs text-[var(--color-text-muted)]">No research papers found matching query.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {papers.map((p, i) => (
              <article
                key={p.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 hover:border-purple-500/40 hover:bg-[var(--color-item-hover)] hover:shadow-md transition-all duration-200 animate-[fadeIn_0.25s_ease-out_forwards]"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <h3 className="text-sm font-semibold text-[var(--color-text)] leading-snug hover:text-purple-400 transition-colors">
                  {p.title}
                </h3>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-subtle)] mt-2 font-mono">
                  <span className="text-purple-400 font-semibold">{p.id}</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {p.published}
                  </span>
                </div>

                <div className="flex items-start gap-1.5 text-[11px] text-[var(--color-text-muted)] mt-3">
                  <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-purple-400/80" />
                  <p className="leading-relaxed">{p.authors.join(', ')}</p>
                </div>

                <p className="text-[12px] text-[var(--color-text-muted)] mt-3 leading-relaxed line-clamp-4 select-text">
                  {p.summary}
                </p>

                <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                  <a
                    href={p.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-500/20 bg-purple-500/[0.05] text-[10px] font-sans font-medium text-purple-400 hover:bg-purple-500/10 transition-colors shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Open PDF Document
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

