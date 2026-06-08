import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, PanelRight, Maximize2, Minimize2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui';
import { registerBrowserTabCloseHandler } from '@/lib/browserTabClose';
import { terminateLiveBrowserTab } from '@/lib/browserTabSession';
import { stopBrowserRun } from '@/services/api';
import { markBrowserWindowEngaged, useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useWindowTitleBarAccessory } from '@/stores/windowAccessoryStore';
import {
  useBrowserTabStore,
  isStaticBrowserTab,
  isLiveBrowserSessionActive,
  type BrowserTab,
} from '@/stores/browserTabStore';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserTabContent } from './BrowserTabContent';
import { BrowserDetailsPanel } from './BrowserDetailsPanel';

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BACKOFF_MS = [1500, 3000, 6000, 12000, 20000, 30000];

interface BrowserUnifiedShellProps {
  isAgentBrowserWindow: boolean;
  windowId?: string;
  pendingUrl?: string;
}

export function BrowserUnifiedShell({
  isAgentBrowserWindow,
  windowId,
  pendingUrl,
}: BrowserUnifiedShellProps) {
  const tabs = useBrowserTabStore((s) => s.tabs);
  const activeTabId = useBrowserTabStore((s) => s.activeTabId);
  const setActiveTabRaw = useBrowserTabStore((s) => s.setActiveTab);
  const setFetchView = useBrowserTabStore((s) => s.setFetchView);
  const setDataView = useBrowserTabStore((s) => s.setDataView);
  const closeTab = useBrowserTabStore((s) => s.closeTab);
  const pruneInactiveLiveTabs = useBrowserTabStore((s) => s.pruneInactiveLiveTabs);
  const patchLiveTabBySession = useBrowserTabStore((s) => s.patchLiveTabBySession);

  const browserSessions = useComputerStore((s) => s.browserState.browserSessions);
  const activeBrowserSessionId = useComputerStore((s) => s.browserState.activeBrowserSessionId);
  const hasComposioBrowser = useComputerStore((s) => s.hasComposioBrowser);
  const configChecked = useComputerStore((s) => s.configChecked);

  const sessionList = useMemo(
    () => Object.values(browserSessions).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)),
    [browserSessions],
  );
  const activeSession = activeBrowserSessionId
    ? browserSessions[activeBrowserSessionId]
    : sessionList[0];

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[tabs.length - 1] || null,
    [tabs, activeTabId],
  );

  const fetchView = activeTab?.fetchView ?? 'reader';
  const dataView = activeTab?.dataView ?? 'visual';
  const isLiveActive = activeTab?.mode === 'live';

  const [showDetails, setShowDetails] = useState(false);
  // Live tabs render full-bleed by default (immersive), letting the remote
  // browser's own chrome show through. The user can exit immersive to reveal
  // our toolbar and switch between tabs.
  const [liveImmersive, setLiveImmersive] = useState(true);
  const immersive = isLiveActive && liveImmersive;

  const [iframeDead, setIframeDead] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadAttempts = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingCloseTab, setPendingCloseTab] = useState<BrowserTab | null>(null);
  const [closingTab, setClosingTab] = useState(false);
  const [stoppingActive, setStoppingActive] = useState(false);
  const [unlockedLiveTabIds, setUnlockedLiveTabIds] = useState<Set<string>>(() => new Set());
  const [pendingUnlockTabId, setPendingUnlockTabId] = useState<string | null>(null);

  const markEngaged = useCallback(() => {
    markBrowserWindowEngaged(windowId);
  }, [windowId]);

  const stopActiveSession = useCallback(async () => {
    if (!activeTab || !activeTab.runId || stoppingActive) return;
    setStoppingActive(true);
    try {
      await stopBrowserRun(activeTab.runId);
    } catch (e) {
      console.error(e);
    } finally {
      setStoppingActive(false);
    }
  }, [activeTab, stoppingActive]);

  const setActiveTab = useCallback((tabId: string) => {
    markEngaged();
    setActiveTabRaw(tabId);
  }, [markEngaged, setActiveTabRaw]);

  const activeLiveUnlocked = !!activeTab && activeTab.mode === 'live' && unlockedLiveTabIds.has(activeTab.id);

  const requestLiveUnlock = useCallback(() => {
    if (!activeTab || activeTab.mode !== 'live') return;
    markEngaged();
    setPendingUnlockTabId(activeTab.id);
  }, [activeTab, markEngaged]);

  const confirmLiveUnlock = useCallback(() => {
    if (!pendingUnlockTabId) return;
    markEngaged();
    setUnlockedLiveTabIds((prev) => {
      const next = new Set(prev);
      next.add(pendingUnlockTabId);
      return next;
    });
    setPendingUnlockTabId(null);
  }, [markEngaged, pendingUnlockTabId]);

  const lockActiveLiveTab = useCallback(() => {
    if (!activeTab || activeTab.mode !== 'live') return;
    markEngaged();
    setUnlockedLiveTabIds((prev) => {
      const next = new Set(prev);
      next.delete(activeTab.id);
      return next;
    });
  }, [activeTab, markEngaged]);

  // Single Details toggle (+ immersive toggle for live tabs) lives in the
  // window title bar so the browser chrome stays to a single row.
  useWindowTitleBarAccessory(
    windowId ?? '',
    <>
      {isLiveActive && (
        <button
          type="button"
          onClick={() => { markEngaged(); setLiveImmersive((v) => !v); }}
          className="p-1 rounded-[5px] transition-colors text-black/50 dark:text-white/50 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-[var(--color-text)]"
          title={liveImmersive ? 'Show tabs & toolbar' : 'Immersive live view'}
          aria-label={liveImmersive ? 'Show tabs and toolbar' : 'Immersive live view'}
        >
          {liveImmersive ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => { markEngaged(); setShowDetails((v) => !v); }}
        className={`p-1 rounded-[5px] transition-colors ${
          showDetails
            ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
            : 'text-black/50 dark:text-white/50 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-[var(--color-text)]'
        }`}
        title={showDetails ? 'Hide details' : 'Run details, captures & downloads'}
        aria-label={showDetails ? 'Hide details' : 'Show details'}
      >
        <PanelRight className="w-3.5 h-3.5" />
      </button>
    </>,
  );

  useEffect(() => {
    pruneInactiveLiveTabs(browserSessions);
  }, [browserSessions, pruneInactiveLiveTabs]);

  // Belt-and-suspenders: consume pendingUrl from window metadata (e.g. navigateTo
  // before daemon connects) when no matching tab exists yet.
  useEffect(() => {
    if (!pendingUrl) return;
    const tabStore = useBrowserTabStore.getState();
    tabStore.openOrFocusUrlTab(pendingUrl);
    if (windowId) {
      const win = useWindowStore.getState().getWindow(windowId);
      if (win?.metadata?.pendingUrl) {
        useWindowStore.getState().updateWindow(windowId, {
          metadata: { ...win.metadata, pendingUrl: undefined },
        });
      }
    }
  }, [pendingUrl, windowId]);

  useEffect(() => {
    if (!iframeDead || !activeTab || activeTab.mode !== 'live') return;
    const sessionId = activeTab.sessionId || activeTab.runId;
    if (sessionId) {
      patchLiveTabBySession(sessionId, {
        runPhase: 'complete',
      });
    }
  }, [iframeDead, activeTab, patchLiveTabBySession]);

  const finalizeCloseTab = useCallback((tab: BrowserTab) => {
    closeTab(tab.id);
    setPendingCloseTab(null);
  }, [closeTab]);

  const handleCloseTab = useCallback((tab: BrowserTab) => {
    if (isStaticBrowserTab(tab)) {
      finalizeCloseTab(tab);
      return;
    }
    if (isLiveBrowserSessionActive(tab, browserSessions)) {
      setPendingCloseTab(tab);
      return;
    }
    finalizeCloseTab(tab);
  }, [browserSessions, finalizeCloseTab]);

  useEffect(() => {
    registerBrowserTabCloseHandler(handleCloseTab);
    return () => registerBrowserTabCloseHandler(null);
  }, [handleCloseTab]);

  const onShellKeyDown = useCallback((e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.altKey || e.metaKey;
    if (mod && e.key === 'w' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (activeTab) handleCloseTab(activeTab);
    }
  }, [activeTab, handleCloseTab]);

  const confirmCloseLiveTab = useCallback(async () => {
    if (!pendingCloseTab || closingTab) return;
    setClosingTab(true);
    try {
      await terminateLiveBrowserTab(pendingCloseTab);
      finalizeCloseTab(pendingCloseTab);
    } catch {
      finalizeCloseTab(pendingCloseTab);
    } finally {
      setClosingTab(false);
    }
  }, [pendingCloseTab, closingTab, finalizeCloseTab]);

  useEffect(() => {
    reloadAttempts.current = 0;
    setIframeDead(false);
    setReloadKey(0);
    if (reloadTimerRef.current !== null) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, [activeTab?.streamUrl]);

  useEffect(() => () => {
    if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reloadAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      setIframeDead(true);
      return;
    }
    const delay = RECONNECT_BACKOFF_MS[reloadAttempts.current] ?? RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1];
    reloadAttempts.current += 1;
    if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      setReloadKey((k) => k + 1);
    }, delay);
  }, []);

  const onIframeLoad = useCallback(() => {
    if (reloadAttempts.current > 0) reloadAttempts.current = 0;
  }, []);

  const onIframeError = useCallback(() => {
    scheduleReconnect();
  }, [scheduleReconnect]);

  const onManualReconnect = useCallback(() => {
    reloadAttempts.current = 0;
    setIframeDead(false);
    if (reloadTimerRef.current !== null) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div
      className="relative flex flex-col h-full surface-app overflow-hidden outline-none"
      onKeyDown={onShellKeyDown}
      onFocus={markEngaged}
      onPointerDown={markEngaged}
      tabIndex={-1}
    >
      {!immersive && tabs.length > 0 && (
        <BrowserToolbar
          tabs={tabs}
          activeTab={activeTab}
          activeTabId={activeTab?.id ?? null}
          onSelect={setActiveTab}
          onClose={handleCloseTab}
          fetchView={fetchView}
          onFetchViewChange={(view) => { markEngaged(); if (activeTab) setFetchView(activeTab.id, view); }}
          dataView={dataView}
          onDataViewChange={(view) => { markEngaged(); if (activeTab) setDataView(activeTab.id, view); }}
          onStopLive={stopActiveSession}
          stoppingLive={stoppingActive}
        />
      )}

      {configChecked && !hasComposioBrowser && (
        <div className="px-3 py-1.5 text-[11px] leading-snug border-b border-amber-500/15 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300/90">
          Interactive browser (Composio browser_tool) is unavailable — check the platform Composio API key.
          Use <strong>web_search</strong> or <strong>web_fetch</strong> for read-only page text in the meantime.
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex bg-[var(--color-surface)]">
        <div className="flex-1 min-w-0 overflow-hidden relative flex items-stretch justify-center">
          {activeTab ? (
            <div className="w-full h-full">
              <BrowserTabContent
                tab={activeTab}
                fetchView={fetchView}
                dataView={dataView}
                session={activeSession}
                iframeDead={iframeDead}
                reloadKey={reloadKey}
                onIframeLoad={onIframeLoad}
                onIframeError={onIframeError}
                onManualReconnect={onManualReconnect}
                immersive={immersive}
                onExitImmersive={() => setLiveImmersive(false)}
                interactive={activeLiveUnlocked}
                onRequestUnlock={requestLiveUnlock}
                onLock={lockActiveLiveTab}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-[var(--color-text-subtle)] max-w-sm text-center px-4">
              <Globe className="w-10 h-10 opacity-20" />
              <p className="text-sm text-[var(--color-text-muted)]">Construct browser</p>
              <p className="text-xs opacity-70 leading-relaxed">
                {isAgentBrowserWindow
                  ? 'When Construct searches the web or opens pages, they will appear here as tabs.'
                  : 'Ask Construct to search the web or visit a page.'}
              </p>
              {configChecked && !hasComposioBrowser && (
                <p className="text-[11px] text-amber-400/80 leading-relaxed mt-1">
                  Live browsing requires Composio browser_tool. Search and fetch tabs still work without it.
                </p>
              )}
            </div>
          )}
        </div>

        {showDetails && (
          <BrowserDetailsPanel
            sessions={sessionList}
            activeSessionId={activeSession?.id || null}
            activeTab={activeTab}
            liveInteractive={activeLiveUnlocked}
            onClose={() => setShowDetails(false)}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!pendingCloseTab}
        title="Stop remote browser?"
        message={
          pendingCloseTab
            ? `Stopping "${pendingCloseTab.title}" ends the Composio cloud browser session — not just this preview. The agent will lose access to that page.`
            : ''
        }
        confirmLabel={closingTab ? 'Stopping…' : 'Stop browser'}
        cancelLabel="Keep open"
        destructive
        onConfirm={() => { void confirmCloseLiveTab(); }}
        onCancel={() => setPendingCloseTab(null)}
      />

      <ConfirmDialog
        open={!!pendingUnlockTabId}
        title="Unlock live browser?"
        message="This lets your clicks and typing go directly into the Composio cloud browser. The agent may still be using the same session, so unlock only when you want to take temporary control."
        confirmLabel="Unlock"
        cancelLabel="Keep view only"
        onConfirm={confirmLiveUnlock}
        onCancel={() => setPendingUnlockTabId(null)}
      />
    </div>
  );
}
