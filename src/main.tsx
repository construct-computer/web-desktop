import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ui'
import { initAnalytics } from '@/lib/analytics'
import { initSentry } from '@/lib/sentry'
import { recoverFromChunkLoadError } from '@/lib/chunkLoadRecovery'
import { installLiveUpdates, installNativeBridge } from '@/native'

// Initialize observability before rendering
initSentry();
initAnalytics();
void installNativeBridge();
void installLiveUpdates();

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
