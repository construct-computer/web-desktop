import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/lib/constants';

function installLocalStorage(initial: Record<string, string> = {}) {
  const storage = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn((key: string) => { storage.delete(key); }),
  });
  return storage;
}

describe('resolveWallpaperContext', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('uses active user settings when authenticated', async () => {
    installLocalStorage({
      [STORAGE_KEYS.token]: 'jwt',
      [STORAGE_KEYS.userId]: 'user-a',
      [STORAGE_KEYS.settings]: JSON.stringify({ state: { wallpaperId: 'deathstar' } }),
    });

    const { resolveWallpaperContext } = await import('@/hooks/useWallpaperUrl');
    expect(resolveWallpaperContext('deathstar')).toEqual({
      wallpaperId: 'deathstar',
      cacheUserId: 'user-a',
      isLoggedOut: false,
    });
  });

  it('uses session snapshot when logged out', async () => {
    installLocalStorage({
      [STORAGE_KEYS.sessionWallpaper]: JSON.stringify({
        wallpaperId: 'custom:wallpapers/logout.jpg',
        cacheUserId: 'user-a',
      }),
      [STORAGE_KEYS.settings]: JSON.stringify({ state: { wallpaperId: 'catgalaxy' } }),
    });

    const { resolveWallpaperContext } = await import('@/hooks/useWallpaperUrl');
    expect(resolveWallpaperContext('catgalaxy')).toEqual({
      wallpaperId: 'custom:wallpapers/logout.jpg',
      cacheUserId: 'user-a',
      isLoggedOut: true,
    });
  });

  it('falls back to settings when logged out without a session snapshot', async () => {
    installLocalStorage({
      [STORAGE_KEYS.settings]: JSON.stringify({ state: { wallpaperId: 'catgalaxy' } }),
    });

    const { resolveWallpaperContext } = await import('@/hooks/useWallpaperUrl');
    expect(resolveWallpaperContext('catgalaxy')).toEqual({
      wallpaperId: 'catgalaxy',
      cacheUserId: '',
      isLoggedOut: true,
    });
  });
});
