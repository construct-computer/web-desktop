import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    deferredPWAInstallPrompt?: BeforeInstallPromptEvent;
  }

  interface Navigator {
    getInstalledRelatedApps?: () => Promise<Array<{ platform: string; url?: string }>>;
  }
}

async function detectInstalledPWA(): Promise<boolean> {
  if (localStorage.getItem('pwa-installed') === 'true') {
    return true;
  }

  if (typeof navigator.getInstalledRelatedApps === 'function') {
    try {
      const relatedApps = await navigator.getInstalledRelatedApps();
      if (relatedApps.length > 0) {
        localStorage.setItem('pwa-installed', 'true');
        return true;
      }
    } catch {
      // Ignore — API may be unavailable or blocked.
    }
  }

  return false;
}

export function usePWA() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if running as standalone PWA
    const checkStandalone = () => {
      return window.matchMedia('(display-mode: standalone)').matches || 
             ('standalone' in navigator && (navigator as any).standalone);
    };
    
    setIsStandalone(checkStandalone());

    const mq = window.matchMedia('(display-mode: standalone)');
    const handleMq = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    mq.addEventListener('change', handleMq);

    if (window.deferredPWAInstallPrompt) {
      setDeferredPrompt(window.deferredPWAInstallPrompt);
      setIsInstalled(false);
      localStorage.removeItem('pwa-installed');
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      window.deferredPWAInstallPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // If we get this prompt, it's definitely not installed yet
      setIsInstalled(false);
      localStorage.removeItem('pwa-installed');
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      localStorage.setItem('pwa-installed', 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    void detectInstalledPWA().then((installed) => {
      if (installed) setIsInstalled(true);
    });

    return () => {
      mq.removeEventListener('change', handleMq);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalled(true);
      localStorage.setItem('pwa-installed', 'true');
    }
  };

  const openInstalledApp = useCallback(() => {
    window.open(window.location.origin, '_blank', 'noopener,noreferrer');
  }, []);

  return { isStandalone, deferredPrompt, isInstalled, installPWA, openInstalledApp };
}
