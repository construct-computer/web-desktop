/**
 * Guided tour of the desktop UI.
 *
 * Uses driver.js to spotlight key UI elements one by one. Runs after setup
 * and onboarding are complete (or on demand from the menu).
 */

import { useEffect, useRef, useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useNotificationStore } from '@/stores/notificationStore';
import { track } from '@/lib/analytics';

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

function gifCarouselTag(aspectRatio: string): string {
  const slotStyle = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 600ms ease;margin:0;';
  return `<div class="tour-gif-carousel" style="position:relative;aspect-ratio:${aspectRatio};width:100%;overflow:hidden;border-radius:8px;">`
    + `<img class="tour-gif tour-gif-slot" alt="" style="${slotStyle}opacity:1;" />`
    + `<img class="tour-gif tour-gif-slot" alt="" style="${slotStyle}opacity:0;" />`
    + `</div>`;
}

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
    element: '[data-tour="chat"]',
    popover: {
      title: 'Construct',
      description: `${gifTag(tourChat, '3074/2160')}Click Construct or press <kbd style="padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);font-family:monospace;font-size:0.85em">Ctrl</kbd> + <kbd style="padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);font-family:monospace;font-size:0.85em">Space</kbd> to chat. Drag it anywhere you like.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="dock"]',
    popover: {
      title: 'Dock & All Apps',
      description: `${gifCarouselTag('2674/2160')}Your favorite apps live here on the Dock. Click All Apps to browse system tools, MCP apps, and connected services.`,
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#notification-center-drawer',
    popover: {
      title: 'Control Center',
      description: `${gifTag(tourNotification, '512/361', 'Notifications demo')}View your latest notifications, emails, and active work in the side panel.`,
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#tour-menu-overlay',
    popover: {
      title: 'Menu',
      description: 'Access settings, Apps, Approvals, Activity, and Knowledge from this menu.',
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

    if (!force) {
      try {
        if (localStorage.getItem(TOUR_SEEN_KEY) === '1') return;
        if (localStorage.getItem(TOUR_SKIPPED_KEY) === '1') return;
      } catch {}

      if (window.innerWidth < 768) return;
    }

    started.current = true;
    track('tour_started', { forced: force });

    setTimeout(() => {
    let skipped = false;

    const activeSteps = [...steps];

    let driverObj: ReturnType<typeof driver>;
    let sampleNotificationId: string | null = null;

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

          sampleNotificationId = ns.addNotification(
            {
              variant: 'info',
              title: 'Welcome to Construct!',
              body: 'This side panel shows completed tasks, new emails, and other alerts.',
              source: 'SYSTEM',
            },
            5000,
            { priority: 'important' },
          );
        },
      };
    }

    if (menuIdx >= 0) {
      activeSteps[menuIdx] = {
        ...activeSteps[menuIdx],
        onHighlightStarted: () => {
          window.dispatchEvent(new Event('construct:open-apple-menu'));

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
      onPopoverRender: (popover) => {
        const skipLink = document.createElement('a');
        skipLink.textContent = 'fuck it, we ball';
        skipLink.className = 'tour-skip-link';
        skipLink.href = '#';
        skipLink.onclick = (e) => { e.preventDefault(); skipped = true; driverObj.destroy(); };
        popover.wrapper.prepend(skipLink);

        const carousel = popover.wrapper.querySelector<HTMLElement>('.tour-gif-carousel');
        if (carousel) setupGifCarousel(carousel, DOCK_TOUR_VIDEOS);
      },
      onDestroyed: () => {
        started.current = false;
        const ns = useNotificationStore.getState();
        if (ns.drawerOpen) ns.toggleDrawer();

        if (sampleNotificationId) {
          ns.removeNotification(sampleNotificationId);
          sampleNotificationId = null;
        }

        window.dispatchEvent(new Event('construct:close-apple-menu'));

        const overlay = document.getElementById('tour-menu-overlay');
        if (overlay) overlay.remove();

        if (!skipped) {
          try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch {}
          track('tour_completed');
        } else {
          try { localStorage.setItem(TOUR_SKIPPED_KEY, '1'); } catch {}
          track('tour_skipped');
        }
        window.dispatchEvent(new Event('construct:onboarding-done'));
      },
    });

    driverObj.drive();
    }, 500);
  }, []);

  useEffect(() => {
    const handleStart = () => startTour(false);
    const handleForce = () => startTour(true);

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
