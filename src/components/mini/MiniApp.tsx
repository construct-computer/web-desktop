/**
 * MiniApp — Telegram Mini App entry point.
 *
 * Thin Telegram-specific wrapper around the mobile-optimized Desktop:
 * - Telegram init (ready, expand, theme)
 * - initData HMAC authentication
 * - Telegram linking flows (Google OAuth, email)
 * - Delegates all UI to Desktop so Telegram keeps the same iPhone-like mobile OS
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { agentWS } from '@/services/websocket';
import { STORAGE_KEYS, API_BASE_URL } from '@/lib/constants';
import * as api from '@/services/api';
import { bg, textColor } from './ui';
import { applyTelegramTheme } from '../mobile/platform';
import { Desktop } from '@/components/desktop';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Loader2, Mail, CheckCircle } from 'lucide-react';

/** SessionStorage key for persisting initData across OAuth redirects. */
const TG_INIT_DATA_KEY = 'construct:tg_init_data';

type AppState = 'loading' | 'not_linked' | 'error' | 'ready';

export function MiniApp() {
  // ── Browser fallback: /mini opened in a regular browser after OAuth ──
  // Show a "Return to Telegram" page instead of the "Not running inside Telegram" error.
  if (!window.Telegram?.WebApp) {
    const params = new URLSearchParams(window.location.search);
    if (params.has('token') || params.has('linked') || params.has('auth_error')) {
      return <OAuthBrowserReturnScreen />;
    }
  }

  const [state, setState] = useState<AppState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const { isConnected, forceReconnect } = useWebSocket();

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.token);
    api.setToken('');
    setState('not_linked');
  }, []);

  // ── 1. Telegram init + theme ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setErrorMsg('Not running inside Telegram');
      setState('error');
      return;
    }
    tg.ready?.();
    tg.expand?.();
    applyTelegramTheme();
  }, []);

  // ── 2. Authentication ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('token');

    // ── OAuth return: user signed in via Google and was redirected back ──
    if (oauthToken) {
      localStorage.setItem(STORAGE_KEYS.token, oauthToken);
      window.history.replaceState({}, '', '/mini');

      // If backend already linked telegram (linked=true), go straight to init
      if (params.get('linked') === 'true') {
        initializeApp(oauthToken);
        return;
      }

      // Otherwise, link telegram now using stored initData
      const storedInitData = sessionStorage.getItem(TG_INIT_DATA_KEY) || tg.initData;
      sessionStorage.removeItem(TG_INIT_DATA_KEY);
      if (storedInitData) {
        linkTelegramAndInit(oauthToken, storedInitData);
      } else {
        // No initData available — initialize anyway (user is authenticated)
        initializeApp(oauthToken);
      }
      return;
    }

    // ── Check for OAuth error return ──
    const authError = params.get('auth_error');
    if (authError) {
      window.history.replaceState({}, '', '/mini');
      setErrorMsg(authError === 'missing_code' ? 'Google sign-in was cancelled.' : `Sign-in failed (${authError})`);
      setState('not_linked'); // Let user try again from the login screen
      return;
    }

    // ── Normal flow: authenticate via Telegram initData ──
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

  // ── Link Telegram + initialize (called after OAuth or email auth) ──
  const linkTelegramAndInit = useCallback(async (token: string, initData: string) => {
    try {
      api.setToken(token);
      await api.linkTelegramMiniApp(initData);
    } catch {
      // Link failed — proceed anyway; user is authenticated and can link later
    }
    initializeApp(token);
  }, []);

  // Called by NotLinkedScreen after user authenticates via email
  const handleLinked = useCallback((token: string) => {
    localStorage.setItem(STORAGE_KEYS.token, token);
    initializeApp(token);
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

      useAuthStore.setState({ user: meData.user, isAuthenticated: true });
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

  if (state === 'not_linked') return <NotLinkedScreen bgColor={bgColor} textColor={txtColor} onLinked={handleLinked} />;

  if (state === 'error') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6" style={{ backgroundColor: bgColor, color: txtColor }}>
        <div className="text-center max-w-[280px]">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm opacity-60 mb-4">{errorMsg}</p>
          <button onClick={() => window.Telegram?.WebApp?.close?.()} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 active:bg-white/20">Close</button>
        </div>
      </div>
    );
  }

  return (
    <Desktop
      onLogout={handleLogout}
      onLockScreen={() => {}}
      onReconnect={forceReconnect}
      isConnected={isConnected}
    />
  );
}

type NotLinkedMode = 'choose' | 'email' | 'otp' | 'linking' | 'waiting_google';

function NotLinkedScreen({ bgColor, textColor, onLinked }: {
  bgColor: string;
  textColor: string;
  onLinked: (token: string) => void;
}) {
  const [mode, setMode] = useState<NotLinkedMode>('choose');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const visibilityCleanupRef = useRef<(() => void) | null>(null);

  // Clean up visibility listener on unmount
  useEffect(() => {
    return () => { visibilityCleanupRef.current?.(); };
  }, []);

  // Poll /telegram/mini-auth while waiting for Google sign-in to complete
  const startPolling = useCallback(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;

    // Clear any existing polling
    if (pollingRef.current) clearInterval(pollingRef.current);
    visibilityCleanupRef.current?.();

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/telegram/mini-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        const body = await res.json();
        if (res.ok && body.token) {
          // Linked! Stop polling and proceed
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          visibilityCleanupRef.current?.();
          localStorage.setItem(STORAGE_KEYS.token, body.token);
          onLinked(body.token);
        }
      } catch { /* network error, keep polling */ }
    };

    // Poll every 3 seconds
    pollingRef.current = setInterval(poll, 3000);

    // Also poll immediately when the mini app becomes visible again (user returns from browser)
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    visibilityCleanupRef.current = () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onLinked]);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setError('No Telegram auth data');
      setLoading(false);
      return;
    }

    // Call unauthenticated mini-link to get Google OAuth URL with tglink: state
    try {
      const res = await fetch(`${API_BASE_URL}/telegram/mini-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });

      let body: any;
      try {
        body = await res.json();
      } catch {
        setError(`Server error (${res.status})`);
        setLoading(false);
        return;
      }

      if (!res.ok || !body.authUrl) {
        setError(body.error || 'Failed to start sign-in');
        setLoading(false);
        return;
      }

      // Open Google OAuth in the system browser (not the Telegram WebView)
      const tg = window.Telegram?.WebApp as any;
      if (tg?.openLink) {
        tg.openLink(body.authUrl);
      } else {
        window.open(body.authUrl, '_blank');
      }

      // Switch to waiting mode and start polling for link completion
      setLoading(false);
      setMode('waiting_google');
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setLoading(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setLoading(true);
    const result = await api.sendMagicLink(email.trim());
    setLoading(false);
    if (result.success) {
      setMode('otp');
    } else {
      setError(result.error || 'Failed to send code');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) return;
    setError('');
    setLoading(true);
    const result = await api.verifyOtp(email.trim(), otp.trim());
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Invalid code');
      return;
    }

    // Authenticated — now link Telegram
    const token = result.data.token;
    setMode('linking');
    api.setToken(token);
    localStorage.setItem(STORAGE_KEYS.token, token);

    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      try {
        await api.linkTelegramMiniApp(initData);
      } catch {
        // Link failed — proceed anyway; user can link later from settings
      }
    }
    onLinked(token);
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: textColor,
    borderColor: 'rgba(255,255,255,0.12)',
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-6" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className="w-full max-w-[300px]">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold mb-2">Welcome to Construct</h2>
          <p className="text-sm opacity-50 leading-relaxed">
            {mode === 'choose' && 'Sign in to connect your Telegram.'}
            {mode === 'email' && 'Enter your email to get a sign-in code.'}
            {mode === 'otp' && 'Enter the 6-digit code from your email.'}
            {mode === 'linking' && 'Linking your Telegram account...'}
            {mode === 'waiting_google' && 'Complete sign-in in your browser.'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2.5 rounded-xl text-center text-sm font-medium"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            {error}
          </div>
        )}

        {/* ── Choose method ── */}
        {mode === 'choose' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 text-[14px] font-medium rounded-xl transition-all active:scale-[0.98]"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: textColor, border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
            <button
              onClick={() => { setError(''); setMode('email'); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-medium rounded-xl transition-all active:scale-[0.98]"
              style={{ color: textColor, opacity: 0.6 }}
            >
              <Mail size={16} />
              Sign in with Email
            </button>
          </div>
        )}

        {/* ── Email input ── */}
        {mode === 'email' && (
          <form onSubmit={handleSendMagicLink} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
              className="w-full py-3 px-4 text-[14px] rounded-xl border outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-3 text-[14px] font-semibold rounded-xl disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ backgroundColor: 'var(--tg-button, #007AFF)', color: '#fff' }}
            >
              {loading ? 'Sending...' : 'Send Code'}
            </button>
            <button type="button" onClick={() => { setError(''); setMode('choose'); }}
              className="text-xs font-medium opacity-40 mt-1 self-center">
              Back
            </button>
          </form>
        )}

        {/* ── OTP verification ── */}
        {mode === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 mb-2 opacity-60">
              <CheckCircle size={16} />
              <span className="text-xs">Code sent to <strong className="opacity-90">{email}</strong></span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="w-[180px] py-3 text-center text-[22px] font-bold tracking-[8px] rounded-xl border outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full py-3 text-[14px] font-semibold rounded-xl disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ backgroundColor: 'var(--tg-button, #007AFF)', color: '#fff' }}
            >
              {loading ? 'Verifying...' : 'Continue'}
            </button>
            <button type="button" onClick={() => { setError(''); setOtp(''); setMode('email'); }}
              className="text-xs font-medium opacity-40 mt-1">
              Use a different email
            </button>
          </form>
        )}

        {/* ── Waiting for Google sign-in in external browser ── */}
        {mode === 'waiting_google' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={28} className="animate-spin opacity-50" />
            <p className="text-sm opacity-60 text-center leading-relaxed">
              Sign in with Google in your browser,<br />then return here.
            </p>
            <button
              onClick={() => {
                if (pollingRef.current) clearInterval(pollingRef.current);
                pollingRef.current = null;
                visibilityCleanupRef.current?.();
                setMode('choose');
              }}
              className="text-xs font-medium opacity-40 mt-2"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Linking state ── */}
        {mode === 'linking' && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin opacity-50" />
            <p className="text-sm opacity-50">Setting up your account...</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * OAuthBrowserReturnScreen — shown when /mini loads in a regular browser
 * after the Google OAuth redirect. The user completed sign-in and the
 * backend redirected to /mini?token=...&linked=true. Since this isn't
 * inside Telegram, we just show a friendly "go back to Telegram" message.
 */
function OAuthBrowserReturnScreen() {
  const params = new URLSearchParams(window.location.search);
  const hasError = params.has('auth_error');

  return (
    <div className="fixed inset-0 flex items-center justify-center p-6 bg-[#1c1c1e] text-white">
      <div className="text-center max-w-[300px]">
        {hasError ? (
          <>
            <div className="text-4xl mb-4">&#x26A0;&#xFE0F;</div>
            <h2 className="text-lg font-semibold mb-2">Sign-in failed</h2>
            <p className="text-sm opacity-60 leading-relaxed">
              Something went wrong during authentication. Please go back to Telegram and try again.
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">&#x2705;</div>
            <h2 className="text-lg font-semibold mb-2">You're all set!</h2>
            <p className="text-sm opacity-60 leading-relaxed">
              Your account has been linked. You can close this tab and return to Telegram.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
