import { STORAGE_KEYS } from '@/lib/constants';
import { customWallpaperPath, isCustomWallpaperId } from '@/lib/wallpapers';

const DB_NAME = 'construct-wallpapers';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

interface CachedWallpaperRecord {
  key: string;
  blob: Blob;
  revision: string;
  updatedAt: number;
}

const objectUrlCache = new Map<string, string>();

function cacheKey(userId: string, workspacePath: string): string {
  return `${userId}:${workspacePath}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open wallpaper cache'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function revokeObjectUrl(key: string): void {
  const existing = objectUrlCache.get(key);
  if (existing) {
    URL.revokeObjectURL(existing);
    objectUrlCache.delete(key);
  }
}

async function readRecord(key: string): Promise<CachedWallpaperRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onerror = () => reject(request.error ?? new Error('Failed to read wallpaper cache'));
    request.onsuccess = () => resolve((request.result as CachedWallpaperRecord | undefined) ?? null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function writeRecord(record: CachedWallpaperRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to write wallpaper cache'));
    };
  });
}

async function deleteRecord(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to delete wallpaper cache'));
    };
  });
}

async function listRecordsForUser(userId: string): Promise<CachedWallpaperRecord[]> {
  const db = await openDb();
  const prefix = `${userId}:`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error ?? new Error('Failed to list wallpaper cache'));
    request.onsuccess = () => {
      const all = (request.result as CachedWallpaperRecord[]) ?? [];
      resolve(all.filter((record) => record.key.startsWith(prefix)));
    };
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export function getSyncCachedBlobUrl(userId: string, workspacePath: string): string | null {
  if (!userId) return null;
  return objectUrlCache.get(cacheKey(userId, workspacePath)) ?? null;
}

/** Preload the active custom wallpaper from IndexedDB into memory before first paint. */
export function warmWallpaperCacheFromSettings(): void {
  void (async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.settings);
      if (!raw) return;

      const wallpaperId = (JSON.parse(raw) as { state?: { wallpaperId?: string } })?.state?.wallpaperId ?? 'construct';
      if (!isCustomWallpaperId(wallpaperId)) return;

      const workspacePath = customWallpaperPath(wallpaperId);
      if (!workspacePath) return;

      const userId = localStorage.getItem(STORAGE_KEYS.userId) || '';
      if (!userId) return;

      const key = cacheKey(userId, workspacePath);
      if (objectUrlCache.has(key)) return;

      await getCachedBlobUrl(userId, workspacePath);
    } catch {
      // Ignore parse/storage errors — hook falls back to async resolution.
    }
  })();
}

export async function putCachedWallpaper(
  userId: string,
  workspacePath: string,
  blob: Blob,
  revision = '',
): Promise<void> {
  const key = cacheKey(userId, workspacePath);
  revokeObjectUrl(key);
  await writeRecord({ key, blob, revision, updatedAt: Date.now() });
  objectUrlCache.set(key, URL.createObjectURL(blob));
}

export async function getCachedBlobUrl(
  userId: string,
  workspacePath: string,
  revision?: string,
): Promise<string | null> {
  const key = cacheKey(userId, workspacePath);
  const record = await readRecord(key);
  if (!record) return null;
  if (revision && record.revision && record.revision !== revision) return null;

  const existing = objectUrlCache.get(key);
  if (existing) return existing;

  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(key, url);
  return url;
}

export async function removeCachedWallpaper(userId: string, workspacePath: string): Promise<void> {
  const key = cacheKey(userId, workspacePath);
  revokeObjectUrl(key);
  await deleteRecord(key);
}

export async function pruneWallpaperCache(userId: string, keepPaths: Set<string>): Promise<void> {
  const records = await listRecordsForUser(userId);
  const prefix = `${userId}:`;
  for (const record of records) {
    const path = record.key.slice(prefix.length);
    if (!keepPaths.has(path)) {
      revokeObjectUrl(record.key);
      await deleteRecord(record.key);
    }
  }
}

export async function clearWallpaperCacheForUser(userId: string): Promise<void> {
  const records = await listRecordsForUser(userId);
  for (const record of records) {
    revokeObjectUrl(record.key);
    await deleteRecord(record.key);
  }
}

export function revokeAllWallpaperObjectUrls(): void {
  for (const key of objectUrlCache.keys()) {
    revokeObjectUrl(key);
  }
}
