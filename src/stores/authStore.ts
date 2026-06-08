import { create } from 'zustand';
import * as api from '@/services/api';
import type { User } from '@/types';
import { STORAGE_KEYS } from '@/lib/constants';
import analytics from '@/lib/analytics';
import { clearSentryUser, identifySentryUser } from '@/lib/sentry';
import { openNativeAuthUrl, unregisterCurrentNativePushToken } from '@/native';
import {
  deferWallpaperCacheClearForUser,
  promoteActiveWallpaperToSession,
} from '@/lib/wallpaperCache';
import { saveSessionWallpaper } from '@/lib/wallpaperSession';
import { setUserWallpaper } from '@/lib/wallpaperPrefs';
import { useSettingsStore } from '@/stores/settingsStore';

type MagicLinkState = 'idle' | 'sending' | 'sent' | 'verifying' | 'error';

/**
 * Clear all user-specific data from localStorage and sessionStorage
 * when a different user logs in (or first login with stale data).
 *
 * Preserves cosmetic settings, since those are user-independent.
 */
function clearStaleUserData(newUserId: string): void {
  const previousUserId = localStorage.getItem(STORAGE_KEYS.userId);

  if (previousUserId === newUserId) {
    // Same user — nothing to clear
    return;
  }

  console.log(
    previousUserId
      ? `[auth] User changed (${previousUserId} → ${newUserId}), clearing stale data`
      : `[auth] First login as ${newUserId}, clearing any stale data`
  );

  // Clear all sessionStorage (wizard progress, etc.)
  try { sessionStorage.clear(); } catch { /* */ }

  // Clear user-specific localStorage keys
  // We enumerate all known construct: keys and remove them,
  // EXCEPT settings (cosmetic) and the token (just set by login).
  const PRESERVE = new Set([STORAGE_KEYS.token, STORAGE_KEYS.settings, STORAGE_KEYS.userId]);

  // Remove all known keys
  const keysToRemove = [
    STORAGE_KEYS.windowPositions,
    'construct:tracker:dismissedGoals',
    'construct:tracker:operations',
    STORAGE_KEYS.browserDismissedTabs,
    'construct:tour-completed',
    'construct:tour-skipped',
    'construct:agent-widget-pos',
    STORAGE_KEYS.promoCode,
    STORAGE_KEYS.promoSeen,
  ];
  for (const key of keysToRemove) {
    try { localStorage.removeItem(key); } catch { /* */ }
  }

  // Also clear any per-session chat drafts (construct:chat-draft:*)
  try {
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      if (key.startsWith('construct:chat-draft:')) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* */ }

  // Record the new user
  localStorage.setItem(STORAGE_KEYS.userId, newUserId);

  if (previousUserId) {
    deferWallpaperCacheClearForUser(previousUserId);
  }

  useSettingsStore.getState().applyWallpaperForUser(newUserId);
}

async function clearWallpaperCacheOnSessionEnd(): Promise<void> {
  // Wallpaper cache is preserved across logout so the login screen can show
  // the last user's custom wallpaper from local storage.
}

function persistWallpaperSessionBeforeLogout(): void {
  try {
    const userId = localStorage.getItem(STORAGE_KEYS.userId);
    if (!userId) return;

    const { wallpaperId } = useSettingsStore.getState();
    setUserWallpaper(userId, wallpaperId);
    saveSessionWallpaper(wallpaperId, userId);
    void promoteActiveWallpaperToSession(userId, wallpaperId);
  } catch { /* storage unavailable */ }
}

function clearLocalSessionData(): void {
  void clearWallpaperCacheOnSessionEnd();
  api.clearToken();

  try { sessionStorage.clear(); } catch { /* */ }
  try { localStorage.removeItem('construct:tracker:dismissedGoals'); } catch { /* */ }
  try { localStorage.removeItem('construct:tracker:operations'); } catch { /* */ }
  try { localStorage.removeItem(STORAGE_KEYS.browserDismissedTabs); } catch { /* */ }
  try { localStorage.removeItem(STORAGE_KEYS.windowPositions); } catch { /* */ }
  try { localStorage.removeItem(STORAGE_KEYS.userId); } catch { /* */ }
  try { localStorage.removeItem('construct:tour-completed'); } catch { /* */ }
  try { localStorage.removeItem('construct:tour-skipped'); } catch { /* */ }
  try { localStorage.removeItem('construct:agent-widget-pos'); } catch { /* */ }
  try { localStorage.removeItem(STORAGE_KEYS.nativePushToken); } catch { /* */ }

  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('construct:chat-draft:')) localStorage.removeItem(key);
    }
  } catch { /* */ }
}

function hardReloadToLogin(): void {
  try {
    window.history.replaceState({}, '', '/');
  } catch { /* */ }
  window.setTimeout(() => window.location.reload(), 0);
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  // Magic link state
  magicLinkState: MagicLinkState;
  magicLinkEmail: string | null;

  // Actions
  loginWithGoogle: () => void;
  sendMagicLink: (email: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  resetMagicLink: () => void;
  handleOAuthReturn: () => Promise<boolean>;
  logout: () => void;
  handleRemoteLogout: () => void;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
  updateProfile: (data: { displayName: string }) => Promise<boolean>;
  markSetupDone: () => Promise<boolean>;
  /** Update user object in-place (e.g. after setup completion). */
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
  magicLinkState: 'idle',
  magicLinkEmail: null,

  loginWithGoogle: () => {
    analytics.loginStarted('google');
    const url = api.getGoogleAuthUrl();
    void openNativeAuthUrl(url).then((openedNative) => {
      if (!openedNative) window.location.href = url;
    }).catch((error) => {
      console.warn('[auth] native Google auth open failed, falling back to window navigation:', error);
      window.location.href = url;
    });
  },

  sendMagicLink: async (email: string) => {
    analytics.loginStarted('magic_link');
    set({ magicLinkState: 'sending', error: null, magicLinkEmail: email });

    const result = await api.sendMagicLink(email);

    if (result.success) {
      set({ magicLinkState: 'sent' });
    } else {
      analytics.loginFailed('magic_link', result.error);
      set({
        magicLinkState: 'error',
        error: result.error || 'Failed to send magic link.',
      });
    }
  },

  verifyOtp: async (otp: string) => {
    const email = useAuthStore.getState().magicLinkEmail;
    if (!email) {
      set({ magicLinkState: 'error', error: 'No email address. Please start over.' });
      return;
    }

    set({ magicLinkState: 'verifying', error: null });

    const result = await api.verifyOtp(email, otp);

    if (result.success) {
      api.setToken(result.data.token);
      clearStaleUserData(result.data.user.id);
      analytics.loginSuccess('magic_link');
      analytics.identify(result.data.user);
      identifySentryUser(result.data.user);
      set({
        user: result.data.user,
        isAuthenticated: true,
        isLoading: false,
        magicLinkState: 'idle',
        magicLinkEmail: null,
        error: null,
      });
    } else {
      analytics.loginFailed('magic_link', result.error);
      // Stay in 'sent' state so user can retry OTP (don't reset to 'error' which hides the OTP input)
      set({
        magicLinkState: 'sent',
        error: result.error || 'Invalid code. Please try again.',
      });
    }
  },

  resetMagicLink: () => {
    set({ magicLinkState: 'idle', magicLinkEmail: null, error: null });
  },

  handleOAuthReturn: async () => {
    // Check for error first
    const oauthError = api.getOAuthError();
    if (oauthError) {
      const oauthDetail = api.getOAuthErrorDetail();
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      url.searchParams.delete('auth_detail');
      window.history.replaceState({}, '', url.pathname);

      const errorMessages: Record<string, string> = {
        email_not_verified: 'Your Google email is not verified.',
        not_allowed: 'Your account is not on the invite list.',
        access_restricted: 'Your account is not on the invite list.',
        invalid_token: 'This sign-in link is invalid.',
        link_already_used: 'This sign-in link has already been used.',
        link_expired: 'This sign-in link has expired. Please request a new one.',
        missing_token: 'Invalid sign-in link.',
        missing_code: 'Google sign-in was cancelled or failed.',
        google_not_configured: 'Google sign-in is not available. Try email instead.',
        callback_failed: 'Google sign-in failed. Please try again.',
        token_exchange_failed: 'Google sign-in failed. Please try again.',
        missing_params: 'Google sign-in failed. Please try again.',
        invalid_state: 'Google sign-in expired. Please try again.',
      };

      let errorMsg = errorMessages[oauthError] || `Sign in failed (${oauthError}). Please try again.`;
      // Show detailed error in staging for debugging
      if (oauthDetail) {
        errorMsg += `\n\nDebug: ${oauthDetail}`;
        console.error('[Auth] OAuth error detail:', oauthDetail);
      }

      analytics.loginFailed('google', oauthError);
      set({
        error: errorMsg,
        isLoading: false,
      });
      // Return true — we DID handle an OAuth return (an error), so skip the welcome screen
      return true;
    }

    // Check for token in URL
    const gotToken = api.handleOAuthCallback();
    if (!gotToken) return false;

    // Token was stored — fetch user profile
    set({ isLoading: true });
    const result = await api.getMe();

    if (result.success) {
      if (result.data.token) api.setToken(result.data.token);
      // Clear stale data if this is a different user than last time
      clearStaleUserData(result.data.user.id);
      analytics.loginSuccess('google');
      analytics.identify(result.data.user);
      identifySentryUser(result.data.user);
      set({
        user: result.data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } else {
      analytics.loginFailed('google', 'profile_fetch_failed');
      api.clearToken();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Failed to load user profile',
      });
      return false;
    }
  },

  logout: () => {
    analytics.logout();
    clearSentryUser();
    void unregisterCurrentNativePushToken();
    api.logout();

    persistWallpaperSessionBeforeLogout();
    clearLocalSessionData();

    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      magicLinkState: 'idle',
      magicLinkEmail: null,
    });
  },

  handleRemoteLogout: () => {
    analytics.reset();
    clearSentryUser();
    void unregisterCurrentNativePushToken();
    persistWallpaperSessionBeforeLogout();
    clearLocalSessionData();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      magicLinkState: 'idle',
      magicLinkEmail: null,
    });
    hardReloadToLogin();
  },

  checkAuth: async () => {
    const token = localStorage.getItem(STORAGE_KEYS.token);
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return false;
    }

    set({ isLoading: true });

    const result = await api.getMe();

    if (result.success) {
      if (result.data.token) api.setToken(result.data.token);
      // Clear stale data if this is a different user than last time
      clearStaleUserData(result.data.user.id);
      // Identify returning user for analytics
      analytics.identify(result.data.user);
      identifySentryUser(result.data.user);
      set({
        user: result.data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } else {
      clearLocalSessionData();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      return false;
    }
  },

  clearError: () => set({ error: null }),

  updateProfile: async (data: { displayName: string }) => {
    const result = await api.updateProfile(data);
    if (result.success) {
      set({ user: result.data.user });
      return true;
    }
    return false;
  },

  markSetupDone: async () => {
    const result = await api.markSetupComplete();
    if (result.success) {
      set({ user: result.data.user });
      return true;
    }
    return false;
  },

  setUser: (user: User) => set({ user }),
}));
