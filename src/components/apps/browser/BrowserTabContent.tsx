import { memo } from 'react';
import { BrowserLivePreview } from './BrowserLivePreview';
import { BrowserSearchPage } from './BrowserSearchPage';
import { BrowserFetchPage } from './BrowserFetchPage';
import { BrowserArxivPage } from './BrowserArxivPage';
import { BrowserYouTubePage } from './BrowserYouTubePage';
import { BrowserDomainPage } from './BrowserDomainPage';
import type { BrowserSessionRecord } from '@/stores/agentStore';
import type { BrowserTab } from '@/stores/browserTabStore';

export const BrowserTabContent = memo(function BrowserTabContent({
  tab,
  fetchView,
  session,
  iframeDead,
  reloadKey,
  onIframeLoad,
  onIframeError,
  onManualReconnect,
}: {
  tab: BrowserTab;
  fetchView: 'site' | 'reader';
  session?: BrowserSessionRecord;
  iframeDead: boolean;
  reloadKey: number;
  onIframeLoad: () => void;
  onIframeError: () => void;
  onManualReconnect: () => void;
}) {
  switch (tab.mode) {
    case 'search':
      return <BrowserSearchPage tab={tab} />;
    case 'fetch':
      return <BrowserFetchPage tab={tab} fetchView={fetchView} />;
    case 'arxiv':
      return <BrowserArxivPage tab={tab} />;
    case 'youtube':
      return <BrowserYouTubePage tab={tab} />;
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
        />
      );
    default:
      return null;
  }
});
