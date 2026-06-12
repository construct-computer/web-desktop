import { STORAGE_KEYS } from '@/lib/constants';

type UserWallpaperMap = Record<string, string>;

function readMap(): UserWallpaperMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.userWallpapers);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UserWallpaperMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: UserWallpaperMap): void {
  try {
    localStorage.setItem(STORAGE_KEYS.userWallpapers, JSON.stringify(map));
  } catch { /* storage unavailable */ }
}

function readGlobalWallpaperId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return 'fuji';
    const parsed = JSON.parse(raw) as { state?: { wallpaperId?: string } };
    return parsed?.state?.wallpaperId ?? 'fuji';
  } catch {
    return 'fuji';
  }
}

/** Read a user's saved wallpaper preference, seeding from global settings on first access. */
export function getUserWallpaper(userId: string): string {
  if (!userId) return 'fuji';
  const map = readMap();
  if (map[userId]) return map[userId];
  return readGlobalWallpaperId();
}

export function setUserWallpaper(userId: string, wallpaperId: string): void {
  if (!userId) return;
  const map = readMap();
  map[userId] = wallpaperId;
  writeMap(map);
}
