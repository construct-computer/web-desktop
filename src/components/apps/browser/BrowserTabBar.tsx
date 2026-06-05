import { memo } from 'react';
import { BookOpen, Globe, Loader2, Search, Server, Sparkles, Play, X } from 'lucide-react';
import type { BrowserTab, BrowserTabMode } from '@/stores/browserTabStore';

function TabIcon({ mode, active }: { mode: BrowserTabMode; active: boolean }) {
  const cls = 'w-3.5 h-3.5 shrink-0 transition-colors';
  switch (mode) {
    case 'search':
      return <Search className={`${cls} ${active ? 'text-blue-400' : 'text-blue-400/70'}`} />;
    case 'fetch':
      return <Globe className={`${cls} ${active ? 'text-sky-400' : 'text-sky-400/70'}`} />;
    case 'live':
      return <Sparkles className={`${cls} ${active ? 'text-amber-400' : 'text-amber-400/70'}`} />;
    case 'arxiv':
      return <BookOpen className={`${cls} ${active ? 'text-purple-400' : 'text-purple-400/70'}`} />;
    case 'youtube':
      return <Play className={`${cls} ${active ? 'text-red-500' : 'text-red-500/70'}`} />;
    case 'domain':
      return <Server className={`${cls} ${active ? 'text-emerald-400' : 'text-emerald-400/70'}`} />;
    default:
      return <Globe className={`${cls} ${active ? 'text-sky-400' : 'text-sky-400/70'}`} />;
  }
}

export const BrowserTabBar = memo(function BrowserTabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
}: {
  tabs: BrowserTab[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
  onClose: (tab: BrowserTab) => void;
}) {
  if (tabs.length === 0) return null;

  return (
    <div className="shrink-0 flex items-end gap-1 px-3 pt-2 pb-0 overflow-x-auto border-b border-[var(--color-border)] surface-toolbar scrollbar-none shadow-sm select-none">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const isLoading = tab.status === 'loading';
        const isError = tab.status === 'error';
        return (
          <div
            key={tab.id}
            className={[
              'group relative flex items-center gap-0.5 max-w-[180px] min-w-[110px] rounded-t-lg text-[11px] transition-all duration-200 ease-out cursor-pointer',
              active
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] border border-b-0 border-[var(--color-border)] -mb-px z-10 font-medium shadow-[0_-2px_10px_rgba(0,0,0,0.12)]'
                : 'bg-white/[0.015] text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)] border border-transparent hover:border-white/[0.04]',
              isError ? 'text-red-400/90 border-red-500/20' : '',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 text-left"
              title={tab.title}
            >
              <TabIcon mode={tab.mode} active={active} />
              <span className="truncate flex-1 font-sans">{tab.title}</span>
              {isLoading && (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin text-[var(--color-accent)] opacity-80" />
              )}
              {tab.mode === 'live' && tab.runPhase === 'live' && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab);
              }}
              className="shrink-0 w-5 h-5 mr-1 rounded-md flex items-center justify-center
                         text-[var(--color-text-subtle)] opacity-40 group-hover:opacity-100
                         hover:bg-white/[0.08] hover:text-[var(--color-text)] transition-all duration-150"
              title="Close tab"
              aria-label={`Close ${tab.title}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
});

