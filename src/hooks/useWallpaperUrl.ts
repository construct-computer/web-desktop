import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { blobContainerFile } from '@/services/api';
import { useComputerStore } from '@/stores/agentStore';
import { useSettingsStore, getBuiltinWallpaperSrc } from '@/stores/settingsStore';
import { customWallpaperPath, isCustomWallpaperId } from '@/lib/wallpapers';
import { getCachedBlobUrl, putCachedWallpaper } from '@/lib/wallpaperCache';
import { notifyWallpaperFilesChanged } from '@/stores/wallpaperStore';

function getUserId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.userId) || '';
  } catch {
    return '';
  }
}

export function useWallpaperUrl(wallpaperId: string): { url: string; loading: boolean } {
  const wallpaperRev = useSettingsStore((s) => s.wallpaperRev);
  const instanceId = useComputerStore((s) => s.computer?.id || '');
  const [url, setUrl] = useState(() => getBuiltinWallpaperSrc(wallpaperId));
  const [loading, setLoading] = useState(isCustomWallpaperId(wallpaperId));

  useEffect(() => {
    if (!isCustomWallpaperId(wallpaperId)) {
      setUrl(getBuiltinWallpaperSrc(wallpaperId));
      setLoading(false);
      return;
    }

    const workspacePath = customWallpaperPath(wallpaperId);
    if (!workspacePath) {
      setUrl(getBuiltinWallpaperSrc('construct'));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const resolve = async () => {
      const userId = getUserId();
      if (userId) {
        const cached = await getCachedBlobUrl(userId, workspacePath);
        if (cached && !cancelled) {
          setUrl(cached);
          setLoading(false);
          return;
        }
      }

      if (!instanceId) {
        if (!cancelled) {
          setUrl(getBuiltinWallpaperSrc('construct'));
          setLoading(false);
        }
        return;
      }

      try {
        const response = await blobContainerFile(instanceId, workspacePath, 'inline');
        if (!response.ok) {
          if (!cancelled) {
            setUrl(getBuiltinWallpaperSrc('construct'));
            setLoading(false);
          }
          notifyWallpaperFilesChanged();
          return;
        }

        const blob = await response.blob();
        if (userId) {
          const revision = response.headers.get('ETag') || '';
          await putCachedWallpaper(userId, workspacePath, blob, revision);
          const cached = await getCachedBlobUrl(userId, workspacePath, revision);
          if (!cancelled) {
            setUrl(cached || getBuiltinWallpaperSrc('construct'));
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setUrl(URL.createObjectURL(blob));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setUrl(getBuiltinWallpaperSrc('construct'));
          setLoading(false);
        }
        notifyWallpaperFilesChanged();
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [wallpaperId, wallpaperRev, instanceId]);

  return { url, loading };
}

/** Blur backgrounds use the same resolved URL as the full wallpaper. */
export function useWallpaperBlurUrl(wallpaperId: string): { url: string; loading: boolean } {
  return useWallpaperUrl(wallpaperId);
}
