import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { blobContainerFile } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSettingsStore, getBuiltinWallpaperSrc } from '@/stores/settingsStore';
import { customWallpaperPath, isCustomWallpaperId } from '@/lib/wallpapers';
import {
  getCachedBlobUrl,
  getSessionCachedBlobUrl,
  getSyncCachedBlobUrl,
  getSyncSessionCachedBlobUrl,
  putCachedWallpaper,
} from '@/lib/wallpaperCache';
import { readSessionWallpaper } from '@/lib/wallpaperSession';
import { notifyWallpaperFilesChanged } from '@/stores/wallpaperStore';

function getUserId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.userId) || '';
  } catch {
    return '';
  }
}

function hasAuthToken(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEYS.token);
  } catch {
    return false;
  }
}

function readPersistedWallpaperId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return 'fuji';
    const parsed = JSON.parse(raw) as { state?: { wallpaperId?: string } };
    return parsed?.state?.wallpaperId ?? 'fuji';
  } catch {
    return 'fuji';
  }
}

/** Avoid a one-frame builtin flash before zustand persist rehydrates. */
function resolveEffectiveWallpaperId(wallpaperId: string): string {
  if (wallpaperId !== 'fuji') return wallpaperId;
  const persisted = readPersistedWallpaperId();
  return persisted !== 'fuji' ? persisted : wallpaperId;
}

function defaultWallpaperUrl(): string {
  return getBuiltinWallpaperSrc('fuji');
}

export interface WallpaperContext {
  wallpaperId: string;
  cacheUserId: string;
  isLoggedOut: boolean;
}

/** @internal Exported for unit tests. */
export function resolveWallpaperContext(settingsWallpaperId: string): WallpaperContext {
  const effectiveId = resolveEffectiveWallpaperId(settingsWallpaperId);
  const userId = getUserId();
  const authenticated = hasAuthToken() && !!userId;

  if (authenticated) {
    return { wallpaperId: effectiveId, cacheUserId: userId, isLoggedOut: false };
  }

  const session = readSessionWallpaper();
  if (session) {
    return {
      wallpaperId: session.wallpaperId,
      cacheUserId: session.cacheUserId,
      isLoggedOut: true,
    };
  }

  return { wallpaperId: effectiveId, cacheUserId: '', isLoggedOut: true };
}

async function resolveCustomWallpaperUrl(
  wallpaperId: string,
  cacheUserId: string,
  isLoggedOut: boolean,
): Promise<string | null> {
  const workspacePath = customWallpaperPath(wallpaperId);
  if (!workspacePath) return null;

  if (isLoggedOut) {
    const syncSession = getSyncSessionCachedBlobUrl(workspacePath);
    if (syncSession) return syncSession;

    const sessionUrl = await getSessionCachedBlobUrl(workspacePath);
    if (sessionUrl) return sessionUrl;

    if (cacheUserId) {
      const syncUser = getSyncCachedBlobUrl(cacheUserId, workspacePath);
      if (syncUser) return syncUser;

      return getCachedBlobUrl(cacheUserId, workspacePath);
    }

    return null;
  }

  if (!cacheUserId) return null;

  const syncCached = getSyncCachedBlobUrl(cacheUserId, workspacePath);
  if (syncCached) return syncCached;

  return getCachedBlobUrl(cacheUserId, workspacePath);
}

function getInitialWallpaperState(wallpaperId: string): { url: string; loading: boolean } {
  const ctx = resolveWallpaperContext(wallpaperId);

  if (!isCustomWallpaperId(ctx.wallpaperId)) {
    return { url: getBuiltinWallpaperSrc(ctx.wallpaperId), loading: false };
  }

  const workspacePath = customWallpaperPath(ctx.wallpaperId);
  if (!workspacePath) {
    return { url: defaultWallpaperUrl(), loading: false };
  }

  if (ctx.isLoggedOut) {
    const sessionCached = getSyncSessionCachedBlobUrl(workspacePath);
    if (sessionCached) return { url: sessionCached, loading: false };

    if (ctx.cacheUserId) {
      const userCached = getSyncCachedBlobUrl(ctx.cacheUserId, workspacePath);
      if (userCached) return { url: userCached, loading: false };
    }

    return { url: defaultWallpaperUrl(), loading: true };
  }

  if (!ctx.cacheUserId) {
    return { url: defaultWallpaperUrl(), loading: false };
  }

  const cached = getSyncCachedBlobUrl(ctx.cacheUserId, workspacePath);
  if (cached) {
    return { url: cached, loading: false };
  }

  return { url: defaultWallpaperUrl(), loading: true };
}

/** Pick session snapshot vs active settings based on auth state. */
export function useEffectiveWallpaperId(): string {
  const wallpaperId = useSettingsStore((s) => s.wallpaperId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const effectiveFromSettings = resolveEffectiveWallpaperId(wallpaperId);

  if (isAuthenticated) return effectiveFromSettings;

  const session = readSessionWallpaper();
  return session?.wallpaperId ?? effectiveFromSettings;
}

export function useWallpaperUrl(wallpaperId: string): { url: string; loading: boolean } {
  const wallpaperRev = useSettingsStore((s) => s.wallpaperRev);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const instanceId = useComputerStore((s) => s.computer?.id || '');
  const effectiveWallpaperId = useEffectiveWallpaperId();
  const displayId = isAuthenticated ? resolveEffectiveWallpaperId(wallpaperId) : effectiveWallpaperId;
  const [url, setUrl] = useState(() => getInitialWallpaperState(displayId).url);
  const [loading, setLoading] = useState(() => getInitialWallpaperState(displayId).loading);

  useEffect(() => {
    const ctx = resolveWallpaperContext(displayId);
    const targetId = ctx.wallpaperId;

    if (!isCustomWallpaperId(targetId)) {
      setUrl(getBuiltinWallpaperSrc(targetId));
      setLoading(false);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      const cached = await resolveCustomWallpaperUrl(targetId, ctx.cacheUserId, ctx.isLoggedOut);
      if (cached && !cancelled) {
        setUrl(cached);
        setLoading(false);
        return;
      }

      if (ctx.isLoggedOut) {
        if (!cancelled) {
          setUrl(defaultWallpaperUrl());
          setLoading(false);
        }
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

      const workspacePath = customWallpaperPath(targetId);
      if (!workspacePath) {
        if (!cancelled) {
          setUrl(defaultWallpaperUrl());
          setLoading(false);
        }
        return;
      }

      try {
        const response = await blobContainerFile(instanceId, workspacePath, 'inline');
        if (!response.ok) {
          if (!cancelled) {
            setUrl(defaultWallpaperUrl());
            setLoading(false);
          }
          notifyWallpaperFilesChanged();
          return;
        }

        const blob = await response.blob();
        const userId = ctx.cacheUserId;
        if (userId) {
          const revision = response.headers.get('ETag') || '';
          await putCachedWallpaper(userId, workspacePath, blob, revision);
          const nextUrl = getSyncCachedBlobUrl(userId, workspacePath)
            ?? await getCachedBlobUrl(userId, workspacePath, revision);
          if (!cancelled) {
            setUrl(nextUrl || getBuiltinWallpaperSrc('construct'));
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
          setUrl(defaultWallpaperUrl());
          setLoading(false);
        }
        notifyWallpaperFilesChanged();
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [displayId, wallpaperRev, instanceId, isAuthenticated]);

  return { url, loading };
}

/** Blur backgrounds use the same resolved URL as the full wallpaper. */
export function useWallpaperBlurUrl(wallpaperId: string): { url: string; loading: boolean } {
  return useWallpaperUrl(wallpaperId);
}
