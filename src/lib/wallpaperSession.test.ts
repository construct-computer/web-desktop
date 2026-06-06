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

describe('wallpaperSession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('saves and reads a session wallpaper snapshot', async () => {
    installLocalStorage();
    const { saveSessionWallpaper, readSessionWallpaper } = await import('./wallpaperSession');

    saveSessionWallpaper('custom:wallpapers/a.jpg', 'user-a');
    expect(readSessionWallpaper()).toEqual({
      wallpaperId: 'custom:wallpapers/a.jpg',
      cacheUserId: 'user-a',
    });
  });

  it('clears the session snapshot', async () => {
    installLocalStorage();
    const { saveSessionWallpaper, readSessionWallpaper, clearSessionWallpaper } = await import('./wallpaperSession');

    saveSessionWallpaper('deathstar', 'user-a');
    clearSessionWallpaper();
    expect(readSessionWallpaper()).toBeNull();
  });

  it('returns null for invalid stored payloads', async () => {
    const storage = installLocalStorage();
    storage.set(STORAGE_KEYS.sessionWallpaper, JSON.stringify({ wallpaperId: 'deathstar' }));

    const { readSessionWallpaper } = await import('./wallpaperSession');
    expect(readSessionWallpaper()).toBeNull();
  });
});
