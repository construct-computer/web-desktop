/**
 * Platform abstraction for the shared mobile UI.
 *
 * Normalizes Telegram vs Browser differences behind a single context.
 * Screens never need to know which platform they're on — they call
 * platform.haptic(), platform.openExternalLink(), etc.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface MobilePlatform {
  type: 'telegram' | 'browser';
  isDark: boolean;

  /** Show/hide the platform back button (Telegram native, or browser UI). */
  setBackButtonVisible: (visible: boolean) => void;
  /** Register a handler for the back button. Returns cleanup function. */
  onBackButton: (handler: () => void) => (() => void);

  /** Open a URL in the system browser (not in-app). */
  openExternalLink: (url: string) => void;

  /** Haptic feedback. No-op on unsupported platforms. */
  haptic: (type: 'light' | 'medium' | 'success' | 'error' | 'warning') => void;

  /** Close the app (Telegram only). */
  close?: () => void;
}

const PlatformContext = createContext<MobilePlatform | null>(null);

export function PlatformProvider({ value, children }: { value: MobilePlatform; children: ReactNode }) {
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): MobilePlatform {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within a PlatformProvider');
  return ctx;
}

// ── Factory helpers ──

/** Create a MobilePlatform for Telegram WebApp context. */
export function createTelegramPlatform(): MobilePlatform {
  const tg = window.Telegram?.WebApp as any;

  return {
    type: 'telegram',
    isDark: tg?.colorScheme === 'dark',

    setBackButtonVisible(visible) {
      if (visible) tg?.BackButton?.show();
      else tg?.BackButton?.hide();
    },

    onBackButton(handler) {
      tg?.BackButton?.onClick(handler);
      return () => tg?.BackButton?.offClick(handler);
    },

    openExternalLink(url) {
      if (tg?.openLink) tg.openLink(url);
      else window.open(url, '_blank');
    },

    haptic(type) {
      try {
        if (type === 'success' || type === 'error' || type === 'warning') {
          tg?.HapticFeedback?.notificationOccurred?.(type);
        } else {
          tg?.HapticFeedback?.impactOccurred?.(type);
        }
      } catch { /* ignore */ }
    },

    close: () => tg?.close(),
  };
}

/** Create a MobilePlatform for regular browser context. */
export function createBrowserPlatform(isDark: boolean): MobilePlatform {
  return {
    type: 'browser',
    isDark,

    // Browser back button is handled by MobileShell's own UI
    setBackButtonVisible() {},
    onBackButton() { return () => {}; },

    openExternalLink(url) {
      window.open(url, '_blank');
    },

    haptic(type) {
      try {
        if (navigator.vibrate) {
          const ms = type === 'light' ? 10 : type === 'medium' ? 20 : 15;
          navigator.vibrate(ms);
        }
      } catch { /* ignore */ }
    },
  };
}

// ── Theme CSS variable setup ──

/** Set mobile theme CSS vars from Telegram theme params. */
export function applyTelegramTheme() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  const isDark = tg.colorScheme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);

  const tp = tg.themeParams;
  if (!tp) return;
  const root = document.documentElement.style;
  if (tp.bg_color) root.setProperty('--mobile-bg', tp.bg_color);
  if (tp.text_color) root.setProperty('--mobile-text', tp.text_color);
  if (tp.hint_color) root.setProperty('--mobile-hint', tp.hint_color);
  if (tp.link_color) root.setProperty('--mobile-link', tp.link_color);
  if (tp.button_color) root.setProperty('--mobile-accent', tp.button_color);
  if (tp.secondary_bg_color) root.setProperty('--mobile-bg2', tp.secondary_bg_color);
  // Also set legacy --tg-* vars for existing mini screens that reference them
  if (tp.bg_color) root.setProperty('--tg-bg', tp.bg_color);
  if (tp.text_color) root.setProperty('--tg-text', tp.text_color);
  if (tp.hint_color) root.setProperty('--tg-hint', tp.hint_color);
  if (tp.link_color) root.setProperty('--tg-link', tp.link_color);
  if (tp.button_color) root.setProperty('--tg-button', tp.button_color);
  if (tp.secondary_bg_color) root.setProperty('--tg-bg2', tp.secondary_bg_color);
}

/** Set mobile theme CSS vars for regular browser (system theme). */
export function applyBrowserTheme(isDark: boolean) {
  const root = document.documentElement.style;
  if (isDark) {
    root.setProperty('--mobile-bg', '#09090b');
    root.setProperty('--mobile-text', '#fafafa');
    root.setProperty('--mobile-hint', '#71717a');
    root.setProperty('--mobile-link', '#60a5fa');
    root.setProperty('--mobile-accent', '#60A5FA');
    root.setProperty('--mobile-bg2', 'rgba(255,255,255,0.04)');
  } else {
    root.setProperty('--mobile-bg', '#ffffff');
    root.setProperty('--mobile-text', '#09090b');
    root.setProperty('--mobile-hint', '#71717a');
    root.setProperty('--mobile-link', '#2563eb');
    root.setProperty('--mobile-accent', '#2563eb');
    root.setProperty('--mobile-bg2', 'rgba(0,0,0,0.04)');
  }
}
