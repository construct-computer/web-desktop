/**
 * Spotlight — Polished agent chat interface with sidebar.
 *
 * Toggled via Ctrl+Space. Large floating glass panel with:
 * - Left sidebar: chat history, new chat button
 * - Right: message list (scrollable) + input at bottom
 *
 * Desktop: persistent header (session title, sidebar, close), default size
 * with optional width/height from localStorage, Tab focus loop inside the
 * panel, Ctrl+Shift+B toggles the session list.
 *
 * Sub-components live in ./spotlight/ directory.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftOpen, PanelLeftClose, X, Sparkles, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { openSettingsToSection } from '@/lib/settingsNav';
import { hasAgentAccess } from '@/lib/plans';
import { SpotlightSidebar } from './spotlight/SpotlightSidebar';
import { SpotlightInput } from './spotlight/SpotlightInput';
import { MessageList } from './spotlight/MessageList';

const SPOTLIGHT_DESKTOP_SIZE_KEY = 'construct:spotlight-desktop-size';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([type="hidden"])',
].join(',');

function readDesktopPanelSize(): { w: number; h: number | null } {
  if (typeof globalThis.window === 'undefined') return { w: 960, h: null };
  try {
    const raw = globalThis.localStorage.getItem(SPOTLIGHT_DESKTOP_SIZE_KEY);
    if (!raw) return { w: 960, h: null };
    const p = JSON.parse(raw) as { w?: unknown; h?: unknown };
    const w = Math.min(1200, Math.max(480, Math.round(Number(p.w)) || 960));
    if (p.h == null || p.h === 0) return { w, h: null };
    const h = Math.max(320, Math.min(900, Math.round(Number(p.h)) || 0)) || null;
    return { w, h: h == null || h < 320 ? null : h };
  } catch {
    return { w: 960, h: null };
  }
}

function listFocusableInPanel(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.closest('[aria-hidden="true"]') || el.closest('[inert]') || el.hasAttribute('data-focus-guard')) return false;
      const p = getComputedStyle(el).position;
      if (p !== 'fixed' && el.offsetParent === null) return false;
      return !el.hasAttribute('disabled') && (el as HTMLInputElement).type !== 'hidden';
    },
  );
}

/**
 * Mobile bottom-sheet grab handle — pointer drives sheet translateY to dismiss.
 * Not shown on desktop (close via backdrop, Escape, or window chrome).
 * Release past threshold animates off-screen then closes; otherwise springs back.
 */
function SpotlightDragHandle({
  onDragStart,
  onDragY,
  onDragEnd,
}: {
  onDragStart: () => void;
  onDragY: (dy: number) => void;
  onDragEnd: (dy: number) => void;
}) {
  const startY = useRef<number | null>(null);
  const lastDy = useRef(0);

  const finish = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (startY.current === null) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* not capturing */
      }
      startY.current = null;
      onDragEnd(lastDy.current);
    },
    [onDragEnd],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      startY.current = e.clientY;
      lastDy.current = 0;
      onDragStart();
      onDragY(0);
    },
    [onDragStart, onDragY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (startY.current === null) return;
      const dy = Math.max(0, e.clientY - startY.current);
      lastDy.current = dy;
      onDragY(dy);
    },
    [onDragY],
  );

  return (
    <div
      className="absolute top-0 left-0 right-0 z-40 flex justify-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <div
        className="pointer-events-none h-[5px] w-11 rounded-full border border-white/20 bg-white/35 dark:border-white/15 dark:bg-white/25"
        aria-hidden
      />
    </div>
  );
}

export function Spotlight() {
  const open = useWindowStore(s => s.spotlightOpen);
  const closeSpotlight = useWindowStore(s => s.closeSpotlight);
  const userPlan = useAuthStore(s => s.user?.plan);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const chatSessions = useComputerStore(s => s.chatSessions);
  const sessionTitle = useMemo(
    () => chatSessions.find(s => s.key === activeSessionKey)?.title || 'Chats',
    [chatSessions, activeSessionKey],
  );
  const hasAccess = hasAgentAccess(userPlan);
  const isMobile = useIsMobile();

  const [animating, setAnimating] = useState(false);
  const [show, setShow] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /** Sheet vertical pull from handle (px), 0 = resting — mobile bottom sheet only */
  const [sheetDragPx, setSheetDragPx] = useState(0);
  /** No CSS transition while pointer is down so the sheet tracks 1:1 */
  const [sheetDragLive, setSheetDragLive] = useState(false);
  const sheetInnerRef = useRef<HTMLDivElement>(null);
  const closeAfterSlideRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [panelW] = useState(() => readDesktopPanelSize().w);
  const [panelH] = useState<number | null>(() => readDesktopPanelSize().h);

  const wClampedDesktop = useMemo(() => {
    if (typeof globalThis.window === 'undefined') return Math.max(480, Math.min(1200, panelW));
    const cap = globalThis.window.innerWidth - 48;
    return Math.min(1200, Math.max(480, Math.min(panelW, cap)));
  }, [panelW]);

  // ── Drag-and-drop on the panel ────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const onPanelDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer?.types.includes('Files')) setDragOver(true);
  }, []);
  const onPanelDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const onPanelDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  }, []);
  const onPanelDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      // Dispatch to the SpotlightInput via a custom event
      window.dispatchEvent(new CustomEvent('spotlight-drop-files', { detail: Array.from(files) }));
    }
  }, []);

  // ── Open/close animation (Zustand `open` → local animation state) ─────
  /* eslint-disable react-hooks/set-state-in-effect -- portal visibility + sheet spring; driven by `open` */
  useEffect(() => {
    if (open) {
      setSidebarOpen(false);
      setSheetDragPx(0);
      setSheetDragLive(false);
      closeAfterSlideRef.current = false;
      setShow(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      setSheetDragPx(0);
      setSheetDragLive(false);
      closeAfterSlideRef.current = false;
      const t = setTimeout(() => setShow(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onSheetDragY = useCallback((dy: number) => {
    setSheetDragPx(dy);
  }, []);

  const onSheetDragEnd = useCallback(
    (dy: number) => {
      setSheetDragLive(false);
      const h = sheetInnerRef.current?.offsetHeight ?? 560;
      const threshold = Math.max(96, Math.round(h * 0.2));
      if (dy >= threshold) {
        closeAfterSlideRef.current = true;
        const off =
          typeof globalThis.innerHeight === 'number'
            ? Math.max(h + 80, globalThis.innerHeight)
            : h + 80;
        setSheetDragPx(off);
      } else {
        setSheetDragPx(0);
      }
    },
    [],
  );

  const requestClose = useCallback(() => {
    if (
      isMobile &&
      (globalThis.window.history.state as { __constructSpotlight?: number } | null)
        ?.__constructSpotlight
    ) {
      globalThis.window.history.back();
    } else {
      closeSpotlight();
    }
  }, [isMobile, closeSpotlight]);

  // Mobile: one history entry so the OS / browser "back" closes the sheet like a modal.
  useEffect(() => {
    if (!isMobile || !open) return;
    const state: { __constructSpotlight: number } = { __constructSpotlight: 1 };
    globalThis.window.history.pushState(
      state,
      '',
      globalThis.window.location.href,
    );
    const onPop = () => { closeSpotlight(); };
    globalThis.window.addEventListener('popstate', onPop);
    return () => { globalThis.window.removeEventListener('popstate', onPop); };
  }, [isMobile, open, closeSpotlight]);

  const focusReturnRef = useRef<HTMLElement | null>(null);
  // Capture the opener *before* children auto-focus the textarea (layout, before useEffect in children).
  useLayoutEffect(() => {
    if (!open) {
      const el = focusReturnRef.current;
      focusReturnRef.current = null;
      if (el && document.body.contains(el)) {
        queueMicrotask(() => { el.focus(); });
      }
      return;
    }
    focusReturnRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  // Close, sidebar toggle, focus trap (desktop)
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (!isMobile && (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setSidebarOpen(s => !s);
        return;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, requestClose, isMobile]);

  const onPanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isMobile || e.key !== 'Tab' || !panelRef.current) return;
      const list = listFocusableInPanel(panelRef.current);
      if (list.length < 1) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [isMobile],
  );

  const onSheetInnerTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== 'transform') return;
      if (closeAfterSlideRef.current) {
        closeAfterSlideRef.current = false;
        requestClose();
      }
    },
    [requestClose],
  );

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1300]">
      <style>{`
        @keyframes spt-in {
          from { opacity: 0; transform: scale(0.98) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className={`absolute inset-0 spotlight-scrim transition-opacity duration-200 ease-out ${animating ? 'opacity-100' : 'opacity-0'}`}
        onClick={requestClose}
      />

      {/* Centering wrapper */}
      <div
        className={cn(
          "absolute inset-0 flex pointer-events-none",
          isMobile ? "items-end justify-center" : "items-center justify-center"
        )}
        style={{ zIndex: 1310 }}
      >
      <div
        ref={panelRef}
        onKeyDown={onPanelKeyDown}
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden transition-all duration-300 ease-out",
          isMobile
              ? "w-full rounded-t-lg"
            : "rounded-2xl max-w-[min(1200px,calc(100vw-48px))]",
          animating 
            ? (isMobile ? "translate-y-0 opacity-100" : "opacity-100 scale-100")
            : (isMobile ? "translate-y-full opacity-100" : "opacity-0 scale-[0.97]")
        )}
        style={
          isMobile
            ? { height: 'calc(100dvh - 10px)' }
            : {
                width: wClampedDesktop,
                minHeight: 400,
                ...(panelH == null
                  ? { height: '70vh', maxHeight: 720 }
                  : { height: panelH, maxHeight: 'min(92vh, 900px)' }),
              }
        }
      >
        <div
          ref={sheetInnerRef}
          className="min-h-0 flex flex-1 flex-col overflow-hidden"
          style={{
            transform: `translateY(${sheetDragPx}px)`,
            transition: sheetDragLive
              ? 'none'
              : 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
          onTransitionEnd={onSheetInnerTransitionEnd}
        >
        <div
          onDragEnter={onPanelDragEnter}
          onDragOver={onPanelDragOver}
          onDragLeave={onPanelDragLeave}
          onDrop={onPanelDrop}
          className={cn(
            'relative min-h-0 flex flex-1 flex-col overflow-hidden glass-window spotlight-glass-window ring-1 ring-black/5 dark:ring-white/8',
            isMobile
              ? 'rounded-t-lg rounded-b-none border border-b-0 border-white/30 shadow-none dark:border-white/[0.1]'
              : 'rounded-2xl border border-white/30 shadow-[0_24px_80px_rgba(0,0,0,0.22),0_12px_24px_rgba(0,0,0,0.12)] dark:border-white/[0.1]',
          )}
        >
          {isMobile && (
            <SpotlightDragHandle
              onDragStart={() => setSheetDragLive(true)}
              onDragY={onSheetDragY}
              onDragEnd={onSheetDragEnd}
            />
          )}

          {/* Drag overlay */}
          {dragOver && (
            <div
              className={cn(
                'absolute inset-0 z-50 glass-drawer border-2 border-dashed border-[var(--color-accent)] flex items-center justify-center pointer-events-none',
                isMobile ? 'rounded-t-lg' : 'rounded-2xl',
              )}
            >
              <div className="flex flex-col items-center gap-1.5 text-[var(--color-accent)]">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-sm font-semibold">Drop files to attach</span>
              </div>
            </div>
          )}

          {/* Sidebar — collapsible.
              Mobile: full-width overlay that slides over the chat (the sidebar
              dwarfs the chat area at 240/~375px otherwise).
              Desktop: left column beside chat (row), not above it, so the main
              area fills height and the empty state can center. */}
          {isMobile && (
            <>
              {sidebarOpen && (
                <div
                  className="absolute inset-0 z-40 bg-black/30 transition-opacity"
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              <div
                className={`absolute inset-y-0 left-0 z-40 w-[min(320px,85vw)] transition-transform duration-200 ease-out glass-drawer ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
              >
                <SpotlightSidebar />
              </div>
            </>
          )}

          <div
            className={cn('flex-1 min-h-0 min-w-0 flex', isMobile ? 'flex-col' : 'flex-row')}
          >
            {!isMobile && (
              <div
                className={`shrink-0 transition-[width] duration-200 ease-out overflow-hidden ${sidebarOpen ? 'w-[240px]' : 'w-0'}`}
              >
                <SpotlightSidebar />
              </div>
            )}

            {/* Chat area */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative">
            {hasAccess ? (
              <>
                {isMobile && (
                  <div
                    className="shrink-0 z-30 flex min-h-0 items-center gap-2 border-b border-white/[0.08] bg-white/[0.02] pl-1 pr-3"
                    style={{
                      // Drag handle is absolutely positioned; reserve space for pill + status bar.
                      paddingTop: 'max(0.4rem, calc(2.25rem + env(safe-area-inset-top, 0px)))',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(true)}
                      className="touch-manipulation rounded-lg p-2.5 text-[var(--color-text-muted)]/80 active:bg-white/10"
                      aria-label="Open chat history and sessions"
                    >
                      <PanelLeftOpen className="h-5 w-5" />
                    </button>
                    <span
                      className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--color-text)]"
                      title={sessionTitle}
                    >
                      {sessionTitle}
                    </span>
                    {(!userPlan || userPlan === 'free') && (
                      <button
                        type="button"
                        onClick={() => {
                          closeSpotlight();
                          if (
                            (globalThis.window.history.state as { __constructSpotlight?: number } | null)
                              ?.__constructSpotlight
                          ) {
                            globalThis.window.history.back();
                          }
                          openSettingsToSection('subscription');
                        }}
                        className="relative flex h-7 shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-amber-500/30 surface-control pl-1.5 pr-2 text-amber-600 transition-all active:scale-95 dark:border-amber-400/25 dark:text-amber-400"
                        aria-label="Upgrade plan (opens settings)"
                      >
                        <span
                          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-400/15 dark:bg-amber-500/20"
                          aria-hidden
                        />
                        <span className="relative flex items-center gap-1">
                          <Crown className="h-3.5 w-3.5" strokeWidth={2.5} />
                          <span className="text-[11px] font-medium">Upgrade</span>
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {!isMobile && (
                  <div
                    className="flex h-10 shrink-0 z-30 items-center gap-2 border-b border-white/[0.08] bg-white/[0.02] px-2 pl-1.5"
                    role="toolbar"
                    aria-label="Spotlight header"
                  >
                    <Tooltip
                      content={sidebarOpen ? 'Hide session list' : 'Show session list (Ctrl+Shift+B)'}
                      side="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => { setSidebarOpen(s => !s); }}
                        className="shrink-0 rounded-lg p-2 text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all duration-150"
                        aria-expanded={sidebarOpen}
                        aria-label={sidebarOpen ? 'Hide session list' : 'Show session list'}
                      >
                        {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                      </button>
                    </Tooltip>
                    <span
                      className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-[var(--color-text)]"
                      title={sessionTitle}
                    >
                      {sessionTitle}
                    </span>
                    {(!userPlan || userPlan === 'free') && (
                      <Tooltip content="Upgrade plan" side="bottom">
                        <button
                          type="button"
                          onClick={() => {
                            closeSpotlight();
                            if (
                              (globalThis.window.history.state as { __constructSpotlight?: number } | null)
                                ?.__constructSpotlight
                            ) {
                              globalThis.window.history.back();
                            }
                            openSettingsToSection('subscription');
                          }}
                          className="relative flex h-6 shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-amber-500/30 surface-control pl-1.5 pr-2.5 text-amber-600 transition-all duration-150 hover:border-amber-500/40 hover:bg-white/[0.10] active:scale-95 dark:border-amber-400/25 dark:text-amber-400"
                          aria-label="Upgrade plan (opens settings)"
                        >
                          <span
                            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-400/15 dark:bg-amber-500/20"
                            aria-hidden
                          />
                          <span className="relative flex items-center gap-1">
                            <Crown className="h-3.5 w-3.5" strokeWidth={2.5} />
                            <span className="text-xs font-medium">Upgrade</span>
                          </span>
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip content="Close (Esc)" side="bottom">
                      <button
                        type="button"
                        onClick={requestClose}
                        className="shrink-0 rounded-lg p-2 text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/10"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                )}

                <MessageList
                  paddingTopClass={isMobile ? 'pt-2' : undefined}
                />
                <SpotlightInput />
              </>
            ) : (
              <div className="relative flex-1 min-h-0 flex items-center justify-center p-4">
                {!isMobile && (
                  <button
                    type="button"
                    onClick={requestClose}
                    className="absolute right-2 top-2 z-20 rounded-lg p-2 text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/10"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <div className="text-center max-w-xs">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[var(--color-accent)]" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-1">Meet your AI agent</h3>
                  <p className="text-[13px] text-[var(--color-text-muted)] leading-relaxed">
                    Subscribe to start chatting with your personal AI agent. It can browse the web, write code, manage files, send emails, and more.
                  </p>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}

