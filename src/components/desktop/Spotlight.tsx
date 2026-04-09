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
import { PanelLeftOpen, Sparkles } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { SpotlightSidebar } from './spotlight/SpotlightSidebar';
import { SpotlightInput } from './spotlight/SpotlightInput';
import { MessageList } from './spotlight/MessageList';

export function Spotlight() {
  const open = useWindowStore(s => s.spotlightOpen);
  const closeSpotlight = useWindowStore(s => s.closeSpotlight);
  const instanceId = useComputerStore(s => s.instanceId);
  const userPlan = useAuthStore(s => s.user?.plan);
  const isSubscribed = userPlan === 'pro' || userPlan === 'starter';

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
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ zIndex: 1310 }}
      >
      <div
        className={`pointer-events-auto w-[960px] max-w-[calc(100vw-48px)] transition-all duration-200 ease-out ${
          animating ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]'
        }`}
        style={{ height: '70vh', maxHeight: 720 }}
      >
        <div
          onDragEnter={onPanelDragEnter}
          onDragOver={onPanelDragOver}
          onDragLeave={onPanelDragLeave}
          onDrop={onPanelDrop}
          className="relative h-full flex rounded-2xl overflow-hidden bg-white/50 dark:bg-[#111113]/80 backdrop-blur-[40px] border border-white/30 dark:border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.3),0_12px_24px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:ring-white/5"
        >
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

          {/* Sidebar — collapsible */}
          <div className={`shrink-0 transition-[width] duration-200 ease-out overflow-hidden ${sidebarOpen ? 'w-[240px]' : 'w-0'}`}>
            <SpotlightSidebar onCollapse={() => setSidebarOpen(false)} />
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0 h-full relative">
            {isSubscribed ? (
              <>
                {/* Floating sidebar toggle when collapsed */}
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="absolute top-2 left-2 z-10 p-1.5 rounded-lg text-[var(--color-text-muted)]/30 hover:text-[var(--color-text)] hover:bg-white/[0.08] transition-colors"
                    title="Show sidebar"
                  >
                    <PanelLeftOpen className="w-3.5 h-3.5" />
                  </button>
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
