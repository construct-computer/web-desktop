import { STORAGE_KEYS } from '@/lib/constants';
import { log } from '@/lib/logger';
import { reportClientError } from '@/lib/observability';
import * as api from '@/services/api';
import { registerForNativePushNotifications, clearDeliveredNativeNotifications } from './notifications';
import { isNativePlatform } from './platform';

const logger = log('PushRegistration');

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEYS.deviceId)
    || localStorage.getItem(STORAGE_KEYS.nativePushDeviceId);
  if (existing) return existing;
  const created = `native_${crypto.randomUUID()}`;
  localStorage.setItem(STORAGE_KEYS.deviceId, created);
  return created;
}

export function getCurrentDeviceId(): string {
  return getOrCreateDeviceId();
}

function deviceLabel(): string {
  const parts = [
    navigator.platform,
    /iPhone|iPad|Android/i.exec(navigator.userAgent)?.[0],
  ].filter(Boolean);
  return parts.join(' · ') || 'Native app';
}

export async function syncNativePushRegistration(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const registration = await registerForNativePushNotifications();
    if (!registration?.token) return;

    const result = await api.registerNativePushToken({
      token: registration.token,
      platform: registration.platform,
      deviceId: getOrCreateDeviceId(),
      deviceLabel: deviceLabel(),
    });

    if (result.success) {
      localStorage.setItem(STORAGE_KEYS.nativePushToken, registration.token);
    }
  } catch (error) {
    logger.warn('Push registration failed', { error });
    reportClientError({
      source: 'PushRegistration',
      message: 'Native push registration failed',
      error,
    });
  }
}

export async function unregisterCurrentNativePushToken(): Promise<void> {
  if (!isNativePlatform()) return;

  const token = localStorage.getItem(STORAGE_KEYS.nativePushToken);
  localStorage.removeItem(STORAGE_KEYS.nativePushToken);

  if (token) {
    await api.unregisterNativePushToken(token).catch((error) => {
      logger.warn('Push unregister failed', { error });
    });
  }
  await clearDeliveredNativeNotifications().catch(() => undefined);
}
