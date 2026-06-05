export const WALLPAPERS_FOLDER = 'wallpapers';
export const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024;
export const LEGACY_CUSTOM_WALLPAPER_KEY = 'construct:custom-wallpaper';
export const CUSTOM_WALLPAPER_PREFIX = 'custom:';

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export interface WallpaperValidationResult {
  ok: boolean;
  error?: string;
}

export function isCustomWallpaperId(id: string): boolean {
  return id.startsWith(CUSTOM_WALLPAPER_PREFIX);
}

export function customWallpaperPath(id: string): string | null {
  if (!isCustomWallpaperId(id)) return null;
  return id.slice(CUSTOM_WALLPAPER_PREFIX.length);
}

export function toCustomWallpaperId(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${CUSTOM_WALLPAPER_PREFIX}${clean}`;
}

export function isWallpaperFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ALLOWED_EXTENSIONS.has(ext);
}

export function isWallpaperWorkspacePath(path: string): boolean {
  const clean = path.replace(/^\/+/, '');
  return clean === WALLPAPERS_FOLDER || clean.startsWith(`${WALLPAPERS_FOLDER}/`);
}

export function wallpaperEntryPath(name: string): string {
  return `${WALLPAPERS_FOLDER}/${name}`;
}

export function sanitizeWallpaperFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return base || 'wallpaper.jpg';
}

export function buildWallpaperUploadPath(fileName: string): string {
  return wallpaperEntryPath(`${Date.now()}-${sanitizeWallpaperFileName(fileName)}`);
}

export function displayWallpaperName(path: string): string {
  const fileName = path.split('/').pop() || path;
  const withoutTs = fileName.replace(/^\d+-/, '');
  return withoutTs || fileName;
}

export function validateWallpaperFile(file: File): WallpaperValidationResult {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { ok: false, error: 'Use JPEG, PNG, WebP, or GIF images only.' };
    }
  }
  if (file.size > MAX_WALLPAPER_BYTES) {
    return { ok: false, error: 'Image must be 10 MB or smaller.' };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'File is empty.' };
  }
  return { ok: true };
}

export async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}
