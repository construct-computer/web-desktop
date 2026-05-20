import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.construct.computer',
  appName: 'Construct',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#05070b',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_construct',
      iconColor: '#60a5fa',
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
    BackgroundRunner: {
      label: 'com.construct.computer.background',
      src: 'runners/construct-background.js',
      event: 'constructBackgroundRefresh',
      repeat: true,
      interval: 15,
      autoStart: false,
    },
    CapacitorUpdater: {
      autoUpdate: false,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      appReadyTimeout: 10_000,
    },
  },
};

export default config;
