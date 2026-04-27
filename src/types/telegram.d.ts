export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        platform?: string;
        colorScheme?: 'light' | 'dark';
        initData?: string;
        themeParams?: Record<string, string | undefined>;
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        openLink?: (url: string) => void;
        BackButton?: {
          show?: () => void;
          hide?: () => void;
          onClick?: (handler: () => void) => void;
          offClick?: (handler: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred?: (type: 'success' | 'warning' | 'error') => void;
        };
      };
    };
  }
}
