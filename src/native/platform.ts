import { Capacitor } from '@capacitor/core';

export type NativePlatform = 'web' | 'ios' | 'android';

export function getNativePlatform(): NativePlatform {
  return Capacitor.getPlatform() as NativePlatform;
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isNativeMobile(): boolean {
  const platform = getNativePlatform();
  return platform === 'ios' || platform === 'android';
}
