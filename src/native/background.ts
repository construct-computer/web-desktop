import { isNativePlatform } from './platform';

export async function dispatchNativeBackgroundRefresh(details: Record<string, unknown> = {}): Promise<void> {
  if (!isNativePlatform()) return;

  const { BackgroundRunner } = await import('@capacitor/background-runner');
  await BackgroundRunner.dispatchEvent({
    label: 'com.construct.computer.background',
    event: 'constructBackgroundRefresh',
    details,
  });
}
