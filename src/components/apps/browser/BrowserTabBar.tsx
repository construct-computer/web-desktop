import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronDown, Globe, Loader2, Search, Server, Sparkles, X } from 'lucide-react';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { faviconUrlForHost, hostFromUrl } from '@/lib/favicon';
import { Z_INDEX } from '@/lib/constants';
import type { BrowserTab, BrowserTabMode } from '@/stores/browserTabStore';

export const TAB_MIN_WIDTH = 96;
export const TAB_MAX_WIDTH = 180;
export const TAB_ACTIVE_MAX = 220;
export const TAB_OVERFLOW_MENU_THRESHOLD = 8;

const OVERFLOW_MENU_WIDTH = 256;

function TabModeIcon({ mode, active }: { mode: BrowserTabMode; active: boolean }) {
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
    case 'domain':
      return <Server className={`${cls} ${active ? 'text-[#2d6a5a]' : 'text-[#2d6a5a]/70'}`} />;
    default:
      return <Globe className={`${cls} ${active ? 'text-sky-400' : 'text-sky-400/70'}`} />;
  }
}

function TabFavicon({ tab, active }: { tab: BrowserTab; active: boolean }) {
  const [failed, setFailed] = useState(false);
  const pageUrl = tab.url || tab.pageUrl;
  const host = hostFromUrl(pageUrl);

  if ((tab.mode === 'fetch' || tab.mode === 'live') && host && !failed) {
    return (
      <img
        src={faviconUrlForHost(host)}
        alt=""
        className="w-3.5 h-3.5 rounded-sm shrink-0"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return <TabModeIcon mode={tab.mode} active={active} />;
}

function TabOverflowMenu({
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter((t) => {
      const host = hostFromUrl(t.url || t.pageUrl);
      return t.title.toLowerCase().includes(q) || host.toLowerCase().includes(q);
    });
  }, [tabs, query]);

  const updateMenuPos = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - OVERFLOW_MENU_WIDTH),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    window.addEventListener('resize', updateMenuPos);
    window.addEventListener('scroll', updateMenuPos, true);
    return () => {
      window.removeEventListener('resize', updateMenuPos);
      window.removeEventListener('scroll', updateMenuPos, true);
    };
  }, [open, updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target)
        || triggerRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  return (
    <div className="relative shrink-0 h-full flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-t-md text-[10px] text-[var(--color-text-muted)]
                   hover:bg-white/[0.05] hover:text-[var(--color-text)] border border-transparent
                   hover:border-white/[0.06] transition-colors"
        title="All tabs"
        aria-expanded={open}
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        <span>{tabs.length}</span>
      </button>
      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed grid grid-rows-[auto_minmax(0,1fr)] rounded-lg glass-popover menubar-menu-popover
                     border border-[var(--color-border)] shadow-[var(--shadow-menu)] overflow-hidden pointer-events-auto"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            width: OVERFLOW_MENU_WIDTH,
            height: 'min(288px, 50vh)',
            zIndex: Z_INDEX.menu,
          }}
        >
          <div className="p-2 border-b border-black/[0.08]">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tabs…"
              className="w-full px-2 py-1 text-[11px] rounded-md bg-black/[0.06] border border-black/[0.1]
                         text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] outline-none"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto scrollbar-none min-h-0 overscroll-contain py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-[var(--color-text-subtle)]">No matching tabs</p>
            ) : (
              filtered.map((tab) => {
                const active = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] group/row
                      ${active ? 'bg-[var(--color-accent)]/10 text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:bg-black/[0.05]'}`}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      onClick={() => {
                        onSelect(tab.id);
                        closeMenu();
                      }}
                    >
                      <TabFavicon tab={tab} active={active} />
                      <span className="truncate">{tab.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onClose(tab)}
                      className="shrink-0 p-0.5 rounded opacity-0 group-hover/row:opacity-60 hover:opacity-100 hover:bg-black/[0.08]"
                      aria-label={`Close ${tab.title}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
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

  if (tabs.length === 0) return null;

  return (
    <div
      ref={setRowScrollEl}
      className="shrink-0 flex items-stretch h-9 gap-0 px-2 border-b border-[var(--color-border)] surface-toolbar shadow-sm select-none min-w-0 overflow-y-hidden"
    >
      <div
        ref={scrollRef}
        className="flex items-stretch gap-1 flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-x-instant scrollbar-none"
      >
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const isLoading = tab.status === 'loading';
            const isError = tab.status === 'error';
            const maxW = active ? TAB_ACTIVE_MAX : TAB_MAX_WIDTH;
            return (
              <div
                key={tab.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(tab.id, node);
                  else tabRefs.current.delete(tab.id);
                }}
                style={{ minWidth: TAB_MIN_WIDTH, maxWidth: maxW }}
                className={[
                  'group relative flex shrink-0 items-center gap-0.5 h-full rounded-t-lg text-[11px] transition-colors duration-150 cursor-pointer border border-transparent',
                  active
                    ? 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] z-10 shadow-[inset_0_-2px_0_var(--color-accent)]'
                    : 'bg-white/[0.015] text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]',
                  isError ? 'text-red-400/90' : '',
                ].join(' ')}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onClose(tab);
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 text-left"
                  title={tab.title}
                >
                  <TabFavicon tab={tab} active={active} />
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
      {showOverflowMenu && (
        <TabOverflowMenu
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </div>
  );
});
