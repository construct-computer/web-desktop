import { create } from 'zustand';
import * as api from '@/services/api';
import { STORAGE_KEYS } from '@/lib/constants';
import { useSettingsStore } from '@/stores/settingsStore';
import { useComputerStore } from '@/stores/agentStore';
import {
  buildWallpaperUploadPath,
  dataUrlToFile,
  isWallpaperFileName,
  LEGACY_CUSTOM_WALLPAPER_KEY,
  toCustomWallpaperId,
  validateWallpaperFile,
  wallpaperEntryPath,
  WALLPAPERS_FOLDER,
} from '@/lib/wallpapers';
import {
  putCachedWallpaper as cachePut,
  pruneWallpaperCache as cachePrune,
  removeCachedWallpaper as cacheRemove,
} from '@/lib/wallpaperCache';

export interface CustomWallpaperEntry {
  path: string;
  name: string;
  size: number;
  modified: string;
}

interface WallpaperState {
  customWallpapers: CustomWallpaperEntry[];
  loading: boolean;
  error: string | null;
  invalidatedNotice: string | null;
  migrationDone: boolean;

  fetchCustomWallpapers: () => Promise<void>;
  uploadWallpaper: (file: File) => Promise<{ ok: boolean; error?: string }>;
  deleteWallpaper: (path: string) => Promise<{ ok: boolean; error?: string }>;
  runLegacyMigrationIfNeeded: () => Promise<void>;
  clearInvalidatedNotice: () => void;
}

function getUserId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.userId) || '';
  } catch {
    return '';
  }
}

function getInstanceId(): string {
  return useComputerStore.getState().computer?.id || '';
}

function reconcileAfterList(entries: CustomWallpaperEntry[]): { invalidated: boolean } {
  const paths = new Set(entries.map((e) => e.path));
  const { wallpaperId, setWallpaper, bumpWallpaperRev } = useSettingsStore.getState();
  let invalidated = false;

  if (wallpaperId.startsWith('custom:')) {
    const activePath = wallpaperId.slice('custom:'.length);
    if (!paths.has(activePath)) {
      setWallpaper('construct');
      bumpWallpaperRev();
      invalidated = true;
    }
  }

  const userId = getUserId();
  if (userId) {
    void cachePrune(userId, paths);
  }

  return { invalidated };
}

export const useWallpaperStore = create<WallpaperState>((set, get) => ({
  customWallpapers: [],
  loading: false,
  error: null,
  invalidatedNotice: null,
  migrationDone: false,

  clearInvalidatedNotice: () => set({ invalidatedNotice: null }),

  runLegacyMigrationIfNeeded: async () => {
    if (get().migrationDone) return;
    set({ migrationDone: true });

    const { wallpaperId, setWallpaper } = useSettingsStore.getState();
    if (wallpaperId !== 'custom') return;

    let legacyData: string | null = null;
    try {
      legacyData = localStorage.getItem(LEGACY_CUSTOM_WALLPAPER_KEY);
    } catch { /* */ }
    if (!legacyData) return;

    const instanceId = getInstanceId();
    if (!instanceId) return;

    const file = await dataUrlToFile(legacyData, `migrated-${Date.now()}.jpg`);
    if (!file) return;

    const path = buildWallpaperUploadPath(file.name);
    const upload = await api.uploadContainerFile(instanceId, path, file);
    if (!upload.success) return;

    const userId = getUserId();
    if (userId) {
      await cachePut(userId, path, file);
    }

    setWallpaper(toCustomWallpaperId(path));
    try {
      localStorage.removeItem(LEGACY_CUSTOM_WALLPAPER_KEY);
    } catch { /* */ }

    await get().fetchCustomWallpapers();
  },

  fetchCustomWallpapers: async () => {
    const instanceId = getInstanceId();
    if (!instanceId) {
      set({ customWallpapers: [], loading: false });
      return;
    }

    set({ loading: true, error: null });
    const result = await api.listFiles(instanceId, WALLPAPERS_FOLDER);

    if (!result.success) {
      set({
        loading: false,
        error: result.error || 'Failed to load wallpapers',
        customWallpapers: [],
      });
      return;
    }

    const entries: CustomWallpaperEntry[] = (result.data?.entries || [])
      .filter((entry) => entry.type === 'file' && isWallpaperFileName(entry.name))
      .map((entry) => ({
        path: wallpaperEntryPath(entry.name),
        name: entry.name,
        size: entry.size,
        modified: entry.modified,
      }))
      .sort((a, b) => b.modified.localeCompare(a.modified));

    const { invalidated } = reconcileAfterList(entries);
    set({
      customWallpapers: entries,
      loading: false,
      error: null,
      invalidatedNotice: invalidated ? 'Wallpaper file was removed.' : null,
    });
  },

  uploadWallpaper: async (file: File) => {
    const validation = validateWallpaperFile(file);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const instanceId = getInstanceId();
    if (!instanceId) {
      return { ok: false, error: 'Workspace not ready. Try again in a moment.' };
    }

    const path = buildWallpaperUploadPath(file.name);
    set({ error: null });
    const upload = await api.uploadContainerFile(instanceId, path, file);
    if (!upload.success) {
      const message = upload.error || 'Upload failed';
      set({ error: message });
      return { ok: false, error: message };
    }

    const userId = getUserId();
    if (userId) {
      await cachePut(userId, path, file);
    }

    useSettingsStore.getState().setWallpaper(toCustomWallpaperId(path));
    await get().fetchCustomWallpapers();
    return { ok: true };
  },

  deleteWallpaper: async (path: string) => {
    const instanceId = getInstanceId();
    if (!instanceId) {
      return { ok: false, error: 'Workspace not ready.' };
    }

    set({ error: null });
    const result = await api.deleteItem(instanceId, path);
    if (!result.success) {
      const message = result.error || 'Delete failed';
      set({ error: message });
      return { ok: false, error: message };
    }

    const userId = getUserId();
    if (userId) {
      await cacheRemove(userId, path);
    }

    await get().fetchCustomWallpapers();
    return { ok: true };
  },
}));

/** Call from Files app when a wallpaper file is deleted externally. */
export function notifyWallpaperFilesChanged(): void {
  void useWallpaperStore.getState().fetchCustomWallpapers();
}
