import { memo } from 'react';
import { BrowserLivePreview } from './BrowserLivePreview';
import { BrowserSearchPage } from './BrowserSearchPage';
import { BrowserFetchPage } from './BrowserFetchPage';
import { BrowserArxivPage } from './BrowserArxivPage';
import { BrowserDomainPage } from './BrowserDomainPage';
import type { BrowserSessionRecord } from '@/stores/agentStore';
import type { BrowserTab } from '@/stores/browserTabStore';

function LegacyTabFallback({ tab }: { tab: BrowserTab }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center browser-read-pane select-none">
      <p className="text-sm font-medium text-[var(--color-text)] mb-2">{tab.title}</p>
      <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed">
        This tool is no longer available.
      </p>
    </div>
  );
}

export const BrowserTabContent = memo(function BrowserTabContent({
  tab,
  fetchView,
  dataView = 'visual',
  session,
  iframeDead,
  reloadKey,
  onIframeLoad,
  onIframeError,
  onManualReconnect,
  tabCount = 1,
  tabBarExpanded = false,
  onToggleTabBar,
  onOpenDetails,
  detailsOpen = false,
}: {
  tab: BrowserTab;
  fetchView: 'site' | 'reader';
  dataView?: 'visual' | 'json';
  session?: BrowserSessionRecord;
  iframeDead: boolean;
  reloadKey: number;
  onIframeLoad: () => void;
  onIframeError: () => void;
  onManualReconnect: () => void;
  tabCount?: number;
  tabBarExpanded?: boolean;
  onToggleTabBar?: () => void;
  onOpenDetails?: () => void;
  detailsOpen?: boolean;
}) {
  switch (tab.mode) {
    case 'search':
      return <BrowserSearchPage tab={tab} />;
    case 'fetch':
      return (
        <BrowserFetchPage
          tab={tab}
          fetchView={fetchView}
          dataView={dataView}
        />
      );
    case 'arxiv':
      return <BrowserArxivPage tab={tab} />;
    case 'domain':
      return <BrowserDomainPage tab={tab} />;
    case 'live':
      return (
        <BrowserLivePreview
          streamUrl={tab.streamUrl || null}
          session={session}
          runPhase={tab.runPhase || 'live'}
          runErrorDetail={tab.error || ''}
          stepCount={tab.stepCount}
          runId={tab.runId}
          pageUrl={tab.pageUrl || tab.url}
          isDead={iframeDead}
          reloadKey={reloadKey}
          onLoad={onIframeLoad}
          onError={onIframeError}
          onManualReconnect={onManualReconnect}
          progressLabel={tab.progressLabel}
          goal={tab.goal}
          tabCount={tabCount}
          tabBarExpanded={tabBarExpanded}
          onToggleTabBar={onToggleTabBar}
          onOpenDetails={onOpenDetails}
          detailsOpen={detailsOpen}
        />
      );
    default:
      return <LegacyTabFallback tab={tab} />;
  }
});
