import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isTriggeredSessionKey } from './agentSessionKeys';

const agentStoreSource = readFileSync(new URL('./agentStore.ts', import.meta.url), 'utf8');
const spotlightNavSource = readFileSync(new URL('../lib/spotlightNav.ts', import.meta.url), 'utf8');
const spotlightSidebarSource = readFileSync(
  new URL('../components/desktop/spotlight/SpotlightSidebar.tsx', import.meta.url),
  'utf8',
);
const spotlightSource = readFileSync(new URL('../components/desktop/Spotlight.tsx', import.meta.url), 'utf8');

describe('isTriggeredSessionKey', () => {
  it('recognizes scheduled occurrence sessions', () => {
    expect(isTriggeredSessionKey('sched_abc_occ1')).toBe(true);
    expect(isTriggeredSessionKey('scheduled_tasks')).toBe(true);
    expect(isTriggeredSessionKey('calendar_reminders')).toBe(true);
    expect(isTriggeredSessionKey('default')).toBe(false);
    expect(isTriggeredSessionKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });
});

describe('universal session hydration contract', () => {
  it('loadSessions swaps messages when active key changes', () => {
    expect(agentStoreSource).toMatch(/activeKeyChanged/);
    expect(agentStoreSource).toMatch(/invalidateHistoryHydration\(activeKey\)/);
    expect(agentStoreSource).toMatch(/updates\.chatMessages = cached \|\| \[\]/);
  });

  it('empty history retries apply to all session keys', () => {
    expect(agentStoreSource).toMatch(/EMPTY_HISTORY_MAX_RETRIES/);
    expect(agentStoreSource).toMatch(/if \(retryCount < EMPTY_HISTORY_MAX_RETRIES\)/);
    expect(agentStoreSource).not.toMatch(
      /if \(isTriggeredSessionKey\(requestedSessionKey\) && retryCount < EMPTY_HISTORY_MAX_RETRIES\)/,
    );
  });

  it('fallback reload and hydration invalidation apply to all keys', () => {
    expect(agentStoreSource).toMatch(/scheduleHistoryFallbackReload/);
    expect(agentStoreSource).toMatch(/function invalidateHistoryHydration/);
    expect(agentStoreSource).not.toMatch(/function invalidateTriggeredHistoryHydration/);
  });

  it('switchSession supports force refresh on the same key', () => {
    expect(agentStoreSource).toMatch(/switchSession: async \(key: string, options\?: \{ force\?: boolean \}\)/);
    expect(agentStoreSource).toMatch(/isRefresh && !options\?\.force\) return/);
    expect(agentStoreSource).toMatch(/invalidateHistoryHydration\(key\)/);
  });

  it('refreshActiveChatHistory invalidates then reloads', () => {
    expect(agentStoreSource).toMatch(/refreshActiveChatHistory: async/);
    expect(agentStoreSource).toMatch(/invalidateHistoryHydration\(activeSessionKey\)/);
  });

  it('only marks sessions hydrated when user or assistant content exists', () => {
    expect(agentStoreSource).toMatch(/hasPersistedUserOrAssistantContent/);
    expect(agentStoreSource).toMatch(/if \(hasUserOrAgentContent\) \{\s*historyHydratedKeys\.add\(requestedSessionKey\)/);
  });

  it('session_created auto-switches when idle (scheduled sessions)', () => {
    expect(agentStoreSource).toMatch(/case 'session_created':[\s\S]*invalidateHistoryHydration\(newKey\)/);
    expect(agentStoreSource).toMatch(/switchSession\(newKey, \{ force: true \}\)/);
  });

  it('agent_incident reloads missing user cards for any session', () => {
    expect(agentStoreSource).toMatch(/case 'agent_incident':[\s\S]*hasUserCard/);
    expect(agentStoreSource).not.toMatch(
      /case 'agent_incident':[\s\S]*if \(isTriggeredSessionKey\(eventSessionKey\)\)/,
    );
    expect(agentStoreSource).toMatch(/case 'session_history_ready':/);
  });

  it('openSpotlightSession always force-refreshes the target session', () => {
    expect(spotlightNavSource).toMatch(/switchSession\(sessionKey, \{ force: true \}\)/);
  });

  it('sidebar force-refreshes on session selection', () => {
    expect(spotlightSidebarSource).toMatch(/switchSession\(session\.key, \{ force: true \}\)/);
  });

  it('spotlight refreshes history when opened', () => {
    expect(spotlightSource).toMatch(/refreshActiveChatHistory/);
    expect(spotlightSource).toMatch(/if \(open && instanceId && activeSessionKey\)/);
  });
});
