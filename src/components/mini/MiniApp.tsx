/**
 * MiniApp — root shell for the Telegram Mini App.
 *
 * Architecture: Phone-like app experience with home screen grid.
 * The Telegram bot IS the chat — this Mini App provides the desktop
 * companion features: files, calendar, email, settings, app registry.
 *
 * Navigation: Stack-based push/pop with Telegram BackButton integration.
 * Toast system wraps all screens for feedback.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { agentWS } from '@/services/websocket';
import { STORAGE_KEYS, API_BASE_URL } from '@/lib/constants';
import { ToastProvider, BackHandlerProvider, bg, textColor } from './ui';
import { HomeScreen, type MiniScreen } from './screens/HomeScreen';
import { FilesScreen } from './screens/FilesScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { EmailScreen } from './screens/EmailScreen';

import { MemoryScreen } from './screens/MemoryScreen';
import { AppStoreScreen } from './screens/AppStoreScreen';
import { AccessControlScreen } from './screens/AccessControlScreen';
import { AuditLogsScreen } from './screens/AuditLogsScreen';
import { Loader2 } from 'lucide-react';

type AppState = 'loading' | 'not_linked' | 'error' | 'ready';

export function MiniApp() {
  const [state, setState] = useState<AppState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [screenStack, setScreenStack] = useState<MiniScreen[]>(['home']);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const currentScreen = screenStack[screenStack.length - 1];

  // ── Navigation helpers with slide animations ──
  const pushScreen = useCallback((screen: MiniScreen) => {
    setSlideDir('left');
    setScreenStack(prev => [...prev, screen]);
    // Clear animation after it plays
    setTimeout(() => setSlideDir(null), 220);
  }, []);

  const popScreen = useCallback(() => {
    if (screenStack.length <= 1) return;
    setSlideDir('right');
    setScreenStack(prev => prev.slice(0, -1));
    setTimeout(() => setSlideDir(null), 220);
  }, [screenStack.length]);

  // ── Custom back handler from child screens ──
  const [customBackHandler, setCustomBackHandler] = useState<(() => void) | null>(null);
  const setBackHandler = useCallback((handler: (() => void) | null) => {
    setCustomBackHandler(() => handler);
  }, []);

  // Combined back action: custom handler takes priority, then popScreen
  const handleBack = useCallback(() => {
    if (customBackHandler) {
      customBackHandler();
    } else {
      popScreen();
    }
  }, [popScreen, customBackHandler]);

  // ── Telegram BackButton ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp as any;
    if (!tg?.BackButton) return;

    if (screenStack.length > 1 || customBackHandler) {
      tg.BackButton.show();
      tg.BackButton.onClick(handleBack);
      return () => {
        tg.BackButton.offClick(handleBack);
      };
    } else {
      tg.BackButton.hide();
    }
  }, [screenStack, handleBack, customBackHandler]);

  // ── 1. Telegram init + theme ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setErrorMsg('Not running inside Telegram');
      setState('error');
      return;
    }
    tg.ready();
    tg.expand();

    const isDark = tg.colorScheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);

    const tp = tg.themeParams;
    if (tp) {
      const root = document.documentElement.style;
      if (tp.bg_color) root.setProperty('--tg-bg', tp.bg_color);
      if (tp.text_color) root.setProperty('--tg-text', tp.text_color);
      if (tp.hint_color) root.setProperty('--tg-hint', tp.hint_color);
      if (tp.link_color) root.setProperty('--tg-link', tp.link_color);
      if (tp.button_color) root.setProperty('--tg-button', tp.button_color);
      if (tp.secondary_bg_color) root.setProperty('--tg-bg2', tp.secondary_bg_color);
    }
  }, []);

  // ── 2. Authentication ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    // Check for OAuth return
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('token');
    const linked = params.get('linked');
    if (oauthToken && linked === 'true') {
      localStorage.setItem(STORAGE_KEYS.token, oauthToken);
      window.history.replaceState({}, '', '/mini');
      initializeApp(oauthToken);
      return;
    }

    const initData = tg.initData;
    if (!initData) {
      setErrorMsg('No auth data from Telegram');
      setState('error');
      return;
    }

    fetch(`${API_BASE_URL}/telegram/mini-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          if (body.code === 'NOT_LINKED') setState('not_linked');
          else { setErrorMsg(body.error || 'Auth failed'); setState('error'); }
          return;
        }
        localStorage.setItem(STORAGE_KEYS.token, body.token);
        initializeApp(body.token);
      })
      .catch(() => { setErrorMsg('Network error'); setState('error'); });
  }, []);

  // ── 3. Initialize app ──
  const initializeApp = useCallback(async (token: string) => {
    try {
      const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) { setErrorMsg('Failed to authenticate'); setState('error'); return; }
      const meData = await meRes.json();
      const instanceId = meData.user?.id;
      if (!instanceId) { setErrorMsg('No agent instance found'); setState('error'); return; }

      useComputerStore.setState({ instanceId });

      // Connect WebSocket for real-time agent state
      agentWS.connect(instanceId);
      agentWS.onConnection((connected) => {
        useComputerStore.setState({ agentConnected: connected });
      });

      // Load store data
      const store = useComputerStore.getState();
      store.subscribeToComputer();
      store.fetchComputer();

      setState('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to initialize');
      setState('error');
    }
  }, []);

  // ── 4. Periodic refresh of agent state ──
  useEffect(() => {
    if (state !== 'ready') return;
    const iv = setInterval(() => {
      useComputerStore.getState().fetchComputer();
    }, 60_000);
    return () => clearInterval(iv);
  }, [state]);

  // ── 5. Visibility change → reconnect WS + refresh state ──
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        agentWS.forceReconnect();
        if (state === 'ready') {
          useComputerStore.getState().fetchComputer();
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [state]);

  // ── Render ──
  const bgColor = bg();
  const txtColor = textColor();

  if (state === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: bgColor, color: txtColor }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin opacity-50" />
          <p className="text-sm opacity-50">Connecting...</p>
        </div>
      </div>
    );
  }

  if (state === 'not_linked') return <NotLinkedScreen bgColor={bgColor} textColor={txtColor} />;

  if (state === 'error') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6" style={{ backgroundColor: bgColor, color: txtColor }}>
        <div className="text-center max-w-[280px]">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm opacity-60 mb-4">{errorMsg}</p>
          <button onClick={() => window.Telegram?.WebApp?.close()} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 active:bg-white/20">Close</button>
        </div>
      </div>
    );
  }

  // Screen animation class
  const animClass = slideDir === 'left' ? 'mini-slide-enter-left' : slideDir === 'right' ? 'mini-slide-enter-right' : '';

  return (
    <ToastProvider>
      <BackHandlerProvider value={{ setBackHandler }}>
        <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ backgroundColor: bgColor, color: txtColor }}>
          <div
            ref={screenRef}
            className="flex-1 flex flex-col overflow-hidden"
            style={slideDir ? { animation: `mini-slide-${slideDir} 200ms ease-out` } : undefined}
            key={currentScreen} // re-mount for animation
          >
            {currentScreen === 'home' && <HomeScreen onNavigate={pushScreen} />}
            {currentScreen === 'files' && <FilesScreen />}
            {currentScreen === 'calendar' && <CalendarScreen />}
            {currentScreen === 'settings' && <SettingsScreen />}
            {currentScreen === 'email' && <EmailScreen />}

            {currentScreen === 'app-registry' && <AppStoreScreen />}
            {currentScreen === 'memory' && <MemoryScreen />}
            {currentScreen === 'access-control' && <AccessControlScreen />}
            {currentScreen === 'audit-logs' && <AuditLogsScreen />}
          </div>
        </div>
      </BackHandlerProvider>
    </ToastProvider>
  );
}

function NotLinkedScreen({ bgColor, textColor }: { bgColor: string; textColor: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-6" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className="text-center max-w-[300px]">
        <div className="text-4xl mb-4">🔗</div>
        <h2 className="text-lg font-semibold mb-2">Not Linked Yet</h2>
        <p className="text-sm opacity-60 leading-relaxed mb-6">Link your account on desktop to use Construct from Telegram.</p>
        <div className="space-y-3 text-left rounded-xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          {['Open construct.computer on desktop', 'Go to Settings → Connections', 'Click "Connect Telegram"', 'Confirm with your Telegram account'].map((text, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>{i + 1}</span>
              <span className="text-sm leading-snug opacity-80">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
