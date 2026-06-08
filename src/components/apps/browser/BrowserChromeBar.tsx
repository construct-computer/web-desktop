import { memo, useCallback, useState, useEffect } from 'react';
import { BookOpen, Check, Copy, Globe, Search, Server, Sparkles, StopCircle, ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import type { BrowserTab } from '@/stores/browserTabStore';
import { useBrowserTabStore } from '@/stores/browserTabStore';
import { browserWS } from '@/services/websocket';

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

const TOGGLE_BTN = 'px-3 py-1 rounded transition-colors duration-150 font-sans';
const TOGGLE_ACTIVE = 'bg-white/10 text-[var(--color-text)] shadow-sm';
const TOGGLE_IDLE = 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]';

const CHROME_BAR_CLASS =
  'shrink-0 flex items-center gap-2 px-4 py-2 min-h-[44px] surface-toolbar border-b border-[var(--color-border)] select-none';

function TogglePill({
  options,
}: {
  options: Array<{ id: string; label: string; active: boolean; onClick: () => void }>;
}) {
  return (
    <div className="flex p-0.5 rounded-md bg-white/[0.02] border border-white/[0.06] text-[10px]">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={opt.onClick}
          className={`${TOGGLE_BTN} ${opt.active ? TOGGLE_ACTIVE : TOGGLE_IDLE}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export const BrowserChromeBar = memo(function BrowserChromeBar({
  tab,
  fetchView,
  onFetchViewChange,
  dataView = 'visual',
  onDataViewChange,
  onStopLive,
  stoppingLive,
}: {
  tab: BrowserTab | null;
  fetchView: 'site' | 'reader';
  onFetchViewChange: (view: 'site' | 'reader') => void;
  dataView?: 'visual' | 'json';
  onDataViewChange?: (view: 'visual' | 'json') => void;
  onStopLive?: () => void;
  stoppingLive?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [inputUrl, setInputUrl] = useState(tab?.url || '');

  useEffect(() => {
    setInputUrl(tab?.url || '');
  }, [tab?.id, tab?.url]);

  const copyUrl = useCallback(async () => {
    const target = tab?.url || tab?.pageUrl;
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* */ }
  }, [tab?.url, tab?.pageUrl]);

  const handleReload = useCallback(() => {
    if (!tab) return;
    if (tab.mode === 'live') {
      const daemonTabId = tab.id.startsWith('tab_live_') ? null : tab.id;
      browserWS.sendAction(daemonTabId ? { action: 'refresh', tabId: daemonTabId } : { action: 'refresh' });
    } else if (tab.url) {
      useBrowserTabStore.getState().navigateTab(tab.id, tab.url);
    }
  }, [tab]);

  const handleBack = useCallback(() => {
    if (!tab) return;
    if (tab.mode === 'live') {
      const daemonTabId = tab.id.startsWith('tab_live_') ? null : tab.id;
      browserWS.sendAction(daemonTabId ? { action: 'back', tabId: daemonTabId } : { action: 'back' });
    }
  }, [tab]);

  const handleForward = useCallback(() => {
    if (!tab) return;
    if (tab.mode === 'live') {
      const daemonTabId = tab.id.startsWith('tab_live_') ? null : tab.id;
      browserWS.sendAction(daemonTabId ? { action: 'forward', tabId: daemonTabId } : { action: 'forward' });
    }
  }, [tab]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const targetUrl = inputUrl.trim();
      if (!targetUrl) return;
      let finalUrl = targetUrl;
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }
      if (tab) {
        useBrowserTabStore.getState().navigateTab(tab.id, finalUrl);
      }
      e.currentTarget.blur();
    }
  }, [inputUrl, tab]);

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
  const isJsonTab = tab.mode === 'fetch' && tab.status === 'complete' && tab.contentFormat === 'json';
  const showFetchToggle = tab.mode === 'fetch' && tab.status === 'complete' && !isJsonTab;
  const showStopLive = tab.mode === 'live' && onStopLive && tab.runPhase === 'live';

  const isLive = tab.mode === 'live';
  const canGoBack = isLive;
  const canGoForward = isLive;

  return (
    <div className={CHROME_BAR_CLASS}>
      <div className="shrink-0 flex items-center gap-1 border-r border-[var(--color-border)] pr-2 select-none">
        <button
          type="button"
          onClick={handleBack}
          disabled={!canGoBack}
          className="p-1 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-white/[0.06] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleForward}
          disabled={!canGoForward}
          className="p-1 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-white/[0.06] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
          title="Forward"
          aria-label="Forward"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleReload}
          className="p-1 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors"
          title="Reload"
          aria-label="Reload"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1 rounded-md bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] focus-within:border-[var(--color-accent)]/50 focus-within:bg-black/[0.05] dark:focus-within:bg-white/[0.05] transition-all">
        <ModeIcon tab={tab} />
        {tab.mode !== 'live' ? (
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={(e) => e.target.select()}
            placeholder="Type a URL to browse..."
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12px] text-[var(--color-text-muted)] focus:text-[var(--color-text)] font-sans"
            spellCheck={false}
          />
        ) : (
          <span className="truncate text-[12px] text-[var(--color-text-muted)] font-sans">{label}</span>
        )}
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

      <div className="shrink-0 flex items-center gap-2 min-w-[148px] justify-end">
        {isJsonTab && onDataViewChange ? (
          <>
            <TogglePill
              options={[
                { id: 'visual', label: 'Visual', active: dataView === 'visual', onClick: () => onDataViewChange('visual') },
                { id: 'json', label: 'JSON', active: dataView === 'json', onClick: () => onDataViewChange('json') },
              ]}
            />
          </>
        ) : showFetchToggle ? (
          <TogglePill
            options={[
              { id: 'site', label: 'Site View', active: fetchView === 'site', onClick: () => onFetchViewChange('site') },
              { id: 'reader', label: 'Reader View', active: fetchView === 'reader', onClick: () => onFetchViewChange('reader') },
            ]}
          />
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
