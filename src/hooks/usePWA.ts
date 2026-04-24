import { useState, useEffect } from 'react';

declare global {
  interface Window {
    deferredPWAInstallPrompt?: any;
  }
}

export function usePWA() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
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
      window.deferredPWAInstallPrompt = e;
      setDeferredPrompt(e);
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

    // Initial installed state check
    if (localStorage.getItem('pwa-installed') === 'true') {
      setIsInstalled(true);
    }

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

  return { isStandalone, deferredPrompt, isInstalled, installPWA };
}
