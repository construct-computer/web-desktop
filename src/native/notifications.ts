import { isNativePlatform } from './platform';

export interface NativePushRegistration {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

export async function registerForNativePushNotifications(): Promise<NativePushRegistration | null> {
  if (!isNativePlatform()) return null;

  const { PushNotifications } = await import('@capacitor/push-notifications');
  const { getNativePlatform } = await import('./platform');

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted') return null;

  return new Promise((resolve, reject) => {
    let settled = false;
    let cleanup = () => {};

    function settle(callback: () => void) {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    }

    Promise.all([
      PushNotifications.addListener('registration', (token) => {
        settle(() => resolve({ token: token.value, platform: getNativePlatform() }));
      }),
      PushNotifications.addListener('registrationError', (error) => {
        settle(() => reject(error));
      }),
    ]).then((handles) => {
      cleanup = () => {
        handles.forEach((handle) => {
          void handle.remove();
        });
      };
      void PushNotifications.register();
    }).catch(reject);
  });
}

export async function addNativePushNotificationListeners(options: {
  onReceived?: (notification: unknown) => void;
  onAction?: (action: unknown) => void;
}): Promise<() => void> {
  if (!isNativePlatform()) return () => {};

  const { PushNotifications } = await import('@capacitor/push-notifications');
  const handles = await Promise.all([
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      options.onReceived?.(notification);
    }),
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      options.onAction?.(action);
    }),
  ]);

  return () => {
    handles.forEach((handle) => {
      void handle.remove();
    });
  };
}

export async function clearDeliveredNativeNotifications(): Promise<void> {
  if (!isNativePlatform()) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.removeAllDeliveredNotifications();
}

export async function scheduleNativeLocalNotification(title: string, body: string): Promise<void> {
  if (!isNativePlatform()) return;

  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display === 'prompt') {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== 'granted') return;

  await LocalNotifications.schedule({
    notifications: [
      {
        id: Date.now() % 2147483647,
        title,
        body,
      },
    ],
  });
}
