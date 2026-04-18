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
import { useNotificationStore } from '@/stores/notificationStore';

import tourChat from '@/assets/tour/tour-chat.gif';
import tourEmail from '@/assets/tour/tour-email.gif';
import tourBrowser from '@/assets/tour/tour-browser.gif';
import tourNotification from '@/assets/tour/notification.gif';

const DOCK_TOUR_VIDEOS = [tourBrowser, tourEmail];

const TOUR_EVENT = 'construct:start-tour';
const TOUR_FORCE_EVENT = 'construct:force-tour';
const TOUR_SEEN_KEY = 'construct:tour-completed';
const TOUR_SKIPPED_KEY = 'construct:tour-skipped';

/** Build an `<img>` tag for a tour GIF. */
function gifTag(src: string, aspectRatio: string, alt = ''): string {
  return `<img class="tour-gif" src="${src}" alt="${alt}" style="aspect-ratio: ${aspectRatio};" />`;
}

/**
 * Build a container with two stacked `<img>` slots that crossfade between
 * clips. Slots are wired up at runtime by `setupGifCarousel`.
 */
function gifCarouselTag(aspectRatio: string): string {
  const slotStyle = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 600ms ease;margin:0;';
  return `<div class="tour-gif-carousel" style="position:relative;aspect-ratio:${aspectRatio};width:100%;overflow:hidden;border-radius:8px;">`
    + `<img class="tour-gif tour-gif-slot" alt="" style="${slotStyle}opacity:1;" />`
    + `<img class="tour-gif tour-gif-slot" alt="" style="${slotStyle}opacity:0;" />`
    + `</div>`;
}

/**
 * Wire up a `.tour-gif-carousel` container with a shuffled playlist that
 * crossfades between GIF clips on a fixed interval. GIFs don't expose
 * duration/progress, so we pick a cycle time matching roughly the clip
 * length. Safe to call repeatedly — a dataset flag guards against double
 * init on popover re-renders.
 */
function setupGifCarousel(container: HTMLElement, srcs: string[]): void {
  if (container.dataset.carouselStarted === '1') return;
  if (srcs.length === 0) return;
  container.dataset.carouselStarted = '1';

  const slots = Array.from(container.querySelectorAll<HTMLImageElement>('img.tour-gif-slot'));
  if (slots.length < 2) return;

  const order = [...srcs].sort(() => Math.random() - 0.5);
  slots[0].src = order[0];
  if (order.length === 1) return;

  let activeSlot = 0;
  let gifIdx = 0;
  const GIF_CYCLE_MS = 6000;
  const cycle = setInterval(() => {
    if (!document.body.contains(container)) { clearInterval(cycle); return; }
    const nextSlot = 1 - activeSlot;
    const nextIdx = (gifIdx + 1) % order.length;
    slots[nextSlot].src = order[nextIdx];
    slots[activeSlot].style.opacity = '0';
    slots[nextSlot].style.opacity = '1';
    activeSlot = nextSlot;
    gifIdx = nextIdx;
  }, GIF_CYCLE_MS);
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
      description: `${gifTag(tourChat, '3074/2160')}This is your Construct agent. Click it or press <kbd style="padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);font-family:monospace;font-size:0.85em">Ctrl</kbd> + <kbd style="padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);font-family:monospace;font-size:0.85em">Space</kbd> to chat. Drag it anywhere you like.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="dock"]',
    popover: {
      title: 'Dock & Launchpad',
      description: `${gifCarouselTag('2674/2160')}Your favorite apps live here on the Dock. Click the Launchpad to browse and install all system tools, MCP servers, and connected services.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#notification-center-drawer',
    popover: {
      title: 'Control Center',
      description: `${gifTag(tourNotification, '512/361', 'Notifications demo')}View your latest notifications, emails, and active agent processes in the side panel.`,
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#tour-menu-overlay',
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

      // Disable auto-tour on mobile devices as the layout is primarily for desktop
      if (window.innerWidth < 768) {
        return;
      }
    }

    started.current = true;

    setTimeout(() => {
    let skipped = false;

    // Filter steps based on context
    const setupVisible = !!document.querySelector('[data-tour="setup"]');
    const activeSteps = steps.filter(s => {
      if (s.element === '[data-tour="setup"]' && !setupVisible) return false;
      return true;
    });

    // Declare ahead so step callbacks can reference the driver instance
    let driverObj: ReturnType<typeof driver>;
    
    // Store ID of the sample notification so we can clean it up
    let sampleNotificationId: string | null = null;

    // ── Pre-create the menu overlay element so driver.js can find it ──
    // The menu dropdown is portaled outside the menubar, so we need a
    // synthetic overlay that spans both the button and the open dropdown.
    // It must exist in the DOM before driver.js tries to resolve the step.
    let menuOverlayEl = document.getElementById('tour-menu-overlay');
    if (!menuOverlayEl) {
      const menuBtn = document.querySelector<HTMLElement>('[data-tour="menu"]');
      menuOverlayEl = document.createElement('div');
      menuOverlayEl.id = 'tour-menu-overlay';
      menuOverlayEl.style.position = 'fixed';
      menuOverlayEl.style.pointerEvents = 'none';
      menuOverlayEl.style.zIndex = '-1';
      if (menuBtn) {
        const r = menuBtn.getBoundingClientRect();
        menuOverlayEl.style.top = `${r.top}px`;
        menuOverlayEl.style.left = `${r.left}px`;
        menuOverlayEl.style.width = `${r.width}px`;
        menuOverlayEl.style.height = `${r.height}px`;
      }
      document.body.appendChild(menuOverlayEl);
    }

    // ── Patch steps to auto-open/close the notifications panel ──
    const notifIdx = activeSteps.findIndex(s => s.element === '#notification-center-drawer');
    const menuIdx = activeSteps.findIndex(s => s.element === '#tour-menu-overlay');

    if (notifIdx >= 0) {
      activeSteps[notifIdx] = {
        ...activeSteps[notifIdx],
        popover: {
          ...activeSteps[notifIdx].popover,
          onNextClick: () => {
            const ns = useNotificationStore.getState();
            if (ns.drawerOpen) ns.toggleDrawer();
            if (sampleNotificationId) {
              ns.removeNotification(sampleNotificationId);
              sampleNotificationId = null;
            }
            setTimeout(() => driverObj.moveNext(), 400);
          },
          onPrevClick: () => {
            const ns = useNotificationStore.getState();
            if (ns.drawerOpen) ns.toggleDrawer();
            if (sampleNotificationId) {
              ns.removeNotification(sampleNotificationId);
              sampleNotificationId = null;
            }
            setTimeout(() => driverObj.movePrevious(), 400);
          },
        },
        onHighlightStarted: () => {
          const ns = useNotificationStore.getState();
          if (!ns.drawerOpen) ns.toggleDrawer();
          
          // Inject an informative sample notification for the tour
          sampleNotificationId = ns.addNotification({
            variant: 'info',
            title: 'Welcome to Construct!',
            body: 'This side panel is where your agent reports back. Completed tasks, new emails, and active processes appear here.',
            source: 'SYSTEM',
          });
        },
      };
    }

    if (menuIdx >= 0) {
      activeSteps[menuIdx] = {
        ...activeSteps[menuIdx],
        onHighlightStarted: () => {
          // Open the Apple menu via custom event (reliable, no click simulation)
          window.dispatchEvent(new Event('construct:open-apple-menu'));

          // After the dropdown portal renders, expand overlay to encompass both
          setTimeout(() => {
            const menuBtn = document.querySelector<HTMLElement>('[data-tour="menu"]');
            const dropdown = document.getElementById('menu-dropdown-portal');
            const overlay = document.getElementById('tour-menu-overlay');
            if (!menuBtn || !overlay) return;

            if (dropdown) {
              const btnRect = menuBtn.getBoundingClientRect();
              const dropRect = dropdown.getBoundingClientRect();
              overlay.style.top = `${Math.min(btnRect.top, dropRect.top)}px`;
              overlay.style.left = `${Math.min(btnRect.left, dropRect.left)}px`;
              overlay.style.width = `${Math.max(btnRect.right, dropRect.right) - Math.min(btnRect.left, dropRect.left)}px`;
              overlay.style.height = `${Math.max(btnRect.bottom, dropRect.bottom) - Math.min(btnRect.top, dropRect.top)}px`;
            }

            if (driverObj) driverObj.refresh();
          }, 150);
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
      popoverOffset: 20,
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

        const carousel = popover.wrapper.querySelector<HTMLElement>('.tour-gif-carousel');
        if (carousel) setupGifCarousel(carousel, DOCK_TOUR_VIDEOS);

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
        // Close panels if they were left open during the tour
        const ns = useNotificationStore.getState();
        if (ns.drawerOpen) ns.toggleDrawer();
        
        // Clean up sample notification if user skipped while panel was open
        if (sampleNotificationId) {
          ns.removeNotification(sampleNotificationId);
          sampleNotificationId = null;
        }

        // Close menu if it was left open using the custom event
        window.dispatchEvent(new Event('construct:close-apple-menu'));
        
        // Clean up the invisible union overlay
        const overlay = document.getElementById('tour-menu-overlay');
        if (overlay) overlay.remove();
        
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
