import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ui'
import { initAnalytics } from '@/lib/analytics'
import { installLiveUpdates, installNativeBridge } from '@/native'

// Initialize PostHog analytics before rendering
initAnalytics();
void installNativeBridge();
void installLiveUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
