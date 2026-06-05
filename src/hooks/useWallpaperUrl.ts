import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { blobContainerFile } from '@/services/api';
import { useComputerStore } from '@/stores/agentStore';
import { useSettingsStore, getBuiltinWallpaperSrc } from '@/stores/settingsStore';
import { customWallpaperPath, isCustomWallpaperId } from '@/lib/wallpapers';
import { getCachedBlobUrl, getSyncCachedBlobUrl, putCachedWallpaper } from '@/lib/wallpaperCache';
import { notifyWallpaperFilesChanged } from '@/stores/wallpaperStore';

function getUserId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.userId) || '';
  } catch {
    return '';
  }
}

function readPersistedWallpaperId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return 'construct';
    const parsed = JSON.parse(raw) as { state?: { wallpaperId?: string } };
    return parsed?.state?.wallpaperId ?? 'construct';
  } catch {
    return 'construct';
  }
}

/** Avoid a one-frame builtin flash before zustand persist rehydrates. */
function resolveEffectiveWallpaperId(wallpaperId: string): string {
  if (wallpaperId !== 'construct') return wallpaperId;
  const persisted = readPersistedWallpaperId();
  return persisted !== 'construct' ? persisted : wallpaperId;
}

function defaultWallpaperUrl(): string {
  return getBuiltinWallpaperSrc('construct');
}

function getInitialWallpaperState(wallpaperId: string): { url: string; loading: boolean } {
  const effectiveId = resolveEffectiveWallpaperId(wallpaperId);

  if (!isCustomWallpaperId(effectiveId)) {
    return { url: getBuiltinWallpaperSrc(effectiveId), loading: false };
  }

  const workspacePath = customWallpaperPath(effectiveId);
  if (!workspacePath) {
    return { url: defaultWallpaperUrl(), loading: false };
  }

  const userId = getUserId();
  if (!userId) {
    return { url: defaultWallpaperUrl(), loading: false };
  }

  const cached = getSyncCachedBlobUrl(userId, workspacePath);
  if (cached) {
    return { url: cached, loading: false };
  }

  return { url: defaultWallpaperUrl(), loading: true };
}

export function useWallpaperUrl(wallpaperId: string): { url: string; loading: boolean } {
  const wallpaperRev = useSettingsStore((s) => s.wallpaperRev);
  const instanceId = useComputerStore((s) => s.computer?.id || '');
  const effectiveId = resolveEffectiveWallpaperId(wallpaperId);
  const [url, setUrl] = useState(() => getInitialWallpaperState(wallpaperId).url);
  const [loading, setLoading] = useState(() => getInitialWallpaperState(wallpaperId).loading);

  useEffect(() => {
    if (!isCustomWallpaperId(effectiveId)) {
      setUrl(getBuiltinWallpaperSrc(effectiveId));
      setLoading(false);
      return;
    }

    const workspacePath = customWallpaperPath(effectiveId);
    if (!workspacePath) {
      setUrl(getBuiltinWallpaperSrc('construct'));
      setLoading(false);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      const userId = getUserId();
      if (!userId) {
        if (!cancelled) {
          setUrl(defaultWallpaperUrl());
          setLoading(false);
        }
        return;
      }

      const syncCached = getSyncCachedBlobUrl(userId, workspacePath);
      if (syncCached && !cancelled) {
        setUrl(syncCached);
        setLoading(false);
        return;
      }

      const cached = await getCachedBlobUrl(userId, workspacePath);
      if (cached && !cancelled) {
        setUrl(cached);
        setLoading(false);
        return;
      }

      if (!cancelled) {
        setUrl(defaultWallpaperUrl());
        setLoading(true);
      }

      if (!instanceId) {
        if (!cancelled) setLoading(false);
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
          const cached = getSyncCachedBlobUrl(userId, workspacePath)
            ?? await getCachedBlobUrl(userId, workspacePath, revision);
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
  }, [effectiveId, wallpaperRev, instanceId]);

  return { url, loading };
}

/** Blur backgrounds use the same resolved URL as the full wallpaper. */
export function useWallpaperBlurUrl(wallpaperId: string): { url: string; loading: boolean } {
  return useWallpaperUrl(wallpaperId);
}
