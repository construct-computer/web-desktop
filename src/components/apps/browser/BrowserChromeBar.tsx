import { memo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Globe, Lock, RefreshCw, Search, StopCircle } from 'lucide-react';
import type { BrowserTab } from '@/stores/browserTabStore';

function displayUrl(tab: BrowserTab): string {
  if (tab.mode === 'search') return tab.query ? `Search: "${tab.query}"` : tab.title;
  if (tab.mode === 'arxiv') return tab.query ? `arXiv Search: "${tab.query}"` : tab.title;
  if (tab.mode === 'youtube') return tab.url || (tab.videoId ? `youtube.com/watch?v=${tab.videoId}` : 'YouTube');
  if (tab.mode === 'domain') return tab.domain ? `Domain Intel: ${tab.domain}` : tab.title;
  if (tab.mode === 'live') return tab.pageUrl || tab.url || tab.goal || 'Live Browser Use Session';
  try {
    const u = new URL(tab.url || '');
    return `${u.hostname}${u.pathname !== '/' ? u.pathname : ''}`;
  } catch {
    return tab.url || tab.title;
  }
}

function securityForUrl(url: string | undefined): 'secure' | 'insecure' | 'none' {
  if (!url) return 'none';
  try {
    return new URL(url).protocol === 'https:' ? 'secure' : 'insecure';
  } catch {
    return 'none';
  }
}

export const BrowserChromeBar = memo(function BrowserChromeBar({
  tab,
  fetchView,
  onFetchViewChange,
  onStopLive,
  stoppingLive,
}: {
  tab: BrowserTab | null;
  fetchView: 'site' | 'reader';
  onFetchViewChange: (view: 'site' | 'reader') => void;
  onStopLive?: () => void;
  stoppingLive?: boolean;
}) {
  const disabledNav = 'opacity-35 cursor-not-allowed hover:bg-transparent';

  if (!tab) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 surface-toolbar border-b border-[var(--color-border)] select-none">
        <div className="flex-1 h-[30px] px-3 flex items-center text-[12px] rounded-md shadow-inner bg-black/20 border border-[var(--color-border)]">
          <Globe className="w-3.5 h-3.5 text-[var(--color-text-subtle)] mr-2" />
          <span className="text-[var(--color-text-subtle)] font-sans">Construct browser</span>
        </div>
      </div>
    );
  }

  const url = tab.url;
  const security = tab.mode === 'fetch' || tab.mode === 'live' ? securityForUrl(url || tab.pageUrl) : 'none';
  const label = displayUrl(tab);

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 surface-toolbar border-b border-[var(--color-border)] select-none">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`p-1.5 rounded-md text-[var(--color-text-muted)] transition-colors ${disabledNav}`}
          title="Back navigation is handled automatically by the agent loop"
          aria-label="Go back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={`p-1.5 rounded-md text-[var(--color-text-muted)] transition-colors ${disabledNav}`}
          title="Forward navigation is handled automatically by the agent loop"
          aria-label="Go forward"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={`p-1.5 rounded-md text-[var(--color-text-muted)] transition-colors ${disabledNav}`}
          title="Reloading is handled automatically by the agent loop"
          aria-label="Reload page"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2 h-[30px] px-3 text-[11px] font-mono rounded-md shadow-inner bg-black/20 border border-[var(--color-border)] focus-within:border-[var(--color-accent)]/50 transition-all duration-150">
        {tab.mode === 'search' ? (
          <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        ) : tab.mode === 'arxiv' ? (
          <Search className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        ) : security === 'secure' ? (
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : security === 'insecure' ? (
          <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0 animate-pulse" />
        ) : (
          <Globe className="w-3.5 h-3.5 text-[var(--color-text-subtle)] shrink-0" />
        )}
        <span className="truncate text-[var(--color-text-muted)] flex-1">{label}</span>
        {security === 'secure' && (
          <span className="text-[9px] text-emerald-500/80 px-1 rounded bg-emerald-500/10 font-sans tracking-wide">
            Secure
          </span>
        )}
      </div>

      {tab.mode === 'fetch' && tab.status === 'complete' && (
        <div className="shrink-0 flex p-0.5 rounded-md bg-white/[0.02] border border-white/[0.06] text-[10px]">
          <button
            type="button"
            onClick={() => onFetchViewChange('site')}
            className={`px-3 py-1 rounded transition-all duration-150 font-sans ${
              fetchView === 'site'
                ? 'bg-white/10 text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Site View
          </button>
          <button
            type="button"
            onClick={() => onFetchViewChange('reader')}
            className={`px-3 py-1 rounded transition-all duration-150 font-sans ${
              fetchView === 'reader'
                ? 'bg-white/10 text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Reader View
          </button>
        </div>
      )}

      {tab.mode === 'live' && onStopLive && tab.runPhase === 'live' && (
        <button
          type="button"
          onClick={onStopLive}
          disabled={stoppingLive}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-red-500/30 bg-red-500/[0.08] text-[10px] font-sans text-red-400 font-medium hover:bg-red-500/15 disabled:opacity-50 transition-all duration-150 shadow-sm"
        >
          <StopCircle className="w-3.5 h-3.5 animate-pulse" />
          Stop Run
        </button>
      )}
    </div>
  );
});

