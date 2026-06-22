import { describe, expect, it } from 'vitest';
import {
  chromeVisibilityStyle,
  wallpaperContainerStyle,
} from '@/components/desktop/Desktop';
import { computeWallpaperBlur, shouldHideDesktopChrome, shouldShowDesktop } from '@/lib/desktopReveal';

describe('desktop reveal', () => {
  it('shows desktop while lock overlay is still mounted', () => {
    expect(shouldShowDesktop(true, true)).toBe(true);
    expect(computeWallpaperBlur(false)).toBe(0);
  });

  it('keeps desktop wallpaper sharp under lock (lock screen owns blur)', () => {
    expect(computeWallpaperBlur(false)).toBe(0);
    expect(computeWallpaperBlur(true)).toBe(0);
  });

  it('keeps wallpaper opacity at 1 during enter', () => {
    expect(wallpaperContainerStyle(0)).toEqual({});
    expect(wallpaperContainerStyle(18).filter).toContain('blur(18px)');
  });

  it('hides chrome instantly without transform animations', () => {
    expect(chromeVisibilityStyle(true)).toEqual({ visibility: 'hidden', pointerEvents: 'none' });
    expect(chromeVisibilityStyle(false)).toEqual({});
  });

  it('hides desktop chrome while lock overlay is mounted', () => {
    expect(shouldHideDesktopChrome(false, false)).toBe(true);
    expect(shouldHideDesktopChrome(false, true)).toBe(false);
    expect(shouldHideDesktopChrome(true, false)).toBe(false);
  });
});
