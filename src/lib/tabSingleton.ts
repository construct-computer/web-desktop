/**
 * Tab singleton — ensures only one tab runs the desktop at a time.
 *
 * Uses BroadcastChannel to detect other tabs:
 *   - New tab sends a "ping" on mount
 *   - Existing leader tab responds with "pong"
 *   - If pong received → this tab is a duplicate
 *   - If no pong within 300ms → this tab becomes the leader
 *   - Duplicate can send "takeover" to force the leader to yield
 */

import { TAB_SINGLETON_CHANNEL } from './config';

const CHANNEL_NAME = TAB_SINGLETON_CHANNEL;

let leaderChannel: BroadcastChannel | null = null;
let onYield: (() => void) | null = null;

/**
 * Check if another tab is already running the desktop.
 * Resolves to true if this tab should be the leader, false if duplicate.
 */
export function checkIsLeader(): Promise<boolean> {
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(CHANNEL_NAME);

    const timeout = setTimeout(() => {
      ch.close();
      // No response — we are the leader
      becomeLeader();
      resolve(true);
    }, 300);

    ch.onmessage = (e) => {
      if (e.data.type === 'pong') {
        clearTimeout(timeout);
        ch.close();
        resolve(false);
      }
    };

    ch.postMessage({ type: 'ping' });
  });
}

/**
 * Start listening as the leader tab.
 */
function becomeLeader() {
  if (leaderChannel) leaderChannel.close();
  leaderChannel = new BroadcastChannel(CHANNEL_NAME);

  leaderChannel.onmessage = (e) => {
    if (e.data.type === 'ping') {
      leaderChannel!.postMessage({ type: 'pong' });
    }
    if (e.data.type === 'focus') {
      window.focus();
    }
    if (e.data.type === 'takeover') {
      // Another tab wants to become the leader — yield
      leaderChannel!.postMessage({ type: 'yielded' });
      leaderChannel!.close();
      leaderChannel = null;
      if (onYield) onYield();
    }
  };
}

/**
 * Register a callback for when this tab is forced to yield leadership.
 */
export function onLeadershipYield(callback: () => void) {
  onYield = callback;
}

/**
 * Ask the leader tab to focus itself, then try to close this tab.
 */
export function focusLeaderTab() {
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.postMessage({ type: 'focus' });
  ch.close();
  window.close();
}

/**
 * Take over leadership from the current leader tab.
 * Sends a "takeover" message and waits for the leader to yield.
 * Returns a promise that resolves when this tab is the new leader.
 */
export function takeoverLeadership(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(CHANNEL_NAME);

    const timeout = setTimeout(() => {
      // Leader didn't respond — it might have crashed. Become leader anyway.
      ch.close();
      becomeLeader();
      resolve();
    }, 500);

    ch.onmessage = (e) => {
      if (e.data.type === 'yielded') {
        clearTimeout(timeout);
        ch.close();
        becomeLeader();
        resolve();
      }
    };

    ch.postMessage({ type: 'takeover' });
  });
}

/**
 * Clean up when unmounting.
 */
export function cleanupTabSingleton() {
  if (leaderChannel) {
    leaderChannel.close();
    leaderChannel = null;
  }
  onYield = null;
}
