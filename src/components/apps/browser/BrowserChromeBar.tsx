import { memo, useCallback, useState } from 'react';
import { BookOpen, Check, Copy, Globe, Search, Server, Sparkles, StopCircle } from 'lucide-react';
import type { BrowserTab } from '@/stores/browserTabStore';

function displayUrl(tab: BrowserTab): string {
  if (tab.mode === 'search') return tab.query ? `Search: "${tab.query}"` : tab.title;
  if (tab.mode === 'arxiv') return tab.query ? `arXiv Search: "${tab.query}"` : tab.title;
  if (tab.mode === 'domain') return tab.domain ? `Domain Intel: ${tab.domain}` : tab.title;
  if (tab.mode === 'live') return tab.pageUrl || tab.url || tab.goal || 'Live Browser Use Session';
  try {
    const u = new URL(tab.url || '');
    return `${u.hostname}${u.pathname !== '/' ? u.pathname : ''}`;
  } catch {
    return tab.url || tab.title;
  }
}

function ModeIcon({ tab }: { tab: BrowserTab }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (tab.mode) {
    case 'search':
      return <Search className={`${cls} text-blue-400`} />;
    case 'arxiv':
      return <BookOpen className={`${cls} text-purple-400`} />;
    case 'domain':
      return <Server className={`${cls} text-[#2d6a5a]`} />;
    case 'live':
      return <Sparkles className={`${cls} text-amber-400`} />;
    default:
      return <Globe className={`${cls} text-sky-400`} />;
  }
}

const CHROME_BAR_CLASS =
  'shrink-0 flex items-center gap-2 px-4 py-2 min-h-[44px] surface-toolbar border-b border-[var(--color-border)] select-none';

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
  const [copied, setCopied] = useState(false);

  const copyUrl = useCallback(async () => {
    const target = tab?.url || tab?.pageUrl;
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* */ }
  }, [tab?.url, tab?.pageUrl]);

  if (!tab) {
    return (
      <div className={CHROME_BAR_CLASS}>
        <Globe className="w-3.5 h-3.5 text-[var(--color-text-subtle)] shrink-0" />
        <span className="text-[12px] text-[var(--color-text-subtle)] font-sans truncate">Construct browser</span>
      </div>
    );
  }

  const label = displayUrl(tab);
  const hasUrl = !!(tab.url || tab.pageUrl);
  const showFetchToggle = tab.mode === 'fetch' && tab.status === 'complete';
  const showStopLive = tab.mode === 'live' && onStopLive && tab.runPhase === 'live';

  return (
    <div className={CHROME_BAR_CLASS}>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <ModeIcon tab={tab} />
        <span className="truncate text-[12px] text-[var(--color-text-muted)] font-sans">{label}</span>
      </div>

      {hasUrl && (
        <button
          type="button"
          onClick={() => { void copyUrl(); }}
          className="shrink-0 p-1.5 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors"
          title="Copy link"
          aria-label="Copy link"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}

      <div className="shrink-0 flex items-center min-w-[148px] justify-end">
        {showFetchToggle ? (
          <div className="flex p-0.5 rounded-md bg-white/[0.02] border border-white/[0.06] text-[10px]">
            <button
              type="button"
              onClick={() => onFetchViewChange('site')}
              className={`px-3 py-1 rounded transition-colors duration-150 font-sans ${
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
              className={`px-3 py-1 rounded transition-colors duration-150 font-sans ${
                fetchView === 'reader'
                  ? 'bg-white/10 text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              Reader View
            </button>
          </div>
        ) : showStopLive ? (
          <button
            type="button"
            onClick={onStopLive}
            disabled={stoppingLive}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-red-500/30 bg-red-500/[0.08] text-[10px] font-sans text-red-400 font-medium hover:bg-red-500/15 disabled:opacity-50 transition-colors duration-150 shadow-sm"
          >
            <StopCircle className="w-3.5 h-3.5 animate-pulse" />
            Stop Run
          </button>
        ) : null}
      </div>
    </div>
  );
});
