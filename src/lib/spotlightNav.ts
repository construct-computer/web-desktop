import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';

/**
 * Open Spotlight on a specific session (or keep the current one).
 * Shared by Autopilot, Clippy, and worthwhile-event notifications.
 */
export async function openSpotlightSession(sessionKey?: string): Promise<void> {
  const { loadSessions, switchSession } = useComputerStore.getState();
  const { spotlightOpen, toggleSpotlight } = useWindowStore.getState();

  await loadSessions(true, sessionKey ? { preserveActiveKey: sessionKey } : undefined);
  if (sessionKey) {
    await switchSession(sessionKey, { force: true });
  }
  if (!spotlightOpen) toggleSpotlight();
}
