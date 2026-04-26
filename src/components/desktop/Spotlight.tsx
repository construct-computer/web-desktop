/**
 * Spotlight — Polished agent chat interface with sidebar.
 *
 * Toggled via Ctrl+Space. Large floating glass panel with:
 * - Left sidebar: chat history, new chat button
 * - Right: message list (scrollable) + input at bottom
 *
 * Sub-components live in ./spotlight/ directory.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftOpen, Sparkles, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { openSettingsToSection } from '@/lib/settingsNav';
import { SpotlightSidebar } from './spotlight/SpotlightSidebar';
import { SpotlightInput } from './spotlight/SpotlightInput';
import { MessageList } from './spotlight/MessageList';

export function Spotlight() {
  const open = useWindowStore(s => s.spotlightOpen);
  const closeSpotlight = useWindowStore(s => s.closeSpotlight);
  const instanceId = useComputerStore(s => s.instanceId);
  const userPlan = useAuthStore(s => s.user?.plan);
  const isSubscribed = userPlan === 'pro' || userPlan === 'starter' || userPlan === 'free';
  const isMobile = useIsMobile();

  const [animating, setAnimating] = useState(false);
  const [show, setShow] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // ── Open/close animation ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setSidebarOpen(false);
      setShow(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const t = setTimeout(() => setShow(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSpotlight(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, closeSpotlight]);

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
        className={`absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm transition-opacity duration-200 ease-out ${animating ? 'opacity-100' : 'opacity-0'}`}
        onClick={closeSpotlight}
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
        className={cn(
          "pointer-events-auto transition-all duration-300 ease-out flex flex-col",
          isMobile
            ? "w-full"
            : "w-[960px] max-w-[calc(100vw-48px)] rounded-2xl",
          animating 
            ? (isMobile ? "translate-y-0 opacity-100" : "opacity-100 scale-100")
            : (isMobile ? "translate-y-full opacity-100" : "opacity-0 scale-[0.97]")
        )}
        style={{ 
          height: isMobile ? 'calc(100dvh - 10px)' : '70vh', 
          maxHeight: isMobile ? 'none' : 720 
        }}
      >
        <div
          onDragEnter={onPanelDragEnter}
          onDragOver={onPanelDragOver}
          onDragLeave={onPanelDragLeave}
          onDrop={onPanelDrop}
          className={cn(
            "relative h-full flex overflow-hidden bg-white/50 dark:bg-[#111113]/80 backdrop-blur-[40px] shadow-[0_24px_80px_rgba(0,0,0,0.3),0_12px_24px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:ring-white/5",
            isMobile 
              ? "rounded-t-[32px] rounded-b-none border border-b-0 border-white/30 dark:border-white/[0.1]"
              : "rounded-2xl border border-white/30 dark:border-white/[0.1]"
          )}
        >
          {/* Mobile drag handle — reserves space in flex flow so it never overlaps messages */}
          {isMobile && (
            <div
              className="absolute top-0 left-0 right-0 z-40 flex justify-center pt-3 pb-2 cursor-pointer"
              onClick={closeSpotlight}
            >
              <div className="w-12 h-1.5 rounded-full bg-black/20 dark:bg-white/20" />
            </div>
          )}

          {/* Drag overlay */}
          {dragOver && (
            <div className="absolute inset-0 z-50 rounded-2xl bg-white/80 dark:bg-[#111113]/95 backdrop-blur-sm border-2 border-dashed border-[var(--color-accent)] flex items-center justify-center pointer-events-none">
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
              Desktop: inline column that pushes content. */}
          {isMobile ? (
            <>
              {sidebarOpen && (
                <div
                  className="absolute inset-0 z-40 bg-black/30 transition-opacity"
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              <div
                className={`absolute inset-y-0 left-0 z-40 w-[min(320px,85vw)] transition-transform duration-200 ease-out bg-white/80 dark:bg-[#111113]/95 backdrop-blur-[40px] ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
              >
                <SpotlightSidebar onCollapse={() => setSidebarOpen(false)} />
              </div>
            </>
          ) : (
            <div className={`shrink-0 transition-[width] duration-200 ease-out overflow-hidden ${sidebarOpen ? 'w-[240px]' : 'w-0'}`}>
              <SpotlightSidebar onCollapse={() => setSidebarOpen(false)} />
            </div>
          )}

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0 h-full relative">
            {isSubscribed ? (
              <>
                {/* Floating sidebar toggle — aligned 1:1 with the sidebar's collapse button so
                    nothing visually shifts when toggling open/closed. */}
                {!sidebarOpen && (
                  <div className="absolute top-4 left-3 z-20 flex items-center gap-2">
                    <Tooltip content="Show sidebar" side="bottom">
                      <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg text-[var(--color-text-muted)]/50 hover:text-[var(--color-text)] bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] backdrop-blur-sm transition-all duration-150 active:scale-95"
                      >
                        <PanelLeftOpen className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    {(!userPlan || userPlan === 'free') && (
                      <Tooltip content="Upgrade Plan" side="bottom">
                        <button
                          type="button"
                          onClick={() => {
                            closeSpotlight();
                            openSettingsToSection('subscription');
                          }}
                          className="relative flex h-6 items-center justify-center gap-1 overflow-hidden rounded-md border border-amber-500/30 bg-white/[0.06] pl-1.5 pr-2.5 text-amber-600 backdrop-blur-sm transition-all duration-150 hover:border-amber-500/40 hover:bg-white/[0.10] active:scale-95 dark:border-amber-400/25 dark:bg-white/[0.05] dark:text-amber-400 dark:hover:border-amber-400/35 dark:hover:bg-white/[0.09]"
                        >
                          <span
                            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-400/15 dark:bg-amber-500/20"
                            aria-hidden
                          />
                          <span className="relative flex items-center gap-1">
                            <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
                            <span className="text-xs font-medium">Upgrade</span>
                          </span>
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
                <MessageList />
                <SpotlightInput />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
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
    </div>,
    document.body,
  );
}
