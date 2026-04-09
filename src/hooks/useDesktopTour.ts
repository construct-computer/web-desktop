/**
 * Guided tour of the desktop UI.
 *
 * Uses driver.js to spotlight key UI elements one by one. On first boot,
 * the tour runs to introduce the user to key features of the desktop.
 */

import { useEffect, useRef, useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import analytics from '@/lib/analytics';
import { useWindowStore } from '@/stores/windowStore';
import { useBillingStore } from '@/stores/billingStore';

import tourChat from '@/assets/tour/tour-1.webm';
import tourEmail from '@/assets/tour/email.gif';
import tourCalendar from '@/assets/tour/cal.gif';
import tourBrowser from '@/assets/tour/browser.gif';
import tourTerminal from '@/assets/tour/terminal.gif';
import tourNotification from '@/assets/tour/notification.gif';
import tourDashboard from '@/assets/tour/last.gif';

const TOUR_EVENT = 'construct:start-tour';
const TOUR_FORCE_EVENT = 'construct:force-tour';
const TOUR_SEEN_KEY = 'construct:tour-completed';
const TOUR_SKIPPED_KEY = 'construct:tour-skipped';

/** Build an `<img>` tag for a tour GIF. */
function gifTag(src: string, alt: string): string {
  return `<img class="tour-gif" src="${src}" alt="${alt}" />`;
}

/** Build a `<video>` tag for a tour video clip. */
function videoTag(src: string): string {
  return `<video class="tour-gif" src="${src}" autoplay loop muted playsinline></video>`;
}

const steps: DriveStep[] = [
  {
    element: '[data-tour="setup"]',
    popover: {
      title: 'Welcome to Construct',
      description: 'Fill in your name and agent details, then hit <strong>Save</strong> to get started.',
      side: 'left',
      align: 'center',
      showButtons: ['next', 'previous'],
      // Next is blocked until the user saves — the construct:setup-saved
      // event listener (below) calls driverObj.moveNext() automatically.
      onNextClick: () => {},
    },
  },
  {
    element: '[data-tour="chat"]',
    popover: {
      title: 'Your Agent',
      description: `${videoTag(tourChat)}This is your Construct agent. Click it or press <kbd style="padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);font-family:monospace;font-size:0.85em">Ctrl</kbd> + <kbd style="padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);font-family:monospace;font-size:0.85em">Space</kbd> to chat. Drag it anywhere you like.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="email"]',
    popover: {
      title: 'Email',
      description: `${gifTag(tourEmail, 'Email demo')}Your agent reads incoming emails and replies automatically.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="calendar"]',
    popover: {
      title: 'Calendar',
      description: `${gifTag(tourCalendar, 'Calendar demo')}Schedule tasks and recurring events — they run automatically.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="browser"]',
    popover: {
      title: 'Browser',
      description: `${gifTag(tourBrowser, 'Browser demo')}Your agent can browse the web, research topics, and compile reports.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="terminal"]',
    popover: {
      title: 'Terminal',
      description: `${gifTag(tourTerminal, 'Terminal demo')}Full shell access — run commands, install packages, and execute scripts.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="launchpad"]',
    popover: {
      title: 'Launchpad',
      description: 'All your apps in one place — system tools, installed MCP servers, and connected services.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="launchpad-apps"]',
    popover: {
      title: 'Your Apps',
      description: 'Browse and open your apps here. Install more from the App Registry in the menu.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#notification-center-toggle',
    popover: {
      title: 'Notifications',
      description: `${gifTag(tourNotification, 'Notifications demo')}Get alerts for emails, messages, and completed tasks.`,
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="widgets"]',
    popover: {
      title: 'Dashboard',
      description: `${gifTag(tourDashboard, 'Dashboard demo')}Monitor your agent's activity, tasks, and system resources.`,
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="menu"]',
    popover: {
      title: 'Menu',
      description: 'Access settings, the app registry, and more from this menu.',
      side: 'bottom',
      align: 'start',
    },
  },
];

/**
 * Listens for the tour trigger event and starts the guided tour once.
 * Call this hook from Desktop.tsx.
 */
export function useDesktopTour() {
  const started = useRef(false);

  const startTour = useCallback((force = false) => {
    if (started.current) return;

    // Don't auto-start if already completed or skipped (but allow forced re-runs from menu)
    if (!force) {
      try {
        if (localStorage.getItem(TOUR_SEEN_KEY) === '1') return;
        if (localStorage.getItem(TOUR_SKIPPED_KEY) === '1') return;
      } catch {}
    }

    started.current = true;

    setTimeout(() => {
    let skipped = false;

    // Filter steps based on context
    const setupVisible = !!document.querySelector('[data-tour="setup"]');
    const isPro = useBillingStore.getState().subscription?.plan === 'pro';
    const activeSteps = steps.filter(s => {
      if (s.element === '[data-tour="setup"]' && !setupVisible) return false;
      if (s.element === '[data-tour="email"]' && !isPro) return false;
      return true;
    });

    // Declare ahead so step callbacks can reference the driver instance
    let driverObj: ReturnType<typeof driver>;

    // ── Patch launchpad steps to auto-open/close the Launchpad overlay ──
    const lpIdx = activeSteps.findIndex(s => s.element === '[data-tour="launchpad"]');
    const lpAppsIdx = activeSteps.findIndex(s => s.element === '[data-tour="launchpad-apps"]');
    const notifIdx = activeSteps.findIndex(s => s.element === '#notification-center-toggle');

    if (lpIdx >= 0) {
      activeSteps[lpIdx] = {
        ...activeSteps[lpIdx],
        popover: {
          ...activeSteps[lpIdx].popover,
          onNextClick: () => {
            const ws = useWindowStore.getState();
            if (!ws.launchpadOpen) ws.toggleLaunchpad();
            setTimeout(() => driverObj.moveNext(), 600);
          },
        },
      };
    }
    if (lpAppsIdx >= 0) {
      activeSteps[lpAppsIdx] = {
        ...activeSteps[lpAppsIdx],
        popover: {
          ...activeSteps[lpAppsIdx].popover,
          onNextClick: () => {
            useWindowStore.getState().closeLaunchpad();
            setTimeout(() => driverObj.moveNext(), 400);
          },
          onPrevClick: () => {
            useWindowStore.getState().closeLaunchpad();
            setTimeout(() => driverObj.movePrevious(), 400);
          },
        },
      };
    }
    if (notifIdx >= 0) {
      activeSteps[notifIdx] = {
        ...activeSteps[notifIdx],
        popover: {
          ...activeSteps[notifIdx].popover,
          onPrevClick: () => {
            const ws = useWindowStore.getState();
            if (!ws.launchpadOpen) ws.toggleLaunchpad();
            setTimeout(() => driverObj.movePrevious(), 600);
          },
        },
      };
    }

    // Track whether setup step has the Next button blocked
    const setupStepIdx = activeSteps.findIndex(s => s.element === '[data-tour="setup"]');

    driverObj = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: false,
      overlayColor: 'rgba(0, 0, 0, 0.55)',
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: 'construct-tour-popover',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Let\u2019s go',
      steps: activeSteps,
      onPopoverRender: (popover, { state }) => {
        // Inject a "fuck it, we ball" link in the top-right corner
        const skipLink = document.createElement('a');
        skipLink.textContent = 'fuck it, we ball';
        skipLink.className = 'tour-skip-link';
        skipLink.href = '#';
        skipLink.onclick = (e) => { e.preventDefault(); skipped = true; driverObj.destroy(); };
        popover.wrapper.prepend(skipLink);

        // Replace the Next button text on the setup step (user must save first)
        if (setupStepIdx >= 0 && state.activeIndex === setupStepIdx) {
          const nextBtn = popover.nextButton;
          if (nextBtn) {
            nextBtn.textContent = 'Save to continue \u2192';
            nextBtn.style.opacity = '0.5';
            nextBtn.style.cursor = 'default';
          }
        }
      },
      onDestroyed: () => {
        started.current = false;
        // Close launchpad if it was left open during the tour
        useWindowStore.getState().closeLaunchpad();
        // Only mark tour as completed if the user went through all steps.
        // Skipping via "fuck it, we ball" does NOT count — the tour will
        // re-trigger on next page load until step 1 (email) is done.
        if (!skipped) {
          try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch {}
          analytics.tourCompleted();
        } else {
          try { localStorage.setItem(TOUR_SKIPPED_KEY, '1'); } catch {}
          analytics.tourSkipped();
        }
        // Signal Clippy to show the welcome greeting now that onboarding is done
        window.dispatchEvent(new Event('construct:onboarding-done'));
      },
    });

    // Auto-advance past setup step when user clicks Save
    const onSetupSaved = () => {
      // Small delay to let the SetupModal unmount, then move to next step
      setTimeout(() => driverObj.moveNext(), 400);
    };
    window.addEventListener('construct:setup-saved', onSetupSaved, { once: true });

    analytics.tourStarted();
    driverObj.drive();
    }, 500);
  }, []);

  useEffect(() => {
    const handleStart = () => startTour(false);
    const handleForce = () => startTour(true);

    // Expose globally for testing: window.tour()
    (window as any).tour = handleForce;

    window.addEventListener(TOUR_EVENT, handleStart);
    window.addEventListener(TOUR_FORCE_EVENT, handleForce);
    return () => {
      window.removeEventListener(TOUR_EVENT, handleStart);
      window.removeEventListener(TOUR_FORCE_EVENT, handleForce);
      delete (window as any).tour;
    };
  }, [startTour]);
}
