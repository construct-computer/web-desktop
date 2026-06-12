import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/lib/constants';

function installLocalStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn((key: string) => { storage.delete(key); }),
  });
  return storage;
}

describe('wallpaperPrefs', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns fuji when user has no saved preference and no global settings', async () => {
    installLocalStorage();
    const { getUserWallpaper } = await import('./wallpaperPrefs');
    expect(getUserWallpaper('user-1')).toBe('fuji');
  });

  it('seeds from global settings on first read', async () => {
    const storage = installLocalStorage();
    storage.set(
      STORAGE_KEYS.settings,
      JSON.stringify({ state: { wallpaperId: 'deathstar' } }),
    );

    const { getUserWallpaper } = await import('./wallpaperPrefs');
    expect(getUserWallpaper('user-1')).toBe('deathstar');
  });

  it('persists and reads per-user wallpaper preferences', async () => {
    installLocalStorage();
    const { getUserWallpaper, setUserWallpaper } = await import('./wallpaperPrefs');

    setUserWallpaper('user-a', 'catgalaxy');
    setUserWallpaper('user-b', 'custom:wallpapers/photo.jpg');

    expect(getUserWallpaper('user-a')).toBe('catgalaxy');
    expect(getUserWallpaper('user-b')).toBe('custom:wallpapers/photo.jpg');
  });
});
