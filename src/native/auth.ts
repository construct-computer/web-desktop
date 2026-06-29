import { InAppBrowser } from '@capacitor/inappbrowser';
import { isNativePlatform } from './platform';

export async function openNativeExternalUrl(url: string): Promise<boolean> {
  if (!isNativePlatform()) return false;

  await InAppBrowser.openInExternalBrowser({
    url,
  });
  return true;
}

export async function openNativeAuthUrl(url: string): Promise<boolean> {
  return openNativeExternalUrl(url);
}
