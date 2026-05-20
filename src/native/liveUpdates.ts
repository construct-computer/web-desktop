import { API_BASE_URL, STORAGE_KEYS } from '@/lib/config';
import { getCurrentDeviceId } from './pushRegistration';
import { getNativePlatform, isNativePlatform } from './platform';

const DEFAULT_OTA_CHANNEL = import.meta.env.VITE_OTA_CHANNEL || 'production';
const OTA_CHECK_INTERVAL_MS = 10 * 60 * 1000;

type OtaLatestResponse = {
  version?: string;
  url?: string;
  checksum?: string;
  kind?: 'up_to_date' | 'blocked' | 'failed';
  error?: string;
  message?: string;
};

let installed = false;
let checking = false;

function resolveApiUrl(path: string): string | null {
  const configured = import.meta.env.VITE_OTA_API_BASE_URL || API_BASE_URL;
  if (/^https?:\/\//i.test(configured)) {
    return `${configured.replace(/\/$/, '')}${path}`;
  }

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return `${window.location.origin}${configured.startsWith('/') ? configured : `/${configured}`}${path}`;
  }

  return null;
}

function shouldCheck(force: boolean): boolean {
  if (force) return true;
  try {
    const last = Number(localStorage.getItem(STORAGE_KEYS.lastLiveUpdateCheck) || '0');
    return !last || Date.now() - last >= OTA_CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markChecked(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.lastLiveUpdateCheck, String(Date.now()));
  } catch { /* storage unavailable */ }
}

export async function checkForLiveUpdate(force = false): Promise<void> {
  if (!isNativePlatform() || checking || !shouldCheck(force)) return;

  const latestUrl = resolveApiUrl('/ota/latest');
  if (!latestUrl) return;

  checking = true;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const current = await CapacitorUpdater.current().catch(() => null);
    const nativeVersion = current?.native || undefined;
    const currentVersion = current?.bundle?.version || nativeVersion || 'builtin';
    const params = new URLSearchParams({
      channel: DEFAULT_OTA_CHANNEL,
      current: currentVersion,
      platform: getNativePlatform(),
    });

    if (nativeVersion) params.set('nativeVersion', nativeVersion);
    const deviceId = getCurrentDeviceId();
    if (deviceId) params.set('deviceId', deviceId);

    const response = await fetch(`${latestUrl}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return;

    const latest = await response.json() as OtaLatestResponse;
    markChecked();
    if (!latest.url || !latest.version || latest.kind === 'up_to_date' || latest.kind === 'blocked') return;
    if (latest.version === currentVersion) return;

    const bundle = await CapacitorUpdater.download({
      version: latest.version,
      url: latest.url,
      checksum: latest.checksum,
    });

    await CapacitorUpdater.next({ id: bundle.id });
  } catch (error) {
    console.warn('[native] live update check failed', error);
  } finally {
    checking = false;
  }
}

export async function installLiveUpdates(): Promise<void> {
  if (!isNativePlatform() || installed) return;
  installed = true;

  try {
    const [{ CapacitorUpdater }, { App }] = await Promise.all([
      import('@capgo/capacitor-updater'),
      import('@capacitor/app'),
    ]);

    await CapacitorUpdater.notifyAppReady().catch((error) => {
      console.warn('[native] live update ready notification failed', error);
    });

    const deviceId = getCurrentDeviceId();
    if (deviceId) {
      await CapacitorUpdater.setCustomId({ customId: deviceId }).catch(() => undefined);
    }

    void checkForLiveUpdate();

    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void checkForLiveUpdate();
    });

    window.addEventListener('construct:native-resume', () => {
      void checkForLiveUpdate();
    });
  } catch (error) {
    console.warn('[native] live updates unavailable', error);
  }
}
