/**
 * Asset preloader — fetches and caches all app assets on startup,
 * ordered by when they appear in the user flow:
 *
 *   0. Fonts (hello cursive, brand, UI)
 *   1. Welcome screen assets (logo)
 *   2. Login screen assets (circle-appear GIF)
 *   3. Returning user / lock screen assets (loader, wink, wallpapers)
 *   4. Desktop assets (dock icons, widget images)
 *   5. Tour & extras (tour GIFs, chat bubbles, eyes, remaining icons)
 *
 * All loads are fire-and-forget with error suppression — a failed preload
 * just means the asset loads normally when needed (no worse than before).
 *
 * Tracks progress so the UI can show a boot-style progress bar.
 */

import { create } from 'zustand';

// ─── Progress store ─────────────────────────────────────────────────────

interface PreloadState {
  total: number;
  loaded: number;
  done: boolean;
}

export const usePreloadProgress = create<PreloadState>(() => ({
  total: 0,
  loaded: 0,
  done: false,
}));

function markLoaded(): void {
  usePreloadProgress.setState((s) => {
    const loaded = s.loaded + 1;
    return { loaded, done: loaded >= s.total };
  });
}

// ─── Asset imports — grouped by boot phase ──────────────────────────────

// Phase 1: Welcome / Brand
import logoImg from '@/assets/logo.png';
import constructImg from '@/assets/logo.png';
import logoPng from '@/assets/logo.png';

// Phase 2: Login screen
import circleAppearGif from '@/assets/construct/circle-appear.gif';

// Phase 3: Returning user / lock screen / overlay
import loaderGif from '@/assets/construct/loader.gif';
import winkGif from '@/assets/construct/wink.gif';
import eyesGif from '@/assets/construct/eyes.gif';
import wpDeathStar from '@/assets/wallpapers/deathstar.jpg';
import wpDeathStarTiny from '@/assets/wallpapers/deathstar-tiny.jpg';
import wpCatGalaxy from '@/assets/wallpapers/catgalaxy.jpg';
import wpConstruct from '@/assets/wallpapers/wallpaper.jpg';
import wpConstructTiny from '@/assets/wallpapers/wallpaper-tiny.jpg';
import wpConstructPng from '@/assets/wallpapers/wallpaper.png';

// Phase 4: Desktop (dock icons, app icons, widget)
import iconComputer from '@/assets/computer.png';
import iconWidget from '@/assets/widget.png';
import iconChatBubble from '@/assets/chat-bubble.png';
import iconChatBubbleLg from '@/assets/chat-bubble-lg.png';
import iconTerminal from '@/icons/terminal.png';
import iconBrowser from '@/icons/browser.png';
import iconFiles from '@/icons/files.png';
import iconCalendar from '@/icons/calendar.png';
import iconChat from '@/icons/chat.png';
import iconEmail from '@/icons/email.png';
import iconSettings from '@/icons/settings.png';
import iconMemory from '@/icons/memory.png';
import iconAccessLogs from '@/icons/access-logs.png';
import iconAccessControl from '@/icons/access-control.png';
import iconText from '@/icons/text.png';
import iconTextEdit from '@/icons/textedit.png';
import iconAppStore from '@/icons/app-store.png';
import iconGeneric from '@/icons/generic.png';
import iconLaunchpad from '@/icons/launchpad.png';
import iconDocs from '@/icons/docs.png';
import iconSheet from '@/icons/sheet.png';
import iconPreview from '@/icons/preview.png';
import iconSlides from '@/icons/slides.png';
import iconVscode from '@/icons/vscode.png';
import iconConstructDrive from '@/icons/construct-drive.png';

// Phase 5: Tour & extras
import tourChat from '@/assets/tour/tour-chat.gif';
import tourEmail from '@/assets/tour/tour-email.gif';
import tourNotification from '@/assets/tour/notification.gif';

// ─── Helpers ───────────────────────────────────────────────────────────────

function preloadImage(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { markLoaded(); resolve(); };
    img.onerror = () => { markLoaded(); resolve(); };
    img.src = src;
  });
}

function preloadFont(family: string, testText = 'hello'): Promise<void> {
  if ('fonts' in document) {
    return document.fonts.load(`16px "${family}"`, testText).then(() => { markLoaded(); }).catch(() => { markLoaded(); });
  }
  markLoaded();
  return Promise.resolve();
}

// ─── Phased preload ────────────────────────────────────────────────────────

let started = false;

// We need to count total assets before starting. Let's enumerate them.
function getTotalAssetCount(): number {
  // 4 fonts + 3 welcome + 1 login + 7 lock-screen + 26 desktop + 3 tour
  return 4 + 3 + 1 + 7 + 26 + 3;
}

/**
 * Preload all app assets in order of appearance.
 * Safe to call multiple times — only runs once.
 * Updates usePreloadProgress store as assets load.
 */
export function preloadAllAssets(): void {
  if (started) return;
  started = true;

  const total = getTotalAssetCount();
  usePreloadProgress.setState({ total, loaded: 0, done: false });

  // Phase 0: Fonts — most critical, needed before any text renders
  const fontPhase = Promise.all([
    preloadFont('Betania Patmos', 'hello'),
    preloadFont('Space Grotesk', 'construct.computer'),
    preloadFont('IBM Plex Sans', 'Welcome to'),
    preloadFont('IBM Plex Mono', 'code'),
  ]);

  // Phase 1: Welcome / brand screen
  const welcomePhase = fontPhase.then(() =>
    Promise.all([
      preloadImage(logoImg),
      preloadImage(constructImg),
      preloadImage(logoPng),
    ])
  );

  // Phase 2: Login screen (circle-appear animation)
  const loginPhase = welcomePhase.then(() =>
    Promise.all([preloadImage(circleAppearGif)])
  );

  // Phase 3: Returning user / lock screen / overlay
  const lockPhase = loginPhase.then(() =>
    Promise.all([
      preloadImage(loaderGif),
      preloadImage(winkGif),
      preloadImage(eyesGif),
      preloadImage(wpDeathStar),
      preloadImage(wpDeathStarTiny),
      preloadImage(wpCatGalaxy),
      preloadImage(wpConstruct),
    ])
  );

  // Phase 4: Desktop (dock icons, app icons, widget)
  const desktopPhase = lockPhase.then(() =>
    Promise.all([
      preloadImage(iconComputer),
      preloadImage(iconWidget),
      preloadImage(iconChatBubble),
      preloadImage(iconChatBubbleLg),
      preloadImage(iconTerminal),
      preloadImage(iconBrowser),
      preloadImage(iconFiles),
      preloadImage(iconCalendar),
      // Skip SVG font-style preload — it'll load via normal CSS
      preloadImage(iconChat),
      preloadImage(iconEmail),
      preloadImage(iconSettings),
      preloadImage(iconMemory),
      preloadImage(iconAccessLogs),
      preloadImage(iconAccessControl),
      preloadImage(iconText),
      preloadImage(iconTextEdit),
      preloadImage(iconAppStore),
      preloadImage(iconGeneric),
      preloadImage(iconLaunchpad),
      preloadImage(iconDocs),
      preloadImage(iconSheet),
      preloadImage(iconPreview),
      preloadImage(iconSlides),
      preloadImage(iconVscode),
      preloadImage(iconConstructDrive),
      preloadImage(wpConstructTiny),
      preloadImage(wpConstructPng),
    ])
  );

  // Phase 5: Tour & extras — lowest priority
  desktopPhase.then(() =>
    Promise.all([
      preloadImage(tourChat),
      preloadImage(tourEmail),
      preloadImage(tourNotification),
    ])
  );
}
