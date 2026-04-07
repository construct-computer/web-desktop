/**
 * Asset preloader — fetches and caches all app assets on startup,
 * ordered by when they appear in the user flow:
 *
 *   1. Fonts (hello cursive, brand, UI)
 *   2. Welcome screen assets (logo)
 *   3. Login screen assets (circle-appear video)
 *   4. Returning user / lock screen assets (loader video, wallpapers)
 *   5. Desktop assets (dock icons, widget images)
 *
 * Each phase starts immediately after the previous one completes (or fails),
 * ensuring critical-path assets load first while the rest stream in behind.
 *
 * All loads are fire-and-forget with error suppression — a failed preload
 * just means the asset loads normally when needed (no worse than before).
 */

// ─── Phase 1: Welcome screen ──────────────────────────────────────────────
import logoImg from '@/assets/construct-logo.png';

// ─── Phase 2: Login screen ────────────────────────────────────────────────
import circleAppearVideo from '@/assets/construct/circle-appear.webm';

// ─── Phase 3: Returning user / lock screen ────────────────────────────────
import loaderVideo from '@/assets/construct/loader.webm';
import winkVideo from '@/assets/construct/wink.webm';
import wpDeathStar from '@/assets/wallpapers/deathstar.jpg';
import wpCatGalaxy from '@/assets/wallpapers/catgalaxy.jpg';

// ─── Phase 4: Desktop ─────────────────────────────────────────────────────
import iconComputer from '@/assets/computer.png';
import iconWidget from '@/assets/widget.png';
import iconTerminal from '@/icons/terminal.png';
import iconBrowser from '@/icons/browser.png';
import iconFiles from '@/icons/files.png';
import iconCalendar from '@/icons/calendar.png';
import iconChat from '@/icons/chat.png';

// ─── Helpers ───────────────────────────────────────────────────────────────

function preloadImage(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

function preloadVideo(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.oncanplaythrough = () => resolve();
    video.onerror = () => resolve();
    video.src = src;
    // Start loading
    video.load();
  });
}

function preloadFont(family: string, testText = 'hello'): Promise<void> {
  // Use the Font Loading API to force the browser to fetch the font
  if ('fonts' in document) {
    return document.fonts.load(`16px "${family}"`, testText).then(() => {}).catch(() => {});
  }
  return Promise.resolve();
}

// ─── Phased preload ────────────────────────────────────────────────────────

let started = false;

/**
 * Preload all app assets in order of appearance.
 * Safe to call multiple times — only runs once.
 * Call as early as possible (app mount).
 */
export function preloadAllAssets(): void {
  if (started) return;
  started = true;

  // Phase 0: Fonts — most critical, needed before any text renders.
  // Order: hello cursive (first thing user sees), then brand, then UI fonts.
  const fontPhase = Promise.all([
    preloadFont('Betania Patmos', 'hello'),
    preloadFont('Space Grotesk', 'construct.computer'),
    preloadFont('IBM Plex Sans', 'Welcome to'),
    preloadFont('IBM Plex Mono', 'code'),
  ]);

  // Phase 1: Welcome screen assets (logo shown in brand reveal)
  const welcomePhase = fontPhase.then(() =>
    preloadImage(logoImg)
  );

  // Phase 2: Login screen assets (circle-appear video plays after welcome exits)
  const loginPhase = welcomePhase.then(() =>
    preloadVideo(circleAppearVideo)
  );

  // Phase 3: Returning user / lock screen (loader video, wallpapers)
  const lockPhase = loginPhase.then(() =>
    Promise.all([
      preloadVideo(loaderVideo),
      preloadVideo(winkVideo),
      preloadImage(wpDeathStar),
      preloadImage(wpCatGalaxy),
    ])
  );

  // Phase 4: Desktop assets (dock icons, widget) — lowest priority
  lockPhase.then(() =>
    Promise.all([
      preloadImage(iconComputer),
      preloadImage(iconWidget),
      preloadImage(iconTerminal),
      preloadImage(iconBrowser),
      preloadImage(iconFiles),
      preloadImage(iconCalendar),
      preloadImage(iconChat),
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
  // All assets are already being preloaded by preloadAllAssets().
  // This is now a no-op.
}
