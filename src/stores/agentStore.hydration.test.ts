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

describe('hydration loop prevention contract', () => {
  it('tracks pending history keys separately from settled hydration', () => {
    expect(agentStoreSource).toMatch(/const pendingHistoryKeys = new Set<string>\(\)/);
    expect(agentStoreSource).toMatch(/function markHistorySettled/);
    expect(agentStoreSource).toMatch(/function expectsHistoryContent/);
    expect(agentStoreSource).toMatch(/isTriggeredSessionKey\(sessionKey\)/);
  });

  it('empty history retries only when content is expected', () => {
    expect(agentStoreSource).toMatch(/if \(expectsHistoryContent\(requestedSessionKey\) && retryCount < EMPTY_HISTORY_MAX_RETRIES\)/);
    expect(agentStoreSource).not.toMatch(/if \(retryCount < EMPTY_HISTORY_MAX_RETRIES\) \{/);
  });

  it('marks new chats settled immediately on createSession', () => {
    expect(agentStoreSource).toMatch(/createSession:[\s\S]*markHistorySettled\(session\.key\)/);
    expect(agentStoreSource).toMatch(/cacheSessionMessages\(session\.key, \[\]\)/);
  });

  it('fallback reload is one-shot and bounded, not infinite', () => {
    expect(agentStoreSource).toMatch(/HISTORY_FALLBACK_MAX_ATTEMPTS/);
    expect(agentStoreSource).toMatch(/historyFallbackTimers/);
    expect(agentStoreSource).toMatch(/if \(attempts >= HISTORY_FALLBACK_MAX_ATTEMPTS\) \{\s*markHistorySettled\(sessionKey\)/);
  });

  it('refreshActiveChatHistory skips already-settled sessions unless forced', () => {
    expect(agentStoreSource).toMatch(/refreshActiveChatHistory: async \(options\?: \{ force\?: boolean \}\)/);
    expect(agentStoreSource).toMatch(
      /if \(!options\?\.force && historyHydratedKeys\.has\(activeSessionKey\) && !pendingHistoryKeys\.has\(activeSessionKey\)\)/,
    );
  });

  it('switchSession only invalidates on force when refresh is needed', () => {
    expect(agentStoreSource).toMatch(
      /if \(options\?\.force && \(pendingHistoryKeys\.has\(key\) \|\| !historyHydratedKeys\.has\(key\)\)\)/,
    );
  });

  it('session_created and session_history_ready mark pending and prefetch', () => {
    expect(agentStoreSource).toMatch(/case 'session_created':[\s\S]*pendingHistoryKeys\.add\(session\.key\)/);
    expect(agentStoreSource).not.toMatch(/case 'session_created':[\s\S]*invalidateHistoryHydration\(/);
    expect(agentStoreSource).toMatch(/case 'session_history_ready':[\s\S]*pendingHistoryKeys\.add\(readyKey\)/);
    expect(agentStoreSource).toMatch(/prefetchSessionHistory\(readyKey\)/);
  });

  it('exports shouldRefreshChatHistory for Spotlight entry points', () => {
    expect(agentStoreSource).toMatch(/export function shouldRefreshChatHistory/);
    expect(spotlightSource).toMatch(/shouldRefreshChatHistory\(activeSessionKey\)/);
    expect(spotlightSource).not.toMatch(/void refreshActiveChatHistory\(\);\s*\}\s*, \[instanceId, activeSessionKey, refreshActiveChatHistory\]\);\s*\n\s*\/\/ Re-fetch when Spotlight opens/);
  });

  it('sidebar does not always force-refresh on session selection', () => {
    expect(spotlightSidebarSource).toMatch(/shouldForceSessionRefresh\(session\.key\)/);
    expect(spotlightSidebarSource).not.toMatch(/switchSession\(session\.key, \{ force: true \}\)/);
  });

  it('openSpotlightSession still force-refreshes notification targets', () => {
    expect(spotlightNavSource).toMatch(/switchSession\(sessionKey, \{ force: true \}\)/);
  });

  it('successful history load calls markHistorySettled', () => {
    expect(agentStoreSource).toMatch(/markHistorySettled\(requestedSessionKey\)/);
  });

  it('external sessions finalize running activity on idle without desktop success heuristics', () => {
    expect(agentStoreSource).toMatch(/if \(inferExternalPlatform\(eventSessionKey\)\) return finalizeRunningActivities\(cleared\)/);
  });
});
