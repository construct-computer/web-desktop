import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { SearchResultRow } from '@/components/apps/browser/SearchResultRow';
import type { WebPreviewData } from '@/stores/agentStore';

export function WebPreviewCard({
  preview,
  onOpen,
}: {
  preview: WebPreviewData;
  onOpen?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (preview.kind === 'search') {
    const results = preview.results || [];
    if (results.length === 0) return null;
    return (
      <div className="ml-7 rounded-md border border-white/[0.06] bg-white/[0.02] text-[11px] overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[var(--color-text-muted)]/60 hover:bg-white/[0.03]"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span>
            {preview.resultCount ?? results.length} result{(preview.resultCount ?? results.length) === 1 ? '' : 's'}
            {preview.query ? ` for "${preview.query.slice(0, 40)}${preview.query.length > 40 ? '…' : ''}"` : ''}
          </span>
          {onOpen && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpen(); } }}
              className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-blue-400/80 hover:text-blue-300"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Open
            </span>
          )}
        </button>
        {expanded && (
          <div className="px-2 pb-2 space-y-1.5 border-t border-white/[0.04]">
            {results.map((r, i) => (
              <SearchResultRow
                key={`${r.url}-${i}`}
                result={r}
                compact
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ml-7 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px]">
      {preview.pageTitle && (
        <div className="font-medium text-[var(--color-text-muted)]/75 truncate">{preview.pageTitle}</div>
      )}
      {preview.snippet && (
        <p className="text-[var(--color-text-muted)]/50 line-clamp-2 mt-0.5 leading-relaxed">{preview.snippet}</p>
      )}
      {preview.truncated && (
        <p className="text-[10px] text-amber-400/70 mt-1">Preview truncated — open for full reader view.</p>
      )}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-blue-400/80 hover:text-blue-300"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          Open in Browser
        </button>
      )}
    </div>
  );
}
