/**
 * BrowserShell — mobile browser wrapper for MobileShell.
 *
 * Thin layer that:
 * - Sets up the browser platform context (theme, back button, haptics)
 * - Applies mobile theme CSS variables
 * - Renders MobileShell (the shared UI)
 *
 * Auth is handled by App.tsx (BrowserShell only renders when authenticated).
 * Agent connection is handled by the global stores (same as Desktop).
 */

import { useEffect, useMemo } from 'react';
import { PlatformProvider, createBrowserPlatform, applyBrowserTheme } from './platform';
import { MobileShell } from './MobileShell';
import { useAuthStore } from '@/stores/authStore';
import { SetupModal } from '@/components/apps/SetupModal';

export function BrowserShell() {
  const user = useAuthStore(s => s.user);
  const isDark = useMemo(() => {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  }, []);

  // Apply mobile theme CSS vars for browser context
  useEffect(() => {
    applyBrowserTheme(isDark);
  }, [isDark]);

  const platform = useMemo(() => createBrowserPlatform(isDark), [isDark]);

  return (
    <PlatformProvider value={platform}>
      <MobileShell />
      {/* Setup modal — permanent overlay until user completes initial setup */}
      {user && !user.setupCompleted && <SetupModal />}
    </PlatformProvider>
  );
}
