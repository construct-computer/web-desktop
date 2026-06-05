import { memo } from 'react';
import type { BrowserTab } from '@/stores/browserTabStore';

function modeLabel(tab: BrowserTab | null, fetchView: 'site' | 'reader'): string | null {
  if (!tab) return null;
  switch (tab.mode) {
    case 'search': return 'Search';
    case 'fetch': return fetchView === 'site' ? 'Preview' : 'Reading';
    case 'live': return 'Live Use';
    case 'arxiv': return 'arXiv';
    case 'youtube': return 'YouTube';
    case 'domain': return 'Domain';
    default: return null;
  }
}

function modeClass(tab: BrowserTab | null): string {
  if (!tab) return '';
  if (tab.mode === 'live' && tab.runPhase === 'live') {
    return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  }
  if (tab.mode === 'fetch') {
    return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
  }
  if (tab.mode === 'search') {
    return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
  }
  if (tab.mode === 'youtube') {
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  }
  if (tab.mode === 'arxiv') {
    return 'bg-purple-500/10 text-purple-300 border-purple-500/20';
  }
  if (tab.mode === 'domain') {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }
  return 'bg-white/5 text-[var(--color-text-muted)] border-white/10';
}

export const BrowserModeStatusBar = memo(function BrowserModeStatusBar({
  tab,
  fetchView,
  pageTitle,
  connected,
}: {
  tab: BrowserTab | null;
  fetchView: 'site' | 'reader';
  pageTitle?: string;
  connected?: boolean;
}) {
  const label = modeLabel(tab, fetchView);
  const subtitle = tab?.progressLabel || tab?.pageTitle || pageTitle || '';

  return (
    <div className="shrink-0 flex items-center justify-between h-[24px] px-3.5 text-[10px] border-t border-[var(--color-border)] bg-[#0c0c0e]/40 backdrop-blur-md text-[var(--color-text-muted)] select-none">
      <span className="truncate mr-4 font-sans">{subtitle}</span>
      <div className="flex items-center gap-3.5 shrink-0">
        {tab?.mode === 'live' && typeof tab.stepCount === 'number' && (
          <span className="text-[10px] font-mono opacity-85 select-none tracking-wide">
            Step {tab.stepCount}
          </span>
        )}
        {label && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium border ${modeClass(tab)}`}>
            {tab?.mode === 'live' && tab.runPhase === 'live' && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
              </span>
            )}
            {label}
          </span>
        )}
        {connected !== undefined && (
          <span
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              connected 
                ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]' 
                : 'bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.8)]'
            }`}
            title={connected ? 'Daemon Agent Connected' : 'Daemon Agent Disconnected'}
          />
        )}
      </div>
    </div>
  );
});

