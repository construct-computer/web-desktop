import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

/**
 * /link?code=ABC123 — Approve a device code to link the NotchConstruct macOS app.
 * User must already be logged into the webapp.
 */
export function DeviceLinkPage() {
  const { isAuthenticated, user, checkAuth } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'approving' | 'approved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [approvedUser, setApprovedUser] = useState('');

  // Extract code from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) setCode(urlCode.toUpperCase());
  }, []);

  // Check auth on mount
  useEffect(() => {
    checkAuth().then(() => setAuthChecked(true));
  }, [checkAuth]);

  const handleApprove = async () => {
    if (!code.trim()) return;
    setStatus('approving');
    setErrorMsg('');

    try {
      const token = localStorage.getItem(STORAGE_KEYS.token);
      const res = await fetch(`${API_BASE_URL}/auth/device-code/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json() as { status?: string; user?: string; error?: string };

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || `Failed (${res.status})`);
        return;
      }

      setStatus('approved');
      setApprovedUser(data.user || user?.username || '');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    }
  };

  // Loading
  if (!authChecked) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white/40 text-sm">Checking authentication...</div>
      </div>
    );
  }

  // Not logged in
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-white text-lg font-semibold">Sign in Required</h1>
          <p className="text-white/50 text-sm">
            You need to be logged into Construct to link your desktop app.
          </p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-white text-sm transition-colors"
          >
            Go to Construct
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="max-w-md w-full mx-4 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-3xl">🖥️</div>
          <h1 className="text-white text-xl font-semibold">Link Desktop App</h1>
          <p className="text-white/50 text-sm">
            Enter the code shown in NotchConstruct to sign in.
          </p>
        </div>

        {status === 'approved' ? (
          /* Success */
          <div className="text-center space-y-4 py-8">
            <div className="text-5xl">✓</div>
            <div>
              <p className="text-green-400 text-lg font-medium">Device Linked!</p>
              <p className="text-white/50 text-sm mt-1">
                Signed in as <span className="text-white/80 font-medium">@{approvedUser}</span>
              </p>
            </div>
            <p className="text-white/30 text-xs">You can close this tab.</p>
          </div>
        ) : (
          /* Code input */
          <div className="space-y-4">
            <div className="flex justify-center">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                className="w-48 text-center text-2xl font-mono tracking-[0.3em] bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleApprove()}
              />
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleApprove}
                disabled={!code.trim() || status === 'approving'}
                className="px-8 py-2.5 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 rounded-lg text-white text-sm font-medium transition-colors"
              >
                {status === 'approving' ? 'Linking...' : 'Approve'}
              </button>
            </div>

            {status === 'error' && (
              <p className="text-red-400 text-sm text-center">{errorMsg}</p>
            )}

            <p className="text-white/30 text-xs text-center">
              Logged in as <span className="text-white/50">@{user?.username}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
