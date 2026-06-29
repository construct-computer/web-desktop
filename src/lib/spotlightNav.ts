import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';

/**
 * Open the chat window on a specific session (or keep the current one).
 * Shared by Autopilot, Clippy, and worthwhile-event notifications.
 */
export async function openSpotlightSession(sessionKey?: string): Promise<void> {
  const { loadSessions, switchSession } = useComputerStore.getState();
  const { openAgentWindow } = useWindowStore.getState();

  openAgentWindow();

  await loadSessions(true, sessionKey ? { preserveActiveKey: sessionKey } : undefined);
  if (sessionKey) {
    await switchSession(sessionKey, { force: true });
  }
}
