import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Desktop } from '@/components/desktop';
import { LoginScreen } from '@/components/auth';
import { ReturningUserScreen } from '@/components/screens/ReturningUserScreen';
import { DuplicateTabScreen } from '@/components/screens/DuplicateTabScreen';
import { FirstRunScene } from '@/components/boot/FirstRunScene';
import { BOOT_EVENTS, type BootPhase } from '@/hooks/useBootPhase';
import { computeWallpaperBlur, LOCK_SCREEN_EASING, LOCK_SCREEN_TRANSITION_MS, shouldHideDesktopChrome, shouldShowDesktop } from '@/lib/desktopReveal';
import { handleOAuthCallbackParams } from '@/lib/oauthCallback';
// SubscriptionGate replaced by SubscribeWindow (app window instead of full-screen overlay)
import { useAuthStore } from '@/stores/authStore';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import { useAgentTrackerStore } from '@/stores/agentTrackerStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { preloadAllSounds, installGlobalClickSound, unlockAudio } from '@/lib/sounds';
import { useSettingsStore } from '@/stores/settingsStore';
import { useBillingStore } from '@/stores/billingStore';
import { useAppStore } from '@/stores/appStore';
import { DebugPanel } from '@/components/desktop/DebugPanel';
import { checkIsLeader, cleanupTabSingleton, onLeadershipYield } from '@/lib/tabSingleton';
import * as api from '@/services/api';
import { hasAgentAccess } from '@/lib/plans';
import { getCurrentDeviceId, getNativePlatform, isNativePlatform, syncNativePushRegistration } from '@/native';
import { capturePageview, track } from '@/lib/analytics';

// Telegram Mini App — lazy loaded only when running inside Telegram.
const MiniApp = lazy(() =>
  import('@/components/mini/MiniApp').then((m) => ({ default: m.MiniApp })),
);

// Device link page — lazy loaded, only for /link route
const DeviceLinkPage = lazy(() =>
  import('@/components/auth/DeviceLinkPage').then((m) => ({ default: m.DeviceLinkPage })),
);

type RebootStatus = 'stopping' | 'updating' | 'starting' | 'done' | 'error';
type AuthSessionSurface = 'web' | 'mobile_app' | 'desktop_app' | 'telegram_mini';

function detectAuthSessionSurface(): AuthSessionSurface {
  if (isNativePlatform()) return 'mobile_app';
  if (/ConstructDesktop/i.test(navigator.userAgent || '')) return 'desktop_app';
  return 'web';
}

function currentDeviceLabel(surface: AuthSessionSurface): string | undefined {
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  const mobile = /iPhone|iPad|Android/i.exec(ua)?.[0];
  if (surface === 'mobile_app') {
    const nativePlatform = getNativePlatform();
    const label = nativePlatform === 'ios' ? 'iOS app' : nativePlatform === 'android' ? 'Android app' : 'Mobile app';
    return [label, mobile || platform].filter(Boolean).join(' · ');
  }
  if (surface === 'desktop_app') {
    return ['Desktop app', platform].filter(Boolean).join(' · ');
  }
  return undefined;
}

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
  if (window.location.pathname === '/oauth/callback') {
    return <OAuthCallbackCloser />;
  }

  // Telegram Mini App — keep Telegram auth/linking, then render the mobile-optimized desktop.
  if (isTelegramMiniApp() || isTelegramOAuthReturn()) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <MiniAppWithAnalytics />
      </Suspense>
    );
  }

  // Device link page — approve device codes from NotchConstruct
  if (window.location.pathname === '/link') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <DeviceLinkWithAnalytics />
      </Suspense>
    );
  }

  return <WebAppShell />;
}

function MiniAppWithAnalytics() {
  useEffect(() => {
    capturePageview('mini', { boot_phase: 'mini' });
  }, []);
  return <MiniApp />;
}

function DeviceLinkWithAnalytics() {
  useEffect(() => {
    capturePageview('device_link', { boot_phase: 'device_link' });
  }, []);
  return <DeviceLinkPage />;
}

function OAuthCallbackCloser() {
  const params = new URLSearchParams(window.location.search);
  const isError = params.get('discord') === 'error' || params.has('composio_error');
  const error = params.get('discord_error') || params.get('composio_error') || 'OAuth failed';

  useEffect(() => {
    const payload = { type: 'construct:oauth-callback', params: Object.fromEntries(params) };
    try {
      const ch = new BroadcastChannel('construct:oauth');
      ch.postMessage(payload);
      ch.close();
    } catch { /* not supported */ }
    if (window.opener) {
      try { window.opener.postMessage(payload, '*'); } catch { /* cross-origin */ }
    }
    window.close();
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0f1117] text-white">
      <div className="text-center space-y-3">
        <div className="text-sm font-medium">{isError ? `OAuth failed: ${error}` : 'Connected. You can close this window.'}</div>
        <button
          type="button"
          onClick={() => window.close()}
          className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15"
        >
          Close this window
        </button>
      </div>
    </div>
  );
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
    const hasCallback = params.has('slack') || params.has('discord') || params.has('drive') || params.has('calendar') ||
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
  const [bootPhase, setBootPhase] = useState<BootPhase>('lock');
  const [firstRunExiting, setFirstRunExiting] = useState(false);
  const [desktopEntering, setDesktopEntering] = useState(false);

  // Tab singleton state: 'checking' | 'leader' | 'duplicate'
  const [tabStatus, setTabStatus] = useState<'checking' | 'leader' | 'duplicate'>('checking');

  const { user, isAuthenticated, isLoading: _authLoading, error: authError, logout, handleRemoteLogout, checkAuth, handleOAuthReturn } = useAuthStore();
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const fetchUsage = useBillingStore((s) => s.fetchUsage);
  const prefetchApps = useAppStore((s) => s.fetchApps);
  const { isConnected, forceReconnect: wsForceReconnect } = useWebSocket();
  const forceReconnect = useCallback(() => {
    track('ws_reconnect', { manual: true });
    wsForceReconnect();
  }, [wsForceReconnect]);
  const hasAccess = hasAgentAccess(user?.plan);

  const computer = useComputerStore((s) => s.computer);
  const computerLoading = useComputerStore((s) => s.isLoading);
  const computerError = useComputerStore((s) => s.error);
  const fetchComputer = useComputerStore((s) => s.fetchComputer);
  const unsubscribeFromComputer = useComputerStore((s) => s.unsubscribeFromComputer);

  const firstRunDone = Boolean(user?.setupCompleted && user?.onboardingCompleted);
  const needsFirstRun = isAuthenticated && !firstRunDone;
  const computerReady = Boolean(computer || !hasAccess);
  const showDesktop = shouldShowDesktop(isAuthenticated, computerReady) && !needsFirstRun;
  const wallpaperBlur = computeWallpaperBlur(lockScreenGone);
  const chromeHidden = shouldHideDesktopChrome(lockScreenGone, slidingUp);

  // Install sound handling, handle OAuth callback, and check auth on mount.
  useEffect(() => {
    preloadAllSounds();
    unlockAudio();
    const cleanup = installGlobalClickSound(() => useSettingsStore.getState().soundEnabled);

    // Check if this is a magic link click (magic_token in URL) — redirect to backend verify
    if (api.handleMagicLinkRedirect()) {
      // Page is navigating away; don't continue initialization
      return cleanup;
    }

    const finishOAuthReturn = () => handleOAuthReturn().then((oauthHandled) => {
      if (!oauthHandled) {
        // No OAuth callback — check existing session
        return checkAuth().then(() => setAuthChecked(true));
      } else {
        setAuthChecked(true);
      }
    });

    // Check if this is an OAuth callback (token or error in URL)
    void finishOAuthReturn();
    handleOAuthCallbackParams();

    const onNativeUrlOpen = () => {
      void finishOAuthReturn();
    };

    window.addEventListener('construct:native-url-open', onNativeUrlOpen);

    return () => {
      window.removeEventListener('construct:native-url-open', onNativeUrlOpen);
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

  useEffect(() => {
    if (!isAuthenticated || !authChecked || !user?.id) return;
    void prefetchApps();
  }, [isAuthenticated, authChecked, user?.id, prefetchApps]);

  useEffect(() => {
    if (!isAuthenticated || !authChecked || !user?.id) return;
    void syncNativePushRegistration();
  }, [isAuthenticated, authChecked, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !authChecked || !user?.id) return;

    let checkingSession = false;

    const heartbeat = async () => {
      if (checkingSession) return;
      checkingSession = true;
      const surface = detectAuthSessionSurface();
      const result = await api.heartbeatAuthSession({
        surface,
        deviceId: getCurrentDeviceId(),
        deviceLabel: currentDeviceLabel(surface),
        userAgent: navigator.userAgent,
      });
      checkingSession = false;

      if (api.isAuthRevokedResult(result)) {
        handleRemoteLogout();
      }
    };

    void heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    const onVisibilityOrFocus = () => {
      if (!document.hidden) void heartbeat();
    };
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);
    window.addEventListener('online', onVisibilityOrFocus);
    window.addEventListener('construct:native-resume', onVisibilityOrFocus);
    window.addEventListener('construct:auth-revoked', handleRemoteLogout);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
      window.removeEventListener('online', onVisibilityOrFocus);
      window.removeEventListener('construct:native-resume', onVisibilityOrFocus);
      window.removeEventListener('construct:auth-revoked', handleRemoteLogout);
    };
  }, [isAuthenticated, authChecked, user?.id, handleRemoteLogout]);

  // Slide up lock screen when the agent is ready OR the user is blocked (show desktop with subscription overlay).
  // Skip when the user has explicitly locked the screen (isLocked).
  useEffect(() => {
    const canSlide = isAuthenticated && authChecked && !lockScreenGone && !slidingUp && !isLocked;
    const ready = computer || !hasAccess;
    if (canSlide && ready) {
      const timer = setTimeout(() => {
        setSlidingUp(true);
        if (!needsFirstRun) {
          setBootPhase('desktop');
        }
        setTimeout(() => {
          setLockScreenGone(true);
          if (needsFirstRun) {
            setBootPhase('first_run');
          } else {
            window.dispatchEvent(new Event(BOOT_EVENTS.desktopRevealed));
          }
        }, LOCK_SCREEN_TRANSITION_MS);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasAccess, computer, authChecked, lockScreenGone, slidingUp, isLocked, needsFirstRun]);

  useEffect(() => {
    const onOnboardingComplete = () => {
      setFirstRunExiting(true);
      window.setTimeout(() => {
        setFirstRunExiting(false);
        setBootPhase('desktop_enter');
        setDesktopEntering(true);
      }, 320);
    };
    window.addEventListener(BOOT_EVENTS.onboardingComplete, onOnboardingComplete);
    return () => window.removeEventListener(BOOT_EVENTS.onboardingComplete, onOnboardingComplete);
  }, []);

  const handleDesktopEnterComplete = useCallback(() => {
    setBootPhase('desktop');
    setDesktopEntering(false);
    window.dispatchEvent(new Event(BOOT_EVENTS.desktopRevealed));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !authChecked || !lockScreenGone || !computerReady) return;
    if (needsFirstRun && bootPhase !== 'desktop_enter' && bootPhase !== 'desktop') {
      setBootPhase('first_run');
    }
  }, [isAuthenticated, authChecked, lockScreenGone, computerReady, needsFirstRun, bootPhase]);

  useEffect(() => {
    if (!authChecked) return;

    let screen = 'login';
    let bootPhaseLabel = bootPhase;

    if (!isAuthenticated) {
      screen = 'login';
    } else if (!lockScreenGone) {
      screen = needsFirstRun ? 'onboarding' : 'provisioning';
      bootPhaseLabel = 'lock';
    } else if (bootPhase === 'first_run' || firstRunExiting) {
      screen = 'onboarding';
    } else if (bootPhase === 'desktop_enter' || bootPhase === 'desktop') {
      screen = 'desktop';
    }

    capturePageview(screen, {
      boot_phase: bootPhaseLabel,
      authenticated: isAuthenticated,
      has_access: hasAccess,
    });
  }, [
    authChecked,
    isAuthenticated,
    lockScreenGone,
    bootPhase,
    firstRunExiting,
    needsFirstRun,
    hasAccess,
  ]);

  // loginKey forces LoginScreen to remount (replay hello animation) on logout
  const [loginKey, setLoginKey] = useState(0);

  const handleLogout = useCallback(() => {
    setLockScreenGone(false);
    setSlidingUp(false);
    setBootPhase('lock');
    setFirstRunExiting(false);
    setDesktopEntering(false);
    setLoginKey(k => k + 1);
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
    if (!needsFirstRun) {
      setBootPhase('desktop');
    }
    setTimeout(() => {
      setLockScreenGone(true);
      setIsLocked(false);
      if (needsFirstRun) {
        setBootPhase('first_run');
      } else {
        window.dispatchEvent(new Event(BOOT_EVENTS.desktopRevealed));
      }
    }, LOCK_SCREEN_TRANSITION_MS);
  }, [needsFirstRun]);

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
      {showDesktop && (
        <div className="fixed inset-0">
          <Desktop
            onLogout={handleLogout}
            onLockScreen={handleLockScreen}
            onReconnect={forceReconnect}
            isConnected={isConnected}
            entering={desktopEntering}
            wallpaperBlur={wallpaperBlur}
            chromeHidden={chromeHidden}
            onEnterComplete={handleDesktopEnterComplete}
          />
        </div>
      )}

      {(bootPhase === 'first_run' || firstRunExiting) && lockScreenGone && (
        <FirstRunScene exiting={firstRunExiting} />
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
              ? `transform ${LOCK_SCREEN_TRANSITION_MS}ms ${LOCK_SCREEN_EASING}`
              : slidingDown
                ? `transform 500ms ${LOCK_SCREEN_EASING}`
                : 'none',
          }}
        >
          {isAuthenticated ? (
              <ReturningUserScreen
                onUnlock={isLocked ? handleUnlock : undefined}
                isProvisioning={hasAccess && (computerLoading || (!computer && !computerError))}
                provisionError={hasAccess ? computerError : null}
                onRetry={fetchComputer}
                variant={needsFirstRun ? 'first_run' : 'returning'}
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
