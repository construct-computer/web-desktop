import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, StopCircle, X,
} from 'lucide-react';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import type { BrowserTab } from '@/stores/browserTabStore';
import { TabFavicon, TabOverflowMenu, TAB_OVERFLOW_MENU_THRESHOLD } from './BrowserTabBar';

/* ── Contextual toggle pill (Reader/Site, Visual/JSON) ──────────────── */

function TogglePill({
  options,
}: {
  options: Array<{ id: string; label: string; active: boolean; onClick: () => void }>;
}) {
  return (
    <div className="flex p-0.5 rounded-md bg-white/[0.03] border border-white/[0.07] text-[10px] shrink-0">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={opt.onClick}
          className={`px-2.5 py-1 rounded transition-colors duration-150 font-sans ${
            opt.active
              ? 'bg-white/10 text-[var(--color-text)] shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Compact tab pill (favicon + title) ─────────────────────────────── */

function TabPill({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: BrowserTab;
  active: boolean;
  onSelect: (id: string) => void;
  onClose: (tab: BrowserTab) => void;
}) {
  const isLoading = tab.status === 'loading';
  const isError = tab.status === 'error';
  const isLiveActive = tab.mode === 'live' && tab.runPhase === 'live';

  return (
    <div
      style={{ minWidth: 44, maxWidth: active ? 188 : 156 }}
      className={[
        'group relative flex shrink-0 items-center h-7 rounded-lg text-[11px] cursor-pointer border transition-colors duration-150',
        active
          ? 'bg-black/[0.05] dark:bg-white/[0.06] text-[var(--color-text)] border-black/[0.06] dark:border-white/[0.08]'
          : 'bg-transparent text-[var(--color-text-muted)] border-transparent hover:bg-[var(--color-item-hover)] hover:text-[var(--color-text)]',
        isError ? 'text-red-400/90' : '',
      ].join(' ')}
      onClick={() => onSelect(tab.id)}
      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(tab); } }}
      title={tab.title}
    >
      <span className="flex items-center gap-1.5 flex-1 min-w-0 pl-2.5 pr-1">
        {isLoading
          ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[var(--color-accent)]" />
          : <TabFavicon tab={tab} active={active} />}
        <span className="truncate flex-1 font-sans">{tab.title}</span>
        {isLiveActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
        )}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(tab); }}
        className="shrink-0 w-5 h-5 mr-1 rounded-md flex items-center justify-center text-[var(--color-text-subtle)]
                   opacity-0 group-hover:opacity-100 hover:bg-white/[0.1] hover:text-[var(--color-text)] transition-all duration-150"
        title="Close tab"
        aria-label={`Close ${tab.title}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/* ── Single-row browser toolbar ─────────────────────────────────────── */

export const BrowserToolbar = memo(function BrowserToolbar({
  tabs,
  activeTab,
  activeTabId,
  onSelect,
  onClose,
  fetchView,
  onFetchViewChange,
  dataView,
  onDataViewChange,
  onStopLive,
  stoppingLive,
}: {
  tabs: BrowserTab[];
  activeTab: BrowserTab | null;
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (tab: BrowserTab) => void;
  fetchView: 'site' | 'reader';
  onFetchViewChange: (view: 'site' | 'reader') => void;
  dataView: 'visual' | 'json';
  onDataViewChange: (view: 'visual' | 'json') => void;
  onStopLive?: () => void;
  stoppingLive?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [stripOverflows, setStripOverflows] = useState(false);
  const setRowScrollEl = useHorizontalWheelScroll([tabs.length], { scrollTargetRef: scrollRef });

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setStripOverflows(el.scrollWidth > el.clientWidth + 2);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length, checkOverflow]);

  useEffect(() => {
    if (!activeTabId) return;
    const node = tabRefs.current.get(activeTabId);
    node?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [activeTabId, tabs.length]);

  const showOverflowMenu = tabs.length >= TAB_OVERFLOW_MENU_THRESHOLD || stripOverflows;

  // Contextual right-side action.
  const isLive = activeTab?.mode === 'live';
  const isJsonTab = activeTab?.mode === 'fetch' && activeTab.status === 'complete' && activeTab.contentFormat === 'json';
  const showFetchToggle = activeTab?.mode === 'fetch' && activeTab.status === 'complete' && !isJsonTab;
  const showStopLive = isLive && onStopLive && activeTab?.runPhase === 'live';

  return (
    <div
      ref={setRowScrollEl}
      className="shrink-0 flex items-center gap-1.5 h-10 px-2 surface-toolbar border-b border-[var(--color-border)] select-none min-w-0"
    >
      {/* Agent-owned tab strip. Tabs select views; they never navigate. */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-x-instant scrollbar-none"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              className="flex shrink-0"
            >
              <TabPill tab={tab} active={active} onSelect={onSelect} onClose={onClose} />
            </div>
          );
        })}
      </div>

      {showOverflowMenu && (
        <TabOverflowMenu
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}

      {/* Contextual action */}
      {isJsonTab ? (
        <TogglePill
          options={[
            { id: 'visual', label: 'Visual', active: dataView === 'visual', onClick: () => onDataViewChange('visual') },
            { id: 'json', label: 'JSON', active: dataView === 'json', onClick: () => onDataViewChange('json') },
          ]}
        />
      ) : showFetchToggle ? (
        <TogglePill
          options={[
            { id: 'reader', label: 'Reader', active: fetchView === 'reader', onClick: () => onFetchViewChange('reader') },
            { id: 'site', label: 'Site', active: fetchView === 'site', onClick: () => onFetchViewChange('site') },
          ]}
        />
      ) : showStopLive ? (
        <button
          type="button"
          onClick={onStopLive}
          disabled={stoppingLive}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-500/30
                     bg-red-500/[0.08] text-[10px] font-sans text-red-400 font-medium hover:bg-red-500/15
                     disabled:opacity-50 transition-colors duration-150"
        >
          <StopCircle className="w-3.5 h-3.5 animate-pulse" />
          {stoppingLive ? 'Stopping' : 'Stop'}
        </button>
      ) : null}
    </div>
  );
});
