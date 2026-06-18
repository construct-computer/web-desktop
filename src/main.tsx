import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ui'
import { initAnalytics } from '@/lib/analytics'
import { initSentry } from '@/lib/sentry'
import { recoverFromChunkLoadError } from '@/lib/chunkLoadRecovery'
import { installGlobalErrorHandlers } from '@/stores/errorStore'
import { installLiveUpdates, installNativeBridge } from '@/native'
import { warmWallpaperCacheFromSettings } from '@/lib/wallpaperCache'

// Warm custom wallpaper cache before first paint to avoid default-wallpaper flash.
warmWallpaperCacheFromSettings();

// Initialize Sentry BEFORE rendering so the global error handlers and
// ErrorBoundary feed it from the first paint. No-op if VITE_PUBLIC_SENTRY_DSN
// is unset (local dev).
initSentry();

// Initialize analytics before rendering
initAnalytics();
void installNativeBridge();
void installLiveUpdates();

// Install the full error-capture pipeline (window.onerror + unhandledrejection
// → errorStore → PostHog + Sentry) BEFORE React renders so errors in the
// initial render/mount path are captured. Previously this ran from App.tsx's
// useEffect, leaving a gap between first paint and App mount.
installGlobalErrorHandlers();

window.addEventListener('error', (event) => {
  void recoverFromChunkLoadError(event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  void recoverFromChunkLoadError(event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
