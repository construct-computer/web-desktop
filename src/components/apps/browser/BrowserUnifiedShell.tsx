import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui';
import { terminateLiveBrowserTab } from '@/lib/browserTabSession';
import { useComputerStore } from '@/stores/agentStore';
import {
  useBrowserTabStore,
  isStaticBrowserTab,
  isLiveBrowserSessionActive,
  type BrowserTab,
} from '@/stores/browserTabStore';
import { BrowserTabBar } from './BrowserTabBar';
import { BrowserChromeBar } from './BrowserChromeBar';
import { BrowserTabContent } from './BrowserTabContent';
import { BrowserModeStatusBar } from './BrowserModeStatusBar';

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BACKOFF_MS = [1500, 3000, 6000, 12000, 20000, 30000];

interface BrowserUnifiedShellProps {
  isAgentBrowserWindow: boolean;
}

export function BrowserUnifiedShell({ isAgentBrowserWindow }: BrowserUnifiedShellProps) {
  const tabs = useBrowserTabStore((s) => s.tabs);
  const activeTabId = useBrowserTabStore((s) => s.activeTabId);
  const setActiveTab = useBrowserTabStore((s) => s.setActiveTab);
  const setFetchView = useBrowserTabStore((s) => s.setFetchView);
  const closeTab = useBrowserTabStore((s) => s.closeTab);
  const pruneInactiveLiveTabs = useBrowserTabStore((s) => s.pruneInactiveLiveTabs);

  const browserSessions = useComputerStore((s) => s.browserState.browserSessions);
  const activeBrowserSessionId = useComputerStore((s) => s.browserState.activeBrowserSessionId);
  const connected = useComputerStore((s) => s.browserState.connected);

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

  const [iframeDead, setIframeDead] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadAttempts = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stoppingLive, setStoppingLive] = useState(false);
  const [pendingCloseTab, setPendingCloseTab] = useState<BrowserTab | null>(null);
  const [closingTab, setClosingTab] = useState(false);

  useEffect(() => {
    pruneInactiveLiveTabs(browserSessions);
  }, [browserSessions, pruneInactiveLiveTabs]);

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

  const confirmCloseLiveTab = useCallback(async () => {
    if (!pendingCloseTab || closingTab) return;
    setClosingTab(true);
    try {
      await terminateLiveBrowserTab(pendingCloseTab);
      finalizeCloseTab(pendingCloseTab);
    } catch {
      // Still remove the tab so the UI does not stay cluttered; session stop is best-effort.
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

  const onStopLive = useCallback(async () => {
    if (!activeTab || activeTab.mode !== 'live' || stoppingLive) return;
    if (!isLiveBrowserSessionActive(activeTab, browserSessions)) return;
    setStoppingLive(true);
    try {
      await terminateLiveBrowserTab(activeTab);
      finalizeCloseTab(activeTab);
    } finally {
      setStoppingLive(false);
    }
  }, [activeTab, browserSessions, stoppingLive, finalizeCloseTab]);

  const showProgress = activeTab?.status === 'loading';

  return (
    <div className="relative flex flex-col h-full surface-app overflow-hidden">
      <BrowserTabBar
        tabs={tabs}
        activeTabId={activeTab?.id ?? null}
        onSelect={setActiveTab}
        onClose={handleCloseTab}
      />
      <BrowserChromeBar
        tab={activeTab}
        fetchView={fetchView}
        onFetchViewChange={(view) => activeTab && setFetchView(activeTab.id, view)}
        onStopLive={activeTab?.mode === 'live' ? onStopLive : undefined}
        stoppingLive={stoppingLive}
      />

      {showProgress && (
        <div className="h-[2px] bg-black/40 overflow-hidden select-none relative z-20">
          <div className="h-full w-2/3 bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent animate-[shimmer_1.4s_ease-in-out_infinite] shadow-[0_0_8px_var(--color-accent)]" />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex bg-[var(--color-surface)]">
        <div className="flex-1 min-w-0 overflow-hidden relative flex items-stretch justify-center">
          {activeTab ? (
            <div className="w-full h-full">
              <BrowserTabContent
                tab={activeTab}
                fetchView={fetchView}
                session={activeSession}
                iframeDead={iframeDead}
                reloadKey={reloadKey}
                onIframeLoad={onIframeLoad}
                onIframeError={onIframeError}
                onManualReconnect={onManualReconnect}
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
            </div>
          )}
        </div>
      </div>

      <BrowserModeStatusBar
        tab={activeTab}
        fetchView={fetchView}
        connected={connected}
      />

      <ConfirmDialog
        open={!!pendingCloseTab}
        title="End browser session?"
        message={
          pendingCloseTab
            ? `Closing "${pendingCloseTab.title}" will stop the live browser session. The agent may lose access to that page.`
            : ''
        }
        confirmLabel={closingTab ? 'Stopping…' : 'End session'}
        cancelLabel="Keep open"
        destructive
        onConfirm={() => { void confirmCloseLiveTab(); }}
        onCancel={() => setPendingCloseTab(null)}
      />
    </div>
  );
}
