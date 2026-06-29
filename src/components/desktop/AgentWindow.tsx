import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Crown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore, shouldRefreshChatHistory } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { openSubscribeWindow } from '@/lib/settingsNav';
import { hasAgentAccess, hasPaidAccess } from '@/lib/plans';
import type { WindowConfig } from '@/types';
import { SpotlightSidebar } from './spotlight/SpotlightSidebar';
import { SpotlightInput } from './spotlight/SpotlightInput';
import { MessageList } from './spotlight/MessageList';

export function AgentWindow({ config }: { config: WindowConfig }) {
  void config;

  const isMobile = useIsMobile();
  const open = useWindowStore((s) => s.agentWindowOpen);
  const closeAgentWindow = useWindowStore((s) => s.closeAgentWindow);
  const userPlan = useAuthStore((s) => s.user?.plan);
  const instanceId = useComputerStore((s) => s.instanceId);
  const activeSessionKey = useComputerStore((s) => s.activeSessionKey);
  const loadSessions = useComputerStore((s) => s.loadSessions);
  const refreshActiveChatHistory = useComputerStore((s) => s.refreshActiveChatHistory);
  const chatSessions = useComputerStore((s) => s.chatSessions);

  const sessionTitle = useMemo(
    () => chatSessions.find((s) => s.key === activeSessionKey)?.title || 'Construct',
    [chatSessions, activeSessionKey],
  );
  const hasAccess = hasAgentAccess(userPlan);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const focusReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !instanceId) return;
    void loadSessions(true, { preserveActiveKey: activeSessionKey });
  }, [open, instanceId, activeSessionKey, loadSessions]);

  useEffect(() => {
    if (!instanceId || !activeSessionKey) return;
    if (!shouldRefreshChatHistory(activeSessionKey)) return;
    void refreshActiveChatHistory();
  }, [instanceId, activeSessionKey, open, refreshActiveChatHistory]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeAgentWindow();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeAgentWindow]);

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

  useEffect(() => {
    if (open) setSidebarOpen(false);
  }, [open]);

  const onPanelDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer?.types.includes('Files')) setDragOver(true);
  }, []);

  const onPanelDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onPanelDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const onPanelDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      window.dispatchEvent(new CustomEvent('spotlight-drop-files', { detail: Array.from(files) }));
    }
  }, []);

  const closeAndOpenSubscription = useCallback(() => {
    closeAgentWindow();
    queueMicrotask(openSubscribeWindow);
  }, [closeAgentWindow]);

  if (!hasAccess) {
    return (
      <div
        ref={panelRef}
        className="relative flex h-full w-full items-center justify-center surface-app"
        onDragEnter={onPanelDragEnter}
        onDragOver={onPanelDragOver}
        onDragLeave={onPanelDragLeave}
        onDrop={onPanelDrop}
        style={{ transform: 'translateZ(0)' }}
      >
        {dragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-accent)] surface-app pointer-events-none">
            <div className="flex flex-col items-center gap-1.5 text-[var(--color-accent)]">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm font-semibold">Drop files to attach</span>
            </div>
          </div>
        )}

        <div className="text-center max-w-xs">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)]/10">
            <Crown className="h-5 w-5 text-[var(--color-accent)]" />
          </div>
          <h3 className="mb-1 text-[15px] font-semibold text-[var(--color-text)]">Meet Construct</h3>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-muted)]">
            Starter and Pro unlock the full desktop: web browsing, files, email, calendar, and background work.
          </p>
          <button
            type="button"
            onClick={closeAndOpenSubscription}
            className="mt-4 inline-flex items-center justify-center rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-4 py-2 text-[13px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/15"
          >
            Open Subscribe
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="relative flex h-full w-full flex-col surface-app"
      onDragEnter={onPanelDragEnter}
      onDragOver={onPanelDragOver}
      onDragLeave={onPanelDragLeave}
      onDrop={onPanelDrop}
      style={{ transform: 'translateZ(0)' }}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-accent)] surface-app pointer-events-none">
          <div className="flex flex-col items-center gap-1.5 text-[var(--color-accent)]">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-semibold">Drop files to attach</span>
          </div>
        </div>
      )}

      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-black/[0.06] surface-sidebar px-3 dark:border-white/[0.06]">
        <Tooltip content={sidebarOpen ? 'Hide session list' : 'Show session list (Ctrl+Shift+B)'} side="bottom">
          <button
            type="button"
            onClick={() => setSidebarOpen((s) => !s)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-muted/70 transition-all duration-150 hover:bg-black/5 hover:text-text dark:hover:bg-white/10"
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? 'Hide session list' : 'Show session list'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        </Tooltip>

        <span className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-text" title={sessionTitle}>
          {sessionTitle}
        </span>

        {!hasPaidAccess(userPlan) && (
          <button
            type="button"
            onClick={closeAndOpenSubscription}
            className="relative flex h-8 shrink-0 items-center justify-center gap-1 overflow-hidden rounded-lg border border-amber-500/30 surface-control pl-2 pr-2.5 text-amber-600 transition-all duration-150 hover:border-amber-500/40 hover:bg-black/5 active:scale-95 dark:border-amber-400/25 dark:text-amber-400 dark:hover:bg-white/10"
            aria-label="Open Subscribe"
          >
            <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-400/15 dark:bg-amber-500/20" aria-hidden />
            <span className="relative flex items-center gap-1">
              <Crown className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="text-xs font-medium">Open Subscribe</span>
            </span>
          </button>
        )}
      </div>

      <div className={cn('relative flex-1 min-h-0 min-w-0 flex', isMobile ? 'flex-col' : 'flex-row')}>
        {isMobile && sidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/30 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {isMobile ? (
          <div className={cn('absolute inset-y-0 left-0 z-40 w-[min(320px,85vw)] transition-transform duration-200 ease-out surface-app', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
            <SpotlightSidebar />
          </div>
        ) : (
          <div className={cn('shrink-0 overflow-hidden transition-[width] duration-200 ease-out', sidebarOpen ? 'w-[240px]' : 'w-0')}>
            <SpotlightSidebar />
          </div>
        )}

        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          <MessageList paddingTopClass={isMobile ? 'pt-2' : undefined} />
          <SpotlightInput />
        </div>
      </div>
    </div>
  );
}
