import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ui'
import { recoverFromChunkLoadError } from '@/lib/chunkLoadRecovery'
import { installGlobalErrorHandlers } from '@/stores/errorStore'
import { installLiveUpdates, installNativeBridge } from '@/native'
import { warmWallpaperCacheFromSettings } from '@/lib/wallpaperCache'

// Warm custom wallpaper cache before first paint to avoid default-wallpaper flash.
warmWallpaperCacheFromSettings();

// Initialize before rendering
void installNativeBridge();
void installLiveUpdates();

// Install the full error-capture pipeline (window.onerror + unhandledrejection
// → errorStore) BEFORE React renders so errors in the
// initial render/mount path are captured.
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
