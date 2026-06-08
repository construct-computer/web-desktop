import { ExternalLink } from 'lucide-react';
import { getOrCreateBrowserAppWindow, markBrowserWindowEngaged } from '@/stores/agentStore';
import { useBrowserTabStore, isBrowserWebTool } from '@/stores/browserTabStore';
import type { ChatMessage } from '@/stores/agentStore';
import { CompactActivityRow } from './CompactActivityRow';

export function openWebToolTab(toolCallId: string | undefined) {
  // User explicitly opened the browser — mark it engaged so it won't auto-close.
  const windowId = getOrCreateBrowserAppWindow({ metadata: { browserAppWindow: true } });
  markBrowserWindowEngaged(windowId);
  if (toolCallId) {
    const tabId = `tab_${toolCallId}`;
    const store = useBrowserTabStore.getState();
    if (store.tabs.some((t) => t.id === tabId)) {
      store.setActiveTab(tabId);
      return;
    }
    store.reopenTab(tabId);
  }
}

export function WebToolActivityRow({
  message,
  duration,
  failed,
}: {
  message: ChatMessage;
  duration?: string;
  failed?: boolean;
}) {
  const tool = message.tool || '';
  const showView = isBrowserWebTool(tool) && !!message.toolCallId;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <CompactActivityRow
        content={message.content}
        activityType={message.activityType}
        tool={message.tool}
        iconPlatform={message.iconPlatform}
        iconUrl={message.iconUrl}
        failed={failed}
        duration={duration}
        activityStatus={message.activityStatus}
        className="flex-1 hover:bg-white/[0.025]"
      />
      {showView && (
        <button
          type="button"
          onClick={() => openWebToolTab(message.toolCallId)}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-white/[0.08] bg-white/[0.03] text-[var(--color-text-muted)]/70 hover:text-[var(--color-text)] hover:bg-white/[0.06] transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View
        </button>
      )}
    </div>
  );
}
