import { stopBrowserRun, stopBrowserSession } from '@/services/api';
import type { BrowserTab } from '@/stores/browserTabStore';
import { liveTabSessionId } from '@/stores/browserTabStore';

/** Stop the upstream Browser Use run/session backing a live tab. */
export async function terminateLiveBrowserTab(tab: BrowserTab): Promise<void> {
  const sessionId = liveTabSessionId(tab);
  const runIds = new Set(
    [tab.runId, sessionId?.startsWith('pending:') ? undefined : sessionId].filter(Boolean) as string[],
  );

  const errors: string[] = [];
  for (const runId of runIds) {
    const res = await stopBrowserRun(runId);
    if (!res.success) errors.push(res.error || 'Failed to stop browser run');
  }

  if (sessionId && !sessionId.startsWith('pending:')) {
    const sessionRes = await stopBrowserSession(sessionId);
    if (!sessionRes.success) errors.push(sessionRes.error || 'Failed to stop browser session');
  }

  if (errors.length > 0 && runIds.size === 0 && !sessionId) {
    throw new Error(errors[0]);
  }
}
