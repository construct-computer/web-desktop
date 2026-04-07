import { useCallback, useEffect, useRef } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { browserWS, agentWS } from '@/services/websocket';

/**
 * Hook to manage WebSocket connection lifecycle.
 *
 * When disconnected:
 *  1. Retries every 5s (resets WS backoff so it's instant each attempt)
 *  2. Retries immediately when the browser tab becomes visible
 *  3. Exposes `forceReconnect` for manual retry (e.g. clicking the wifi icon)
 */
export function useWebSocket() {
  const instanceId = useComputerStore((s) => s.instanceId);
  const browserConnected = useComputerStore((s) => s.browserState.connected);
  const agentConnected = useComputerStore((s) => s.agentConnected);

  const isConnected = browserConnected || agentConnected;
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Force-reconnect all WS clients, resetting their backoff. */
  const forceReconnect = useCallback(() => {
    browserWS.forceReconnect();
    agentWS.forceReconnect();
    // Terminal WS reconnects are handled by TerminalWindow;
    // we don't force those from here.
  }, []);

  // ── Periodic retry when disconnected ──
  // When both WS are down, poll every 5s to force-reconnect.
  // Cleared as soon as either connection comes back.
  useEffect(() => {
    if (!instanceId) return;

    if (!isConnected) {
      // Start polling if not already
      if (!retryRef.current) {
        retryRef.current = setInterval(() => {
          forceReconnect();
        }, 5_000);
      }
    } else {
      // Connected — stop polling
      if (retryRef.current) {
        clearInterval(retryRef.current);
        retryRef.current = null;
      }
    }

    return () => {
      if (retryRef.current) {
        clearInterval(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [instanceId, isConnected, forceReconnect]);

  // ── Visibility-change reconnect ──
  // When user switches back to this tab and we're disconnected, retry immediately.
  useEffect(() => {
    if (!instanceId) return;

    const onVisibilityChange = () => {
      if (!document.hidden) {
        const state = useComputerStore.getState();
        const connected = state.browserState.connected || state.agentConnected;
        if (!connected) {
          forceReconnect();
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [instanceId, forceReconnect]);

  // ── Online event reconnect ──
  // When the browser regains network connectivity, retry immediately.
  useEffect(() => {
    if (!instanceId) return;

    const onOnline = () => {
      forceReconnect();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [instanceId, forceReconnect]);

  return { isConnected, forceReconnect };
}
