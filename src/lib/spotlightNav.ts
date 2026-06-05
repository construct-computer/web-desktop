import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';

/**
 * Open Spotlight on a specific session (or keep the current one).
 * Shared by Autopilot, Clippy, and worthwhile-event notifications.
 */
export async function openSpotlightSession(sessionKey?: string): Promise<void> {
  const { loadSessions, switchSession, activeSessionKey } = useComputerStore.getState();
  const { spotlightOpen, toggleSpotlight } = useWindowStore.getState();

  await loadSessions(true, sessionKey ? { preserveActiveKey: sessionKey } : undefined);
  if (sessionKey && sessionKey !== activeSessionKey) {
    await switchSession(sessionKey);
  }
  if (!spotlightOpen) toggleSpotlight();
}
