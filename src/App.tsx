import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Desktop } from '@/components/desktop';
import { LoginScreen } from '@/components/auth';
import { ReturningUserScreen } from '@/components/screens/ReturningUserScreen';
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
import { useBillingStore } from '@/stores/billingStore';
import { installGlobalErrorHandlers } from '@/stores/errorStore';
import { DebugPanel } from '@/components/desktop/DebugPanel';
import { checkIsLeader, cleanupTabSingleton, onLeadershipYield } from '@/lib/tabSingleton';
import * as api from '@/services/api';
import analytics from '@/lib/analytics';
import { hasAgentAccess } from '@/lib/plans';

// Telegram Mini App — lazy loaded only when running inside Telegram.
const MiniApp = lazy(() =>
  import('@/components/mini/MiniApp').then((m) => ({ default: m.MiniApp })),
);

// Device link page — lazy loaded, only for /link route
const DeviceLinkPage = lazy(() =>
  import('@/components/auth/DeviceLinkPage').then((m) => ({ default: m.DeviceLinkPage })),
);

const AdminDashboard = lazy(() =>
  import('@/components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);

type RebootStatus = 'stopping' | 'updating' | 'starting' | 'done' | 'error';

/**
 * App orchestrates the full boot flow:
 *
 *   1. Black screen while checking auth
 *   2. If not logged in: Lock screen (login/register)
 *   3. On login success: lock screen shows provisioning progress → container ready → slide up
 *   4. If returning with valid session: lock screen shows provisioning → ready → slide up
 *   5. Lock Screen: slides lock screen back down without logging out
 *   6. Duplicate tab: shows lock screen with "already open" message
 */
function isTelegramMiniApp(): boolean {
  const tg = window.Telegram?.WebApp;
  return !!(tg && (tg as any).platform && (tg as any).platform !== 'unknown');
}

function isTelegramOAuthReturn(): boolean {
  if (window.location.pathname !== '/mini') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('token') || params.has('linked') || params.has('auth_error');
}

function App() {
  // Telegram Mini App — keep Telegram auth/linking, then render the mobile-optimized desktop.
  if (isTelegramMiniApp() || isTelegramOAuthReturn()) {
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

  if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-[#05070b]" />}>
        <AdminDashboard />
      </Suspense>
    );
  }

  return <WebAppShell />;
}

function WebAppShell() {
  // Capture a promo/referral code from the URL (?code=XXX) and stash it in
  // localStorage so we can offer it to the user once they finish onboarding.
  // Runs before the OAuth callback block so we can strip the param below.
  {
    const params = new URLSearchParams(window.location.search);
    const rawCode = params.get('code');
    if (rawCode && /^[A-Za-z0-9_-]{2,32}$/.test(rawCode)) {
      try {
        const code = rawCode.toUpperCase();
        localStorage.setItem('construct:promo_code', code);
        // New code → clear the "seen" flag so we show the modal again. The
        // flag now lives in sessionStorage (re-shows on every hard refresh);
        // we also nuke any legacy localStorage entry from before that move.
        sessionStorage.removeItem('construct:promo_seen');
        localStorage.removeItem('construct:promo_seen');
      } catch { /* storage unavailable */ }
      // Strip the param from the URL without a reload.
      params.delete('code');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
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

  const { user, isAuthenticated, isLoading: _authLoading, error: authError, logout, checkAuth, handleOAuthReturn } = useAuthStore();
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const fetchUsage = useBillingStore((s) => s.fetchUsage);
  const { isConnected, forceReconnect } = useWebSocket();
  const hasAccess = hasAgentAccess(user?.plan);

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

  // Once authenticated + active plan + leader tab, start provisioning the serverless agent.
  // Guard: don't retry if there's already an error, or if shutdown/power-on screen is showing
  // Don't provision at all for disabled/unsubscribed users — they must switch plans first.
  useEffect(() => {
    if (isAuthenticated && hasAccess && tabStatus === 'leader' && !computer && !computerLoading && !computerError) {
      fetchComputer();
    }
  }, [isAuthenticated, hasAccess, tabStatus, computer, computerLoading, computerError, fetchComputer]);

  // Preload desktop assets (wallpaper, dock icons) while the user waits
  // on the lock/provisioning screen. By the time the desktop renders,
  // everything is already in the browser cache.
  useEffect(() => {
    if (isAuthenticated) {
      preloadDesktopAssets();
    }
  }, [isAuthenticated]);

  // Slide up lock screen when the agent is ready OR the user is blocked (show desktop with subscription overlay).
  // Skip when the user has explicitly locked the screen (isLocked).
  useEffect(() => {
    const canSlide = isAuthenticated && authChecked && !lockScreenGone && !slidingUp && !isLocked;
    const ready = computer || !hasAccess; // blocked users go straight to desktop
    if (canSlide && ready) {
      const timer = setTimeout(() => {
        setSlidingUp(true);
        setTimeout(() => setLockScreenGone(true), 700);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasAccess, computer, authChecked, lockScreenGone, slidingUp, isLocked]);

  // loginKey forces LoginScreen to remount (replay hello animation) on logout
  const [loginKey, setLoginKey] = useState(0);

  const handleLogout = useCallback(() => {
    setLockScreenGone(false);
    setSlidingUp(false);
    setLoginKey(k => k + 1); // remount LoginScreen to replay hello animation
    logout();
  }, [logout]);

  // When user returns from billing, refresh auth and billing in-place instead
  // of dropping the desktop state with a full reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingStatus = params.get('billing_status');
    if (billingStatus === 'success' || billingStatus === 'portal_return') {
      window.history.replaceState({}, '', '/');
      void Promise.allSettled([checkAuth(), fetchSubscription(), fetchUsage()]);
    }
  }, [checkAuth, fetchSubscription, fetchUsage]);

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
      {/* Layer 1: App shell (bottom) — when authenticated (active plan with agent, or blocked with subscription overlay) */}
      {isAuthenticated && (computer || !hasAccess) && (
        <div className="fixed inset-0">
          <Desktop
            onLogout={handleLogout}
            onLockScreen={handleLockScreen}
            onReconnect={forceReconnect}
            isConnected={isConnected}
          />
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
                isProvisioning={hasAccess && (computerLoading || (!computer && !computerError))}
                provisionError={hasAccess ? computerError : null}
                onRetry={fetchComputer}
              />
          ) : (
            <LoginScreen key={loginKey} />
          )}
        </div>
      )}

      {/* Debug panel — staging only */}
      {window.location.hostname !== 'beta.construct.computer' && <DebugPanel />}
    </>
  );
}

export default App;
