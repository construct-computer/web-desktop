import { useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/constants';

// Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name: string; username?: string };
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
        };
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
          section_bg_color?: string;
          section_separator_color?: string;
        };
        colorScheme: 'light' | 'dark';
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
      };
    };
  }
}

interface DashboardData {
  status: { state: string; agent_name?: string; connections?: number } | null;
  tasks: { id: string; title?: string; description?: string; status: string }[];
  usage: {
    requestCount: number;
    promptTokens: number;
    completionTokens: number;
    percentUsed: number;
    resetsIn: string;
    environment?: string;
  } | null;
  events: { id: string; summary: string; start: string; allDay?: boolean }[];
  user: { displayName?: string; email?: string; username?: string } | null;
}

async function apiFetch<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function TelegramMiniApp() {
  const [state, setState] = useState<'loading' | 'not_linked' | 'error' | 'ready'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    status: null, tasks: [], usage: null, events: [], user: null,
  });
  const [errorMsg, setErrorMsg] = useState('');

  // Authenticate via Telegram initData
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setErrorMsg('Not running inside Telegram');
      setState('error');
      return;
    }

    tg.ready();
    tg.expand();

    // Apply Telegram theme colors
    const isDark = tg.colorScheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);

    // Check if we're returning from Google OAuth (reverse link flow)
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get('token');
    const linked = urlParams.get('linked');
    if (oauthToken && linked === 'true') {
      // OAuth succeeded and account was linked — authenticate with the token
      setToken(oauthToken);
      setState('ready');
      // Clean up URL
      window.history.replaceState({}, '', '/mini');
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
          if (body.code === 'NOT_LINKED') {
            setState('not_linked');
          } else {
            setErrorMsg(body.error || 'Auth failed');
            setState('error');
          }
          return;
        }
        setToken(body.token);
        setData((d) => ({ ...d, user: body.user }));
        setState('ready');
      })
      .catch(() => {
        setErrorMsg('Network error');
        setState('error');
      });
  }, []);

  // Fetch dashboard data once authenticated
  useEffect(() => {
    if (!token) return;

    const fetchAll = async () => {
      const [statusRes, tasksRes, usageRes, eventsRes] = await Promise.all([
        apiFetch<any>('/agent/status', token),
        apiFetch<any>('/agent/tasks', token),
        apiFetch<any>('/billing/usage/current', token),
        apiFetch<any>(
          `/calendar/agent/events?time_min=${new Date().toISOString()}&time_max=${new Date(Date.now() + 7 * 86_400_000).toISOString()}&max_results=5`,
          token,
        ),
      ]);

      const now = Date.now();
      let resetsIn = '';
      if (usageRes) {
        const windowMs = 6 * 60 * 60 * 1000;
        const windowEnd = usageRes.windowStart + windowMs;
        const mins = Math.max(0, Math.round((windowEnd - now) / 60_000));
        resetsIn = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      }

      // Tasks endpoint returns { tasks: [...] }, events may return { events: [...] } or an array
      const tasksList = Array.isArray(tasksRes) ? tasksRes : (tasksRes?.tasks || []);
      const eventsList = Array.isArray(eventsRes) ? eventsRes : (eventsRes?.events || []);

      setData((d) => ({
        ...d,
        status: statusRes,
        tasks: tasksList,
        usage: usageRes ? {
          requestCount: usageRes.requestCount,
          promptTokens: usageRes.promptTokens,
          completionTokens: usageRes.completionTokens,
          percentUsed: usageRes.percentUsed ?? 0,
          resetsIn,
          environment: usageRes.environment,
        } : null,
        events: eventsList,
      }));
    };

    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  const handleClose = useCallback(() => {
    window.Telegram?.WebApp.close();
  }, []);

  if (state === 'loading') return <LoadingScreen />;
  if (state === 'not_linked') return <NotLinkedScreen />;
  if (state === 'error') return <ErrorScreen message={errorMsg} onClose={handleClose} />;

  return <Dashboard data={data} />;
}

// ── Sub-components ──────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={bgStyle()}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" />
        <p className="text-sm opacity-50">Connecting...</p>
      </div>
    </div>
  );
}

function NotLinkedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={bgStyle()}>
      <div className="text-center max-w-[300px]">
        <div className="text-4xl mb-4">🔗</div>
        <h2 className="text-lg font-semibold mb-2">Not Linked Yet</h2>
        <p className="text-sm opacity-60 leading-relaxed mb-6">
          To use Construct from Telegram, link your account on desktop first.
        </p>

        <div className="space-y-3 text-left" style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '14px 16px',
        }}>
          <Step n={1} text="Open construct.computer on desktop" />
          <Step n={2} text="Go to Settings → Connections" />
          <Step n={3} text='Click "Connect Telegram"' />
          <Step n={4} text="Confirm with your Telegram account" />
        </div>

        <p className="text-xs opacity-40 mt-4">
          Once linked, reopen this dashboard.
        </p>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
        {n}
      </span>
      <span className="text-sm leading-snug opacity-80">{text}</span>
    </div>
  );
}

function ErrorScreen({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={bgStyle()}>
      <div className="text-center max-w-[280px]">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
        <p className="text-sm opacity-60 mb-4">{message}</p>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 active:bg-white/20">
          Close
        </button>
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: DashboardData }) {
  const statusIcon = data.status?.state === 'thinking' ? '🔄' : '💤';
  const statusText = data.status?.state === 'thinking' ? 'Thinking...' : 'Idle';
  const agentName = data.status?.agent_name || data.user?.displayName || 'Your Agent';

  const statusIcons: Record<string, string> = {
    pending: '⏳', in_progress: '🔧', blocked: '🚫', completed: '✅', cancelled: '❌',
  };

  const isStaging = data.usage?.environment === 'staging';
  const totalTokens = data.usage
    ? (data.usage.promptTokens + data.usage.completionTokens).toLocaleString()
    : '0';

  return (
    <div className="min-h-screen pb-6" style={bgStyle()}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-semibold">{agentName}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-base">{statusIcon}</span>
          <span className="text-sm opacity-60">{statusText}</span>
          {data.status?.connections ? (
            <span className="text-xs opacity-40 ml-auto">
              {data.status.connections} session{data.status.connections !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* Usage card */}
      <Card title="Usage" icon="📊">
        {(() => {
          const pct = data.usage?.percentUsed ?? 0;
          const barColor = pct >= 100 ? '#f87171' : pct >= 85 ? '#fbbf24' : pct >= 60 ? '#fbbf24' : '#22d3ee';
          const isLimited = pct >= 100;
          return (
            <>
              <div className={`grid gap-3 ${isStaging ? 'grid-cols-3' : 'grid-cols-1'}`}>
                {isStaging && (
                  <>
                    <Stat label="Requests" value={String(data.usage?.requestCount ?? 0)} />
                    <Stat label="Tokens" value={totalTokens} />
                  </>
                )}
                <Stat label="Resets in" value={data.usage?.resetsIn ?? '—'} />
              </div>
              {/* Usage progress bar */}
              <div className="mt-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs opacity-50">{isLimited ? 'Lite mode' : 'Limit'}</span>
                  <span className="text-xs font-medium" style={{ color: barColor }}>
                    {Math.min(pct, 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(1, Math.min(100, pct))}%`, backgroundColor: barColor }}
                  />
                </div>
                {isLimited && (
                  <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>
                    Using a lighter model until reset
                  </p>
                )}
              </div>
            </>
          );
        })()}
      </Card>

      {/* Tasks card */}
      <Card title="Active Tasks" icon="📋" empty={data.tasks.length === 0 ? 'No active tasks' : undefined}>
        {data.tasks.slice(0, 8).map((t) => (
          <div key={t.id} className="flex items-start gap-2 py-1.5">
            <span className="text-sm flex-shrink-0">{statusIcons[t.status] || '•'}</span>
            <span className="text-sm leading-snug">
              {t.title || t.description?.slice(0, 60) || 'Untitled'}
            </span>
          </div>
        ))}
        {data.tasks.length > 8 && (
          <p className="text-xs opacity-40 mt-1">+{data.tasks.length - 8} more</p>
        )}
      </Card>

      {/* Upcoming events card */}
      <Card title="Upcoming" icon="📅" empty={data.events.length === 0 ? 'No upcoming events' : undefined}>
        {data.events.slice(0, 5).map((ev) => {
          const when = ev.allDay
            ? new Date(ev.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : new Date(ev.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          return (
            <div key={ev.id} className="py-1.5">
              <p className="text-sm font-medium">{ev.summary}</p>
              <p className="text-xs opacity-50">{when}</p>
            </div>
          );
        })}
      </Card>

      {/* Account */}
      {data.user && (
        <Card title="Account" icon="👤">
          <div className="space-y-1">
            {data.user.email && <InfoRow label="Email" value={data.user.email} />}
            {data.user.username && <InfoRow label="Username" value={data.user.username} />}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Primitives ──────────────────────────────────────────────────────

function Card({ title, icon, children, empty }: {
  title: string; icon: string; children?: React.ReactNode; empty?: string;
}) {
  return (
    <div className="mx-4 mb-3 rounded-xl p-3" style={cardStyle()}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-50">{title}</h3>
      </div>
      {empty ? <p className="text-sm opacity-40">{empty}</p> : children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs opacity-50">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="opacity-50">{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ── Style helpers (use Telegram theme params when available) ─────────

function bgStyle(): React.CSSProperties {
  const tp = window.Telegram?.WebApp?.themeParams;
  return {
    backgroundColor: tp?.bg_color || 'var(--color-bg)',
    color: tp?.text_color || 'var(--color-text)',
    minHeight: '100vh',
  };
}

function cardStyle(): React.CSSProperties {
  const tp = window.Telegram?.WebApp?.themeParams;
  return {
    backgroundColor: tp?.section_bg_color || tp?.secondary_bg_color || 'rgba(255,255,255,0.06)',
  };
}
