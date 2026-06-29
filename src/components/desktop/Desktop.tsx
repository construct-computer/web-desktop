import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { Wallpaper } from './Wallpaper';
import { MenuBar } from './MenuBar';
import { Dock } from './Dock';
import { MobileAppBar } from './MobileAppBar';
import { MissionControl, MissionControlScrim } from './MissionControl';
import { Launchpad } from './Launchpad';
import { Spotlight } from './Spotlight';
import { ChatWindowOverlay } from './ChatWindowOverlay';
import { AgentGraphWidget } from './AgentGraphWidget';
import { ClippyWidget } from './ClippyWidget';
import { NotificationCenter } from './NotificationCenter';
import { Toasts } from '@/components/ui';
import { WindowManager } from '@/components/window';
import { useWindowStore } from '@/stores/windowStore';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDesktopTour } from '@/hooks/useDesktopTour';
import { BOOT_EVENTS } from '@/hooks/useBootPhase';
import { PromoCodeModal } from '@/components/apps/PromoCodeModal';
import { MobileDesktopBackground } from './MobileDesktopBackground';
import { validateDiscountCode } from '@/services/api';
// import { getEmailStatus } from '@/services/agentmail'; // removed — tour trigger no longer depends on email status
import { MENUBAR_HEIGHT, MOBILE_MENUBAR_HEIGHT, MOBILE_APP_BAR_HEIGHT, Z_INDEX, STORAGE_KEYS } from '@/lib/constants';
import { openSpotlightSession } from '@/lib/spotlightNav';
import { hasAgentAccess } from '@/lib/plans';
import { openSettingsToSection, openSubscribeWindow } from '@/lib/settingsNav';

// ── Workspace slide constants ──────────────────────────────────────

const WS_SLIDE_DURATION = 400; // ms
const WS_SLIDE_EASING = 'cubic-bezier(0.42, 0, 0.16, 1.0)';

// ── Desktop ──────────────────────────────────────────────────────────

interface DesktopProps {
  onLogout?: () => void;
  onLockScreen?: () => void;
  onReconnect?: () => void;
  isConnected?: boolean;
  entering?: boolean;
  wallpaperBlur?: number;
  chromeHidden?: boolean;
  onEnterComplete?: () => void;
}

/** Instant hide while lock overlay covers desktop — no slide animation. */
export function chromeVisibilityStyle(chromeHidden: boolean): CSSProperties {
  return chromeHidden
    ? { visibility: 'hidden', pointerEvents: 'none' }
    : {};
}

export function wallpaperContainerStyle(wallpaperBlur: number): CSSProperties {
  if (wallpaperBlur <= 0) return {};
  return {
    filter: `blur(${wallpaperBlur}px) saturate(1.25)`,
    transform: 'scale(1.02)',
    transition: 'filter 700ms ease-out, transform 700ms ease-out',
  };
}

export function Desktop({
  onLogout,
  onLockScreen,
  onReconnect,
  isConnected,
  entering = false,
  wallpaperBlur = 0,
  chromeHidden = false,
  onEnterComplete,
}: DesktopProps) {
  const { openWindow } = useWindowStore();
  const missionControlActive = useWindowStore((s) => s.missionControlActive);
  const closeMissionControl = useWindowStore((s) => s.closeMissionControl);
  const workspaceTransition = useWindowStore((s) => s.workspaceTransition);
  const completeWorkspaceTransition = useWindowStore((s) => s.completeWorkspaceTransition);
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const topBarHeight = isMobile ? MOBILE_MENUBAR_HEIGHT : MENUBAR_HEIGHT;

  useEffect(() => {
    if (!entering) return;
    window.dispatchEvent(new Event(BOOT_EVENTS.postOnboardingDesktopReady));
    onEnterComplete?.();
  }, [entering, onEnterComplete]);

  // ── Workspace slide animation ──────────────────────────────────────
  // The sliding container wraps WindowManager. During a workspace transition,
  // it translates by ±screenWidth to slide all windows (from + to) together.
  const [isSliding, setIsSliding] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const slideRafRef = useRef<number>(0);

  useEffect(() => {
    if (!workspaceTransition) {
      setIsSliding(false);
      return;
    }
    // Double-rAF: first frame paints windows at their initial positions
    // (to-workspace offset by screenWidth), second frame starts the CSS transition.
    slideRafRef.current = requestAnimationFrame(() => {
      slideRafRef.current = requestAnimationFrame(() => {
        setIsSliding(true);
      });
    });
    // Safety fallback: if transitionend doesn't fire, complete after timeout
    const fallback = setTimeout(() => {
      completeWorkspaceTransition();
      setIsSliding(false);
    }, WS_SLIDE_DURATION + 150);
    return () => {
      cancelAnimationFrame(slideRafRef.current);
      clearTimeout(fallback);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceTransition?.fromId, workspaceTransition?.toId]);

  const handleSlideEnd = useCallback((e: React.TransitionEvent) => {
    if (e.propertyName === 'transform' && e.target === slideRef.current) {
      completeWorkspaceTransition();
      setIsSliding(false);
    }
  }, [completeWorkspaceTransition]);

  // The container translates to bring the to-workspace into view.
  // direction 'left' = going to higher index = slide container left (negative X)
  // direction 'right' = going to lower index = slide container right (positive X)
  const screenWidth = typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 1920;
  let slideTranslateX = 0;
  if (workspaceTransition && isSliding) {
    slideTranslateX = workspaceTransition.direction === 'left' ? -screenWidth : screenWidth;
  }

  // Deep links (?open=spotlight, ?open=agent, etc.)
  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('open');
    const approvalId = params.get('approval');
    if (!target && !approvalId) return;

    deepLinkHandledRef.current = true;
    if (target === 'access-control' || approvalId) {
      openWindow('access-control', approvalId ? { metadata: { approvalId } } : undefined);
    } else if (target === 'app-registry') {
      const search = params.get('search') || undefined;
      openWindow('app-registry', search ? { metadata: { view: 'integrations', search } } : undefined);
    } else if (target === 'agent') {
      const sessionKey = params.get('session') || params.get('sessionKey') || undefined;
      void openSpotlightSession(sessionKey || undefined);
    } else if (target === 'spotlight') {
      if (!useWindowStore.getState().spotlightOpen) {
        useWindowStore.getState().toggleSpotlight();
      }
    } else if (target === 'email') {
      openWindow('email');
    }

    params.delete('open');
    params.delete('approval');
    params.delete('search');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [openWindow]);

  const userId = user?.id;
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const subscription = useBillingStore((s) => s.subscription);
  const closeWindowsByType = useWindowStore((s) => s.closeWindowsByType);
  const isTelegram = typeof window !== 'undefined' && !!window.Telegram?.WebApp;

  // Keep subscription state fresh even when Settings is closed. This lets
  // billing webhooks surface as desktop notifications and updates cached plan
  // data used by paid-feature gates.
  useEffect(() => {
    if (!userId) return;
    void fetchSubscription();
    const interval = setInterval(() => {
      void fetchSubscription();
    }, 60_000);
    return () => clearInterval(interval);
  }, [userId, fetchSubscription]);

  // ── Promo code modal state ──
  // Read localStorage once on mount; the "seen" flag is session-scoped so a
  // hard refresh surfaces the promo again. Within one tab session,
  // setPromoDismissed suppresses it after the user clicks "Maybe later".
  //
  // Validate the code against the billing gateway BEFORE surfacing the modal
  // so we don't show a "promo applied" popup for garbage codes that would
  // only fail at checkout. `promoCode` is set to the code only after it's
  // been verified (or we couldn't reach the API — fail open).
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDismissed, setPromoDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    let storedCode: string | null = null;
    try {
      storedCode = localStorage.getItem(STORAGE_KEYS.promoCode);
      const seen = sessionStorage.getItem(STORAGE_KEYS.promoSeen) === '1';
      if (seen) storedCode = null;
    } catch { /* storage unavailable */ }

    if (!storedCode) return;

    validateDiscountCode(storedCode).then((result) => {
      if (cancelled) return;
      if (result.success && result.data.valid) {
        setPromoCode(storedCode);
        return;
      }
      // Invalid code — drop it so we don't keep re-checking on every load
      // and so it doesn't sneak onto the checkout body later.
      try { localStorage.removeItem(STORAGE_KEYS.promoCode); } catch { /* */ }
    });

    return () => { cancelled = true; };
  }, []);

  // Guided tour auto-starts after setup + onboarding are complete, regardless of plan status.
  // Force-start from the menubar always works regardless of flags.
  const hasAccess = isTelegram || hasAgentAccess(user?.plan);
  const hasBillingIssue = !!subscription?.dodoCustomerId
    && ['on_hold', 'past_due', 'failed'].includes((subscription.status || '').toLowerCase());
  useEffect(() => {
    if (!userId) return;
    if (!user?.setupCompleted || !user?.onboardingCompleted) return;
    if (hasAccess) {
      closeWindowsByType('subscribe');
      return;
    }

    const openBillingOrSubscribe = () => {
      if (hasBillingIssue) {
        openSettingsToSection('billing');
      } else {
        openSubscribeWindow();
      }
    };

    window.addEventListener('construct:onboarding-done', openBillingOrSubscribe, { once: true });
    return () => window.removeEventListener('construct:onboarding-done', openBillingOrSubscribe);
  }, [userId, user?.setupCompleted, user?.onboardingCompleted, hasAccess, hasBillingIssue, closeWindowsByType]);

  const tourTriggered = useRef(false);
  const startTourWhenReady = useCallback(() => {
    if (tourTriggered.current || !user) return;
    if (!user.setupCompleted || !user.onboardingCompleted) return;

    const tourDone = localStorage.getItem('construct:tour-completed') === '1';
    const tourSkipped = localStorage.getItem('construct:tour-skipped') === '1';
    if (tourDone || tourSkipped) return;

    tourTriggered.current = true;
    window.setTimeout(() => {
      window.dispatchEvent(new Event('construct:start-tour'));
    }, 600);
  }, [user]);

  const TOUR_SETTLE_MS = 2000;

  useEffect(() => {
    const onRevealed = () => {
      window.setTimeout(() => startTourWhenReady(), TOUR_SETTLE_MS);
    };

    window.addEventListener(BOOT_EVENTS.desktopRevealed, onRevealed);
    return () => window.removeEventListener(BOOT_EVENTS.desktopRevealed, onRevealed);
  }, [startTourWhenReady]);

  // Returning users: desktop mounts without reveal event — start tour normally.
  useEffect(() => {
    if (entering) return;
    startTourWhenReady();
  }, [entering, startTourWhenReady, user]);

  // Request browser notification permission early so it's available
  // when the agent sends notifications while the tab is in the background.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Auto-cleanup stale workspaces (empty, inactive, no agent lane) every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      useWindowStore.getState().cleanupStaleWorkspaces();
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Guided tour after setup wizard completes
  useDesktopTour();

  // Handle keyboard shortcuts
  useKeyboardShortcuts({
    onOpenTerminal: () => openWindow('terminal'),
    onToggleStartMenu: () => {
      // No start menu in macOS mode
    },
  });

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Wallpaper — two copies slide in/out during workspace transitions */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ opacity: 1, ...wallpaperContainerStyle(wallpaperBlur) }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translateX(${slideTranslateX}px)`,
            transition: isSliding
              ? `transform ${WS_SLIDE_DURATION}ms ${WS_SLIDE_EASING}`
              : 'none',
            willChange: workspaceTransition ? 'transform' : undefined,
          }}
        >
          {/* Current wallpaper */}
          <Wallpaper />
          {isMobile && <MobileDesktopBackground />}
          {/* Entering wallpaper — offset to the side, slides into view */}
          {workspaceTransition && (
            <div
              className="absolute inset-0"
              style={{
                transform: `translateX(${workspaceTransition.direction === 'left' ? screenWidth : -screenWidth}px)`,
              }}
            >
              <Wallpaper />
              {isMobile && <MobileDesktopBackground />}
            </div>
          )}
        </div>

      </div>

      <ChatWindowOverlay />

      {/* Menu bar (top) */}
      <div style={chromeVisibilityStyle(chromeHidden)}>
        <MenuBar
          onLogout={onLogout}
          onLockScreen={onLockScreen}
          onReconnect={onReconnect}
          isConnected={isConnected}
          isMobile={isMobile}
        />
      </div>

      {/* Scrim — darkens wallpaper during Workspaces view.
           Rendered here (not in the portal) so it shares the same stacking context
           as windows, letting windows (z≥100) sit above the scrim (z=90). */}
      {!chromeHidden && <MissionControlScrim />}

      {/* Window area - between menu bar and bottom bar.
           In normal mode, NO z-index so it doesn't create a stacking context —
           individual windows (z≥100) compete at the root level and appear above
           desktop widgets (z=50). During Workspaces view, raised above the
           scrim (z=90) so windows are visible and clickable.
           Click on empty space (not a window) closes Workspaces. */}
      <div
         className={`absolute left-0 right-0 ${!missionControlActive ? 'pointer-events-none' : ''}`}
        style={{
          top: topBarHeight,
          bottom: isMobile ? MOBILE_APP_BAR_HEIGHT : 0,
          overflow: workspaceTransition ? 'hidden' : undefined,
          zIndex: missionControlActive ? Z_INDEX.missionControlScrim + 1 : undefined,
          ...chromeVisibilityStyle(chromeHidden),
        }}
        onClick={(e) => {
          if (missionControlActive && !(e.target as HTMLElement).closest?.('[data-window-id]')) {
            closeMissionControl();
          }
        }}
      >
        {/* Sliding container — translates to animate workspace switches.
            WindowManager renders windows from both workspaces during a transition;
            to-workspace windows are offset by ±screenWidth, and this container
            slides by ∓screenWidth to bring them into view. */}
        <div
          ref={slideRef}
          className="relative h-full"
          style={{
            transform: slideTranslateX ? `translateX(${slideTranslateX}px)` : undefined,
            transition: isSliding
              ? `transform ${WS_SLIDE_DURATION}ms ${WS_SLIDE_EASING}`
              : 'none',
            willChange: workspaceTransition ? 'transform' : undefined,
          }}
          onTransitionEnd={handleSlideEnd}
        >
          <WindowManager />
        </div>
      </div>


      {/* Agent desktop surface. */}
      <div style={chromeVisibilityStyle(chromeHidden)}>
        <AgentGraphWidget showAutopilot={!isMobile} />
        <ClippyWidget />
      </div>

      {/* Dock (desktop) / App bar (mobile) */}
      <div
        className={isMobile ? undefined : 'contents'}
        style={chromeVisibilityStyle(chromeHidden)}
      >
        {isMobile ? <MobileAppBar /> : <Dock />}
      </div>

      {/* Workspaces overlay */}
      {!chromeHidden && !isMobile && <MissionControl />}

      {/* Launchpad fullscreen overlay */}
      {!chromeHidden && <Launchpad />}

      {/* Spotlight command bar */}
      {!chromeHidden && <Spotlight />}

      {/* Notification system */}
      {!chromeHidden && <Toasts />}
      {!chromeHidden && <NotificationCenter />}

      {/* Promo code modal — shown once after onboarding if the user landed
          via ?code=XXX and isn't already on Pro. Also shown to unsubscribed users immediately. */}
      {!chromeHidden && (user?.onboardingCompleted || !hasAccess) && user?.plan !== 'pro' && promoCode && !promoDismissed && (
        <PromoCodeModal code={promoCode} onDismiss={() => setPromoDismissed(true)} />
      )}
    </div>
  );
}
