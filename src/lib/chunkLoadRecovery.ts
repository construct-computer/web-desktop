const CHUNK_RECOVERY_PREFIX = 'construct:chunk-load-recovered:';

function messageFromUnknown(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message?: unknown }).message ?? '');
  }
  return '';
}

function extractChunkUrl(message: string): string {
  const match = message.match(/https?:\/\/\S+?\.js/i);
  return match?.[0] ?? message.slice(0, 160);
}

export function isChunkLoadError(value: unknown): boolean {
  const message = messageFromUnknown(value);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(message);
}

export async function recoverFromChunkLoadError(value: unknown): Promise<boolean> {
  if (typeof window === 'undefined' || !isChunkLoadError(value)) return false;

  const chunkUrl = extractChunkUrl(messageFromUnknown(value));
  const recoveryKey = `${CHUNK_RECOVERY_PREFIX}${chunkUrl}`;
  if (window.sessionStorage.getItem(recoveryKey)) return false;
  window.sessionStorage.setItem(recoveryKey, '1');

  try {
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map(name => window.caches.delete(name)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
  } catch {
    // Reloading is still the best recovery path if cache cleanup is unavailable.
  }

  window.location.reload();
  return true;
}
