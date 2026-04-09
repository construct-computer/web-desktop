import { useEffect, useRef, useState, useCallback } from 'react';
import { Wallpaper } from './Wallpaper';
import { MenuBar } from './MenuBar';
import { Dock } from './Dock';
import { MobileAppBar } from './MobileAppBar';
import { MissionControl, MissionControlScrim } from './MissionControl';
import { Launchpad } from './Launchpad';
import { Spotlight } from './Spotlight';
import { StatusWidget } from './StatusWidget';
import { AgentGraphWidget } from './AgentGraphWidget';
import { ClippyWidget } from './ClippyWidget';
import { TodoListWidget } from './TodoListWidget';
import { NotificationCenter } from './NotificationCenter';
import { Toasts } from '@/components/ui';
import { WindowManager } from '@/components/window';
import { useWindowStore } from '@/stores/windowStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDesktopTour } from '@/hooks/useDesktopTour';
import { SetupModal } from '@/components/apps/SetupModal';
import { getSlackStatus } from '@/services/api';
// import { getEmailStatus } from '@/services/agentmail'; // removed — tour trigger no longer depends on email status
import { MENUBAR_HEIGHT, MOBILE_MENUBAR_HEIGHT, MOBILE_APP_BAR_HEIGHT, DOCK_HEIGHT, STAGE_STRIP_WIDTH, Z_INDEX } from '@/lib/constants';

// ── Workspace slide constants ──────────────────────────────────────

const WS_SLIDE_DURATION = 400; // ms
const WS_SLIDE_EASING = 'cubic-bezier(0.42, 0, 0.16, 1.0)';

// ── Desktop ──────────────────────────────────────────────────────────

interface DesktopProps {
  onLogout?: () => void;
  onLockScreen?: () => void;
  onReconnect?: () => void;
  isConnected?: boolean;
}

export function Desktop({ onLogout, onLockScreen, onReconnect, isConnected }: DesktopProps) {
  const { openWindow, windows } = useWindowStore();
  const missionControlActive = useWindowStore((s) => s.missionControlActive);
  const closeMissionControl = useWindowStore((s) => s.closeMissionControl);
  const stageManagerActive = useWindowStore((s) => s.stageManagerActive);
  const spotlightOpen = useWindowStore((s) => s.spotlightOpen);
  const activeWorkspaceId = useWindowStore((s) => s.activeWorkspaceId);
  const workspaceTransition = useWindowStore((s) => s.workspaceTransition);
  const completeWorkspaceTransition = useWindowStore((s) => s.completeWorkspaceTransition);
  const isMobile = useIsMobile();
  const topBarHeight = isMobile ? MOBILE_MENUBAR_HEIGHT : MENUBAR_HEIGHT;

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

  // Handle OAuth callback redirect (e.g. ?drive=connected)
  const addNotification = useNotificationStore((s) => s.addNotification);
  const oauthHandledRef = useRef(false);

  useEffect(() => {
    if (oauthHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const calendarResult = params.get('calendar');
    const driveResult = params.get('drive');
    const slackResult = params.get('slack');
    const composioConnected = params.get('composio_connected');
    const composioError = params.get('composio_error');
    if (!calendarResult && !driveResult && !slackResult && !composioConnected && !composioError) return;

    oauthHandledRef.current = true;
    window.history.replaceState({}, '', window.location.pathname);

    // Google Calendar OAuth result
    if (calendarResult === 'connected') {
      addNotification({
        title: 'Google Calendar connected',
        body: 'Your Calendar is now linked',
        source: 'Google Calendar',
        variant: 'success',
      });
    } else if (calendarResult === 'denied' || calendarResult === 'error') {
      addNotification({
        title: 'Google Calendar connection failed',
        body: calendarResult === 'denied' ? 'Access was denied' : 'An error occurred',
        source: 'Google Calendar',
        variant: 'error',
      });
    }

    // Google Drive OAuth result
    if (driveResult === 'connected') {
      addNotification({
        title: 'Google Drive connected',
        body: 'Your Drive is now linked',
        source: 'Google Drive',
        variant: 'success',
      });
    } else if (driveResult === 'denied' || driveResult === 'error') {
      addNotification({
        title: 'Google Drive connection failed',
        body: driveResult === 'denied' ? 'Access was denied' : 'An error occurred',
        source: 'Google Drive',
        variant: 'error',
      });
    }

    // Slack OAuth result
    if (slackResult === 'connected') {
      getSlackStatus().then((result) => {
        const teamName = result.success ? result.data.teamName : undefined;
        addNotification({
          title: 'Slack connected',
          body: teamName ? `Added to ${teamName}` : 'Your Slack workspace is now linked',
          source: 'Slack',
          variant: 'success',
        });
      });
    } else if (slackResult === 'denied' || slackResult === 'error') {
      const slackError = params.get('slack_error');
      let body = slackResult === 'denied' ? 'Access was denied' : 'An error occurred';
      if (slackError) {
        // Make Slack API error codes more readable
        const friendlyErrors: Record<string, string> = {
          bad_redirect_uri: 'Redirect URI mismatch — check SLACK_REDIRECT_URI matches the Slack app settings',
          invalid_code: 'Authorization code expired — please try again',
          access_denied: 'Access was denied by the user',
          workspace_already_linked: 'This Slack workspace is already connected to another account',
        };
        body = friendlyErrors[slackError] || slackError.replace(/_/g, ' ');
      }
      addNotification({
        title: 'Slack connection failed',
        body,
        source: 'Slack',
        variant: 'error',
      });
    }

    // Composio universal OAuth callback
    if (composioConnected) {
      const toolkitNames: Record<string, string> = {
        googlecalendar: 'Google Calendar',
        googledrive: 'Google Drive',
      };
      const name = toolkitNames[composioConnected] || composioConnected;
      addNotification({
        title: `${name} connected`,
        body: `Your ${name} account is now linked.`,
        source: name,
        variant: 'success',
      });
    }
    if (composioError) {
      const toolkitNames: Record<string, string> = {
        googlecalendar: 'Google Calendar',
        googledrive: 'Google Drive',
      };
      const name = toolkitNames[composioError] || composioError;
      addNotification({
        title: `${name} connection failed`,
        body: 'An error occurred during authorization.',
        source: name,
        variant: 'error',
      });
    }

    // (Setup wizard session storage handling removed — SetupModal is now
    // rendered as a permanent overlay, no window re-open needed.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open subscribe window for unsubscribed users
  const user = useAuthStore((s) => s.user);
  const subscribeOpened = useRef(false);
  useEffect(() => {
    if (subscribeOpened.current || !user) return;
    const isSubscribed = user.plan === 'pro' || user.plan === 'starter';
    if (!isSubscribed) {
      subscribeOpened.current = true;
      setTimeout(() => openWindow('subscribe'), 300);
    }
  }, [user, openWindow]);

  // Guided tour: auto-starts when setup hasn't been completed (always),
  // or on first visit if the user hasn't completed/skipped the tour yet.
  // Force-start from the menubar always works regardless of flags.
  const tourTriggered = useRef(false);
  useEffect(() => {
    if (tourTriggered.current || !user) return;

    const needsSetup = !user.setupCompleted;
    const tourDone = localStorage.getItem('construct:tour-completed') === '1';
    const tourSkipped = localStorage.getItem('construct:tour-skipped') === '1';

    // Always show tour during setup; otherwise respect completed/skipped flags
    if (!needsSetup && (tourDone || tourSkipped)) return;

    tourTriggered.current = true;
    // Short delay to let the UI settle (SetupModal renders, dock mounts, etc.)
    setTimeout(() => {
      window.dispatchEvent(new Event('construct:start-tour'));
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
      <div className="absolute inset-0 overflow-hidden">
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
          {/* Entering wallpaper — offset to the side, slides into view */}
          {workspaceTransition && (
            <div
              className="absolute inset-0"
              style={{
                transform: `translateX(${workspaceTransition.direction === 'left' ? screenWidth : -screenWidth}px)`,
              }}
            >
              <Wallpaper />
            </div>
          )}
        </div>
      </div>

      {/* Menu bar (top) */}
      <MenuBar
        onLogout={onLogout}
        onLockScreen={onLockScreen}
        onReconnect={onReconnect}
        isConnected={isConnected}
        isMobile={isMobile}
      />

      {/* Scrim — darkens wallpaper during Workspaces view.
           Rendered here (not in the portal) so it shares the same stacking context
           as windows, letting windows (z≥100) sit above the scrim (z=90). */}
      <MissionControlScrim />

      {/* Window area - between menu bar and bottom bar.
           In normal mode, NO z-index so it doesn't create a stacking context —
           individual windows (z≥100) compete at the root level and appear above
           desktop widgets (z=50). During Workspaces view, raised above the
           scrim (z=90) so windows are visible and clickable.
           Click on empty space (not a window) closes Workspaces. */}
      <div
         className="absolute left-0 right-0"
        style={{
          top: topBarHeight,
          bottom: isMobile ? MOBILE_APP_BAR_HEIGHT : 0,
          overflow: workspaceTransition ? 'hidden' : undefined,
          zIndex: missionControlActive ? Z_INDEX.missionControlScrim + 1 : undefined,
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


      {/* Agent graph — full-desktop overlay for drag-anywhere, corner-snapping */}
      {!isMobile && <AgentGraphWidget />}

      {/* Clippy-style floating agent assistant */}
      {!isMobile && <ClippyWidget />}

      {/* Desktop widgets (hidden on mobile) */}
      {!isMobile && (
        <>
          <StatusWidget />
          <div
            data-tour="widgets"
            className="absolute right-3 pointer-events-none flex flex-col items-end"
            style={{ top: MENUBAR_HEIGHT + 12, zIndex: Z_INDEX.desktopWidget }}
          >
            <TodoListWidget />
          </div>
        </>
      )}

      {/* Dock (desktop) / App bar (mobile) */}
      {isMobile ? <MobileAppBar /> : <Dock />}

      {/* Workspaces overlay */}
      {!isMobile && <MissionControl />}

      {/* Launchpad fullscreen overlay */}
      {!isMobile && <Launchpad />}

      {/* Spotlight command bar */}
      <Spotlight />

      {/* Notification system */}
      <Toasts />
      <NotificationCenter />

      {/* Setup modal — permanent overlay until user completes initial setup */}
      {user && !user.setupCompleted && <SetupModal />}
    </div>
  );
}
