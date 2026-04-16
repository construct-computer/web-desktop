import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Desktop } from '@/components/desktop';
import { LoginScreen } from '@/components/auth';
import { ReturningUserScreen } from '@/components/screens/ReturningUserScreen';
// WelcomeScreen merged into LoginScreen — kept for power-on-after-shutdown only
import { WelcomeScreen } from '@/components/screens/WelcomeScreen';
import { DuplicateTabScreen } from '@/components/screens/DuplicateTabScreen';
// SubscriptionGate replaced by SubscribeWindow (app window instead of full-screen overlay)
import { useAuthStore } from '@/stores/authStore';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useAgentTrackerStore } from '@/stores/agentTrackerStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { preloadAllSounds, installGlobalClickSound, unlockAudio } from '@/lib/sounds';
import { preloadAllAssets, preloadDesktopAssets } from '@/lib/preload';
import { useSettingsStore } from '@/stores/settingsStore';
import { installGlobalErrorHandlers } from '@/stores/errorStore';
import { DebugPanel } from '@/components/desktop/DebugPanel';
import { checkIsLeader, cleanupTabSingleton, onLeadershipYield } from '@/lib/tabSingleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import * as api from '@/services/api';
import analytics from '@/lib/analytics';

// Telegram Mini App — lazy loaded, only for /mini route
const MiniApp = lazy(() =>
  import('@/components/mini/MiniApp').then((m) => ({ default: m.MiniApp })),
);

// Mobile browser shell — lazy loaded, only for mobile viewports
const BrowserShell = lazy(() =>
  import('@/components/mobile/BrowserShell').then((m) => ({ default: m.BrowserShell })),
);

// Device link page — lazy loaded, only for /link route
const DeviceLinkPage = lazy(() =>
  import('@/components/auth/DeviceLinkPage').then((m) => ({ default: m.DeviceLinkPage })),
);

type RebootStatus = 'stopping' | 'updating' | 'starting' | 'done' | 'error';

/**
 * App orchestrates the full boot flow:
 *
 *   1. Black screen while checking auth
 *   2. If not logged in: WelcomeScreen → Lock screen (login/register)
 *   3. On login success: lock screen shows provisioning progress → container ready → slide up
 *   4. If returning with valid session: lock screen shows provisioning → ready → slide up
 *   5. Lock Screen: slides lock screen back down without logging out
 *   6. Restart: shows rebooting screen, calls backend reboot, re-provisions
 *   7. Shutdown: cinematic goodbye → black → power-on screen
 *   8. Duplicate tab: shows lock screen with "already open" message
 */
function App() {
  // Telegram Mini App — bypass everything else when on /mini
  if (window.location.pathname === '/mini') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <MiniApp />
      </Suspense>
    );
  }

  // Device link page — approve device codes from NotchConstruct
  if (window.location.pathname === '/link') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <DeviceLinkPage />
      </Suspense>
    );
  }

  // OAuth popup auto-close: if this page has callback params, it's an OAuth redirect.
  // Notify the parent window (if any) and close. Works even if window.opener is null
  // (some browsers clear it during multi-page OAuth redirects).
  {
    const params = new URLSearchParams(window.location.search);
    const hasCallback = params.has('slack') || params.has('drive') || params.has('calendar') ||
      params.has('composio_connected') || params.has('composio_error');
    if (hasCallback) {
      // Notify parent via BroadcastChannel (works even without window.opener)
      try {
        const ch = new BroadcastChannel('construct:oauth');
        ch.postMessage({ type: 'construct:oauth-callback', params: Object.fromEntries(params) });
        ch.close();
      } catch { /* not supported */ }
      // Also try postMessage to opener (direct parent reference)
      if (window.opener) {
        try {
          window.opener.postMessage({ type: 'construct:oauth-callback', params: Object.fromEntries(params) }, '*');
        } catch { /* cross-origin */ }
      }
      // Clean URL and try to close
      window.history.replaceState({}, '', '/');
      window.close();
      // If window.close() didn't work (not a popup), fall through to normal app
      // The BroadcastChannel already notified the main tab
    }
  }

  const [authChecked, setAuthChecked] = useState(false);
  const [slidingUp, setSlidingUp] = useState(false);
  const [lockScreenGone, setLockScreenGone] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [slidingDown, setSlidingDown] = useState(false);

  // Tab singleton state: 'checking' | 'leader' | 'duplicate'
  const [tabStatus, setTabStatus] = useState<'checking' | 'leader' | 'duplicate'>('checking');

  // Power-on state (after first visit or logout)
  const [showPowerOn, setShowPowerOn] = useState(false);

  const { user, isAuthenticated, isLoading: _authLoading, error: authError, logout, checkAuth, handleOAuthReturn } = useAuthStore();
  const { isConnected, forceReconnect } = useWebSocket();
  const isMobile = useIsMobile();
  const isSubscribed = user?.plan === 'pro' || user?.plan === 'starter' || user?.plan === 'free';

  const computer = useComputerStore((s) => s.computer);
  const computerLoading = useComputerStore((s) => s.isLoading);
  const computerError = useComputerStore((s) => s.error);
  const fetchComputer = useComputerStore((s) => s.fetchComputer);
  const unsubscribeFromComputer = useComputerStore((s) => s.unsubscribeFromComputer);

  // Preload sounds, install global click listener, error handlers, handle OAuth callback, and check auth on mount
  useEffect(() => {
    installGlobalErrorHandlers();
    preloadAllAssets();
    preloadAllSounds();
    unlockAudio();
    const cleanup = installGlobalClickSound(() => useSettingsStore.getState().soundEnabled);

    // Check if this is a magic link click (magic_token in URL) — redirect to backend verify
    if (api.handleMagicLinkRedirect()) {
      // Page is navigating away; don't continue initialization
      return cleanup;
    }

    // Check if this is an OAuth callback (token or error in URL)
    handleOAuthReturn().then((oauthHandled) => {
      if (!oauthHandled) {
        // No OAuth callback — check existing session
        checkAuth().then(() => setAuthChecked(true));
      } else {
        setAuthChecked(true);
      }
    });

    return () => {
      cleanup();
      cleanupTabSingleton();
    };
  }, [checkAuth, handleOAuthReturn]);

  // Check tab singleton once authenticated
  useEffect(() => {
    if (!isAuthenticated || !authChecked) return;

    checkIsLeader().then((isLeader) => {
      setTabStatus(isLeader ? 'leader' : 'duplicate');
      if (isLeader) {
        // If another tab takes over, show the duplicate screen
        onLeadershipYield(() => {
          setTabStatus('duplicate');
        });
      }
    });

    return () => cleanupTabSingleton();
  }, [isAuthenticated, authChecked]);

  // (Welcome animation now built into LoginScreen — no separate trigger needed)

  // Once authenticated + subscribed + leader tab, start provisioning the container
  // Guard: don't retry if there's already an error, or if shutdown/power-on screen is showing
  // Don't provision at all for unsubscribed users — they must subscribe first
  useEffect(() => {
    if (isAuthenticated && isSubscribed && tabStatus === 'leader' && !computer && !computerLoading && !computerError && !showPowerOn) {
      fetchComputer();
    }
  }, [isAuthenticated, isSubscribed, tabStatus, computer, computerLoading, computerError, showPowerOn, fetchComputer]);

  // Preload desktop assets (wallpaper, dock icons) while the user waits
  // on the lock/provisioning screen. By the time the desktop renders,
  // everything is already in the browser cache.
  useEffect(() => {
    if (isAuthenticated) {
      preloadDesktopAssets();
    }
  }, [isAuthenticated]);

  // Slide up lock screen when container is ready OR user is unsubscribed (show desktop with subscribe window).
  // Skip when the user has explicitly locked the screen (isLocked).
  useEffect(() => {
    const canSlide = isAuthenticated && authChecked && !lockScreenGone && !slidingUp && !isLocked;
    const ready = computer || !isSubscribed; // unsubscribed users go straight to desktop
    if (canSlide && ready) {
      const timer = setTimeout(() => {
        setSlidingUp(true);
        setTimeout(() => setLockScreenGone(true), 700);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isSubscribed, computer, authChecked, lockScreenGone, slidingUp, isLocked]);

  // loginKey forces LoginScreen to remount (replay hello animation) on logout
  const [loginKey, setLoginKey] = useState(0);

  const handleLogout = useCallback(() => {
    setLockScreenGone(false);
    setSlidingUp(false);
    setLoginKey(k => k + 1); // remount LoginScreen to replay hello animation
    logout();
  }, [logout]);

  // When user subscribes or changes plan, reload the tab to pick up the new plan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingStatus = params.get('billing_status');
    if (billingStatus === 'success' || billingStatus === 'portal_return') {
      // Clear URL params and reload to pick up the new plan
      window.history.replaceState({}, '', '/');
      window.location.reload();
    }
  }, []);

  // ── Lock Screen: slide in from top ──
  const handleLockScreen = useCallback(() => {
    setSlidingUp(false);
    setSlidingDown(false);
    setLockScreenGone(false);
    setIsLocked(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSlidingDown(true);
      });
    });
  }, []);

  // ── Unlock: slide the lock screen back up ──
  const handleUnlock = useCallback(() => {
    setSlidingDown(false);
    setSlidingUp(true);
    setTimeout(() => {
      setLockScreenGone(true);
      setIsLocked(false);
    }, 700);
  }, []);

  // ── Clear all frontend state for a fresh session ──
  const resetAllStores = useCallback(() => {
    // Stop all running agents before clearing state
    useComputerStore.getState().stopAgent();
    // Close all windows and clear all non-main workspaces
    useWindowStore.getState().closeAll();
    useWindowStore.getState().clearNonMainWorkspaces();
    // Reset all tracking state
    useAgentTrackerStore.getState().resetAll();
    useNotificationStore.getState().clearAll();
    // Clear platform agent state (tool history, response text, etc.)
    useComputerStore.setState({
      platformAgents: {},
      agentRunning: false,
      agentThinking: null,
      taskProgress: null,
      agentActivity: {},
      todoList: null,
    });
    // editorStore auto-clears when last editor window closes via closeAll()
  }, []);

  // Restart/Shutdown removed — no containers in serverless mode.
  // Agent persists in Durable Object and reconnects on page load.

  // Called when the WelcomeScreen finishes its boot animation after shutdown
  const handlePowerOnComplete = useCallback(() => {
    setShowPowerOn(false);
    // fetchComputer will be triggered by the useEffect that watches
    // isAuthenticated && !computer && !showPowerOn
  }, []);

  // ── Black screen while checking auth ──
  if (!authChecked) {
    return <div className="fixed inset-0 bg-black" />;
  }

  // ── Duplicate tab — show lock screen with message ──
  if (isAuthenticated && tabStatus === 'duplicate') {
    return <DuplicateTabScreen />;
  }

  return (
    <>
      {/* Layer 1: App shell (bottom) — when authenticated (subscribed with computer, or unsubscribed with subscribe window) */}
      {isAuthenticated && (computer || !isSubscribed) && (
        <div className="fixed inset-0">
          {isMobile ? (
            <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
              <BrowserShell />
            </Suspense>
          ) : (
            <Desktop
              onLogout={handleLogout}
              onLockScreen={handleLockScreen}
              onReconnect={forceReconnect}
              isConnected={isConnected}
            />
          )}
        </div>
      )}

      {/* Layer 2: Lock screen — slides up when container is ready */}
      {!lockScreenGone && (
        <div
          className="fixed inset-0"
          style={{
            zIndex: 9999,
            transform: slidingUp
              ? 'translateY(-100%)'
              : isLocked && !slidingDown
                ? 'translateY(-100%)'
                : 'translateY(0)',
            transition: slidingUp
              ? 'transform 0.7s cubic-bezier(0.4, 0.0, 0.2, 1)'
              : slidingDown
                ? 'transform 0.5s cubic-bezier(0.4, 0.0, 0.2, 1)'
                : 'none',
          }}
        >
          {isAuthenticated ? (
              <ReturningUserScreen
                onUnlock={isLocked ? handleUnlock : undefined}
                isProvisioning={isSubscribed && (computerLoading || (!computer && !computerError))}
                provisionError={isSubscribed ? computerError : null}
                onRetry={fetchComputer}
              />
          ) : (
            <LoginScreen key={loginKey} />
          )}
        </div>
      )}

      {/* Layer 3: Power-on welcome (after shutdown only) */}
      {showPowerOn && isAuthenticated && (
        <WelcomeScreen onComplete={handlePowerOnComplete} />
      )}

      {/* Debug panel — staging only */}
      {window.location.hostname !== 'beta.construct.computer' && <DebugPanel />}
    </>
  );
}

export default App;
