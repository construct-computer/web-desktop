/** Whether Desktop should mount under the lock overlay (pre-reveal). */
export function shouldShowDesktop(isAuthenticated: boolean, computerReady: boolean): boolean {
  return isAuthenticated && computerReady;
}

/** Wallpaper blur on Desktop — lock screen owns blur; desktop stays sharp underneath. */
export function computeWallpaperBlur(lockScreenGone: boolean): number {
  return lockScreenGone ? 0 : 0;
}

/** Heavy blur on the lock-screen wallpaper layer (hides desktop chrome underneath). */
export const LOCK_SCREEN_WALLPAPER_BLUR_PX = 28;

/** Single easing/duration for all lock-screen motion (matches slide-up in App). */
export const LOCK_SCREEN_TRANSITION_MS = 700;
export const LOCK_SCREEN_EASING = 'cubic-bezier(0.4, 0.0, 0.2, 1)';
export const LOCK_SCREEN_TRANSITION = `700ms ${LOCK_SCREEN_EASING}`;

/** Hide desktop chrome while lock overlay fully covers the screen; show during slide-up. */
export function shouldHideDesktopChrome(lockScreenGone: boolean, slidingUp: boolean): boolean {
  return !lockScreenGone && !slidingUp;
}
