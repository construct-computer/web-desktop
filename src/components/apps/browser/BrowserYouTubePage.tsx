import { memo } from 'react';
import { Play, Clock, Youtube, Loader2 } from 'lucide-react';
import type { BrowserTab } from '@/stores/browserTabStore';

function SkeletonLines() {
  return (
    <div className="space-y-3 pt-2 select-none">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-white/[0.03] animate-pulse" style={{ width: `${75 + (i % 3) * 8}%` }} />
      ))}
    </div>
  );
}

export const BrowserYouTubePage = memo(function BrowserYouTubePage({ tab }: { tab: BrowserTab }) {
  if (tab.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-[var(--color-surface)] select-none">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
          <Play className="w-5 h-5 text-red-500" />
        </div>
        <p className="text-sm font-semibold text-red-400 mb-2">Transcript unavailable</p>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed">{tab.error}</p>
      </div>
    );
  }

  const loading = tab.status === 'loading';
  const duration = tab.durationSeconds;
  const durationLabel = duration
    ? `${Math.floor(duration / 60)}m ${duration % 60}s`
    : null;

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shrink-0 select-none">
            <Youtube className="w-6 h-6 text-red-500" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--color-text)] leading-snug">
              {tab.pageTitle || `YouTube Video ${tab.videoId || ''}`}
            </h2>
            <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-subtle)] mt-1.5 font-mono select-none">
              {tab.videoId && (
                <span className="text-red-400 font-semibold">{tab.videoId}</span>
              )}
              {durationLabel && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {durationLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="h-px bg-white/[0.06] mb-8 select-none" />

        {loading ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-subtle)] select-none">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
              Loading transcript data…
            </div>
            <SkeletonLines />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-6 shadow-sm">
            <pre className="text-sm text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap font-sans font-normal select-text">
              {tab.transcript || 'No transcript content was returned.'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
});

