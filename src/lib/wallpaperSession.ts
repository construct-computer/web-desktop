import { STORAGE_KEYS } from '@/lib/constants';

export interface SessionWallpaper {
  wallpaperId: string;
  cacheUserId: string;
}

export function saveSessionWallpaper(wallpaperId: string, cacheUserId: string): void {
  if (!wallpaperId || !cacheUserId) return;
  try {
    const snapshot: SessionWallpaper = { wallpaperId, cacheUserId };
    localStorage.setItem(STORAGE_KEYS.sessionWallpaper, JSON.stringify(snapshot));
  } catch { /* storage unavailable */ }
}

export function readSessionWallpaper(): SessionWallpaper | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessionWallpaper);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionWallpaper;
    if (!parsed?.wallpaperId || !parsed?.cacheUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionWallpaper(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.sessionWallpaper);
  } catch { /* storage unavailable */ }
}
