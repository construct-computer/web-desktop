import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, PanelRight } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui';
import { registerBrowserTabCloseHandler } from '@/lib/browserTabClose';
import { terminateLiveBrowserTab } from '@/lib/browserTabSession';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
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
import { BrowserDashboardPanel } from './BrowserDashboardPanel';

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BACKOFF_MS = [1500, 3000, 6000, 12000, 20000, 30000];

type DetailsTab = 'overview' | 'history' | 'captures' | 'downloads';

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
  const [tabBarExpanded, setTabBarExpanded] = useState(false);
  const hideTabBar = isLiveActive && !tabBarExpanded;
  const showStaticChrome = activeTab && activeTab.mode !== 'live';
  const showModeStatusBar = !hideTabBar;

  const [showDetails, setShowDetails] = useState(false);
  const [detailsDefaultTab, setDetailsDefaultTab] = useState<DetailsTab>('history');

  const [iframeDead, setIframeDead] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadAttempts = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingCloseTab, setPendingCloseTab] = useState<BrowserTab | null>(null);
  const [closingTab, setClosingTab] = useState(false);

  const setActiveTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab && isStaticBrowserTab(tab)) {
      setTabBarExpanded(false);
    }
    setActiveTabRaw(tabId);
  }, [tabs, setActiveTabRaw]);

  const openDetails = useCallback((defaultTab: DetailsTab = 'history') => {
    setShowDetails((prev) => {
      if (prev) return false;
      setDetailsDefaultTab(defaultTab);
      return true;
    });
  }, []);

  const toggleTabBar = useCallback(() => {
    setTabBarExpanded((v) => !v);
  }, []);

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
        streamUrl: undefined,
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

  const detailsDefaultForPanel = detailsDefaultTab;

  return (
    <div
      className="relative flex flex-col h-full surface-app overflow-hidden outline-none"
      onKeyDown={onShellKeyDown}
      tabIndex={-1}
    >
      {isAgentBrowserWindow && (
        <div className="shrink-0 flex items-center justify-end gap-2 px-3 py-1 border-b border-[var(--color-border)] surface-toolbar min-h-[32px]">
          <button
            type="button"
            onClick={() => { openDetails('history'); }}
            className={[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-all',
              showDetails
                ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                : 'border-white/20 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.04]',
            ].join(' ')}
            title="Run history, captures, and downloads"
          >
            <PanelRight className="w-3.5 h-3.5" />
            Details
          </button>
        </div>
      )}

      {!hideTabBar && tabs.length > 0 && (
        <div className="shrink-0">
          <BrowserTabBar
            tabs={tabs}
            activeTabId={activeTab?.id ?? null}
            onSelect={setActiveTab}
            onClose={handleCloseTab}
          />
          {showStaticChrome && (
            <BrowserChromeBar
              tab={activeTab}
              fetchView={fetchView}
              onFetchViewChange={(view) => activeTab && setFetchView(activeTab.id, view)}
              dataView={dataView}
              onDataViewChange={(view) => activeTab && setDataView(activeTab.id, view)}
            />
          )}
        </div>
      )}

      {configChecked && !hasComposioBrowser && (
        <div className="px-3 py-1.5 text-[11px] leading-snug border-b border-amber-500/15 bg-amber-500/[0.06] text-amber-300/90">
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
                tabCount={tabs.length}
                tabBarExpanded={tabBarExpanded}
                onToggleTabBar={toggleTabBar}
                onOpenDetails={() => openDetails('captures')}
                detailsOpen={showDetails}
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
          <BrowserDashboardPanel
            key={detailsDefaultForPanel}
            sessions={sessionList}
            activeSessionId={activeSession?.id || null}
            defaultTab={detailsDefaultForPanel}
            onClose={() => setShowDetails(false)}
          />
        )}
      </div>

      {showModeStatusBar && (
        <BrowserModeStatusBar
          tab={activeTab}
          fetchView={fetchView}
        />
      )}

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
    </div>
  );
}
