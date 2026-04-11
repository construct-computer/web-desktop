/**
 * Asset preloader — fetches and caches all app assets on startup,
 * ordered by when they appear in the user flow:
 *
 *   0. Fonts (hello cursive, brand, UI)
 *   1. Welcome screen assets (logo)
 *   2. Login screen assets (circle-appear video)
 *   3. Returning user / lock screen assets (loader video, wink, wallpapers)
 *   4. Desktop assets (dock icons, widget images)
 *   5. Tour & extras (tour videos/GIFs, chat bubbles, eyes, remaining icons)
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
import logoImg from '@/assets/construct-logo.png';
import constructImg from '@/assets/construct.png';
import logoPng from '@/assets/logo.png';

// Phase 2: Login screen
import circleAppearVideo from '@/assets/construct/circle-appear.webm';

// Phase 3: Returning user / lock screen / overlay
import loaderVideo from '@/assets/construct/loader.webm';
import winkVideo from '@/assets/construct/wink.webm';
import eyesGif from '@/assets/construct/eyes.gif';
import eyesWebm from '@/assets/construct/eyes.webm';
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
import iconSetupWizard from '@/icons/setup-wizard.png';

// Phase 5: Tour & extras
import tourVideo from '@/assets/tour/tour-1.webm';
import tourEmail from '@/assets/tour/email.gif';
import tourCal from '@/assets/tour/cal.gif';
import tourBrowser from '@/assets/tour/browser.gif';
import tourTerminal from '@/assets/tour/terminal.gif';
import tourNotification from '@/assets/tour/notification.gif';
import tourLast from '@/assets/tour/last.gif';
import tourChat from '@/assets/tour/chat.gif';

// ─── Helpers ───────────────────────────────────────────────────────────────

function preloadImage(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { markLoaded(); resolve(); };
    img.onerror = () => { markLoaded(); resolve(); };
    img.src = src;
  });
}

function preloadVideo(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.oncanplaythrough = () => { markLoaded(); resolve(); };
    video.onerror = () => { markLoaded(); resolve(); };
    video.src = src;
    video.load();
  });
}

function preloadFont(family: string, testText = 'hello'): Promise<void> {
  if ('fonts' in document) {
    return document.fonts.load(`16px "${family}"`, testText).then(() => { markLoaded(); }).catch(() => { markLoaded(); });
  }
  markLoaded();
  return Promise.resolve();
}

function preloadGif(src: string): Promise<void> {
  return preloadImage(src);
}

// ─── Phased preload ────────────────────────────────────────────────────────

let started = false;

// We need to count total assets before starting. Let's enumerate them.
function getTotalAssetCount(): number {
  // 4 fonts + 3 welcome images + 1 login video + 8 lock-screen assets +
  // 27 desktop icons/images + 8 tour assets = 51
  return 4 + 3 + 1 + 8 + 27 + 8;
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
    Promise.all([preloadVideo(circleAppearVideo)])
  );

  // Phase 3: Returning user / lock screen / overlay
  const lockPhase = loginPhase.then(() =>
    Promise.all([
      preloadVideo(loaderVideo),
      preloadVideo(winkVideo),
      preloadGif(eyesGif),
      preloadVideo(eyesWebm),
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
      preloadImage(iconSetupWizard),
      preloadImage(wpConstructTiny),
      preloadImage(wpConstructPng),
    ])
  );

  // Phase 5: Tour & extras — lowest priority
  desktopPhase.then(() =>
    Promise.all([
      preloadVideo(tourVideo),
      preloadGif(tourEmail),
      preloadGif(tourCal),
      preloadGif(tourBrowser),
      preloadGif(tourTerminal),
      preloadGif(tourNotification),
      preloadGif(tourLast),
      preloadGif(tourChat),
    ])
  );
}

// ─── Legacy export (used by App.tsx after auth) ────────────────────────────

let desktopPreloaded = false;

/**
 * @deprecated Use preloadAllAssets() instead. Kept for backward compat.
 */
export function preloadDesktopAssets(): void {
  if (desktopPreloaded) return;
  desktopPreloaded = true;
}