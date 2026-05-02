import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Database,
  Eye,
  Gauge,
  KeyRound,
  Layers3,
  Link as LinkIcon,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { adminApi, AdminApiError, rangeQuery, type TimeRangeValue } from '@/services/adminApi';

type TabId = 'overview' | 'usage' | 'users' | 'errors' | 'activity' | 'integrations' | 'analytics' | 'health';

type DashboardData = {
  overview?: any;
  usageSeries?: any;
  usageByModel?: any;
  usageByService?: any;
  usageByAction?: any;
  usageByPlan?: any;
  usageByBilledTo?: any;
  users?: any;
  errors?: any;
  activity?: any;
  activitySummary?: any;
  reliability?: any;
  integrations?: any;
  appCalls?: any;
  browserResources?: any;
  approvals?: any;
  funnel?: any;
  features?: any;
  retention?: any;
  health?: any;
  config?: any;
  securityEvents?: any;
};

type DrawerState = {
  title: string;
  eyebrow?: string;
  data: unknown;
} | null;

type AdminUserOverrides = {
  usage: {
    monthlyCapUsd: number | null;
    weeklyCapUsd: number | null;
    sessionCapUsd: number | null;
  };
  platformModelChoice: {
    enabled: boolean;
    selectedModel: string | null;
  };
};

type AdminPlatformModelOption = {
  id: string;
  label: string;
  provider: string;
  pricing?: {
    input: number | null;
    output: number | null;
    cache: number | null;
  };
};

type AdminUserOverridesResponse = {
  ok: boolean;
  userId: string;
  email: string;
  overrides: AdminUserOverrides;
  platformModelOptions: AdminPlatformModelOption[];
};

const tabs: Array<{ id: TabId; label: string; icon: typeof Gauge }> = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'usage', label: 'LLM', icon: Bot },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
  { id: 'activity', label: 'Logs', icon: Activity },
  { id: 'integrations', label: 'Integrations', icon: Workflow },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'health', label: 'Health', icon: ShieldCheck },
];

const rangeOptions = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const palette = ['#ffffff', '#e5e5e5', '#cccccc', '#999999', '#666666', '#333333'];

function formatNumber(value: unknown): string {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatCost(value: unknown): string {
  const n = Number(value || 0);
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatModelPrice(value: number | null | undefined): string {
  if (value == null) return 'n/a';
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function adminModelPricingText(option: AdminPlatformModelOption | undefined): string {
  const pricing = option?.pricing;
  if (!pricing) return 'Input n/a / Output n/a / Cache n/a per 1M tokens';
  return `Input ${formatModelPrice(pricing.input)} / Output ${formatModelPrice(pricing.output)} / Cache ${formatModelPrice(pricing.cache)} per 1M tokens`;
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const numeric = typeof value === 'number' || /^\d+$/.test(String(value));
  const date = new Date(numeric ? Number(value) : String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function deltaLabel(card: any): string {
  const percent = card?.delta?.percent;
  if (percent === null || percent === undefined) return 'new activity';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}% vs previous`;
}

function truncate(value: unknown, length = 56): string {
  const text = String(value || '-');
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

async function copyText(value: unknown): Promise<void> {
  try {
    await navigator.clipboard.writeText(String(value || ''));
  } catch {
    // Clipboard can be unavailable on older mobile browsers.
  }
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-white/10 bg-black',
        className,
      )}
    >
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon: typeof Gauge;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group text-left rounded-[26px] border border-white/10 bg-black p-4 transition-all duration-200',
        'hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/20',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">{label}</div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-white/70">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{value}</div>
      {detail && <div className="mt-1 text-[11px] text-white/50">{detail}</div>}
    </button>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-white/45">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ label = 'No data yet' }: { label?: string }) {
  return (
    <div className="flex min-h-[140px] items-center justify-center rounded-3xl border border-dashed border-white/10 text-sm text-white/35">
      {label}
    </div>
  );
}

function DataTable({
  columns,
  rows,
  onRow,
}: {
  columns: Array<{ key: string; label: string; render?: (row: any) => ReactNode; className?: string }>;
  rows: any[];
  onRow?: (row: any) => void;
}) {
  if (!rows?.length) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-xs">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={cn('border-b border-white/10 px-3 py-3 font-medium uppercase tracking-[0.16em] text-white/35', column.className)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.id || `${idx}-${JSON.stringify(row).slice(0, 20)}`}
              onClick={() => onRow?.(row)}
              className={cn('group', onRow && 'cursor-pointer')}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn('border-b border-white/5.5 px-3 py-3 text-white/68 group-hover:bg-white/4.5', column.className)}>
                  {column.render ? column.render(row) : row[column.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ value }: { value: unknown }) {
  const text = String(value || 'unknown');
  return (
    <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
      {text}
    </span>
  );
}

function ChartFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">{title}</div>
      </div>
      <div className="h-[240px]">{children}</div>
    </Card>
  );
}

function LoginPanel({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await adminApi.login(password);
      if (session.authenticated) onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-5 text-white">
      <Card className="relative z-10 w-full max-w-md p-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-2xl border border-white/20 bg-white/5 p-3 text-white/70">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.04em]">Construct Ops</h1>
            <p className="text-xs text-white/45">Read-only production dashboard</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-white/40">
              Admin password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              className="h-11 rounded-2xl border-white/10 bg-black/30 text-white"
              placeholder="Enter password"
            />
          </div>
          {error && <div className="rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/90">{error}</div>}
          <Button type="submit" disabled={loading || !password} className="h-11 w-full rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/20">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Sign in
          </Button>
        </form>
        <p className="mt-5 text-[11px] leading-relaxed text-white/35">
          The password is exchanged for an HttpOnly session cookie. It is not stored in browser storage or placed in URLs.
        </p>
      </Card>
    </div>
  );
}

function AdminConfigPage({ onLogout }: { onLogout: () => void }) {
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState<AdminUserOverridesResponse | null>(null);
  const [options, setOptions] = useState<AdminPlatformModelOption[]>([]);
  const [monthlyCap, setMonthlyCap] = useState('');
  const [weeklyCap, setWeeklyCap] = useState('');
  const [sessionCap, setSessionCap] = useState('');
  const [modelChoiceEnabled, setModelChoiceEnabled] = useState(false);
  const [selectedModel, setSelectedModel] = useState('__default__');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function fillForm(data: AdminUserOverridesResponse) {
    const usage = data.overrides.usage;
    setMonthlyCap(usage.monthlyCapUsd == null ? '' : String(usage.monthlyCapUsd));
    setWeeklyCap(usage.weeklyCapUsd == null ? '' : String(usage.weeklyCapUsd));
    setSessionCap(usage.sessionCapUsd == null ? '' : String(usage.sessionCapUsd));
    setModelChoiceEnabled(data.overrides.platformModelChoice.enabled);
    setSelectedModel(data.overrides.platformModelChoice.selectedModel || '__default__');
    setOptions(data.platformModelOptions || []);
  }

  function capValue(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Usage limits must be non-negative dollar values, or blank to clear.');
    }
    return parsed;
  }

  async function loadUser(event?: React.FormEvent) {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await adminApi.get<AdminUserOverridesResponse>(`/config/user-overrides?email=${encodeURIComponent(normalizedEmail)}`);
      setLoaded(data);
      fillForm(data);
      setEmail(data.email);
    } catch (err) {
      setLoaded(null);
      setError(err instanceof Error ? err.message : 'Unable to load user config');
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await adminApi.post<AdminUserOverridesResponse>('/config/user-overrides', {
        email: normalizedEmail,
        usage: {
          monthlyCapUsd: capValue(monthlyCap),
          weeklyCapUsd: capValue(weeklyCap),
          sessionCapUsd: capValue(sessionCap),
        },
        platformModelChoice: {
          enabled: modelChoiceEnabled,
          selectedModel: selectedModel === '__default__' ? null : selectedModel,
        },
      });
      setLoaded(data);
      fillForm(data);
      setEmail(data.email);
      setMessage(`Saved config for ${data.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user config');
    } finally {
      setSaving(false);
    }
  }

  function calculateFromMonthlyCap() {
    setError(null);
    try {
      const monthly = capValue(monthlyCap);
      if (!monthly || monthly <= 0) {
        setError('Enter a monthly cap first.');
        return;
      }
      const now = new Date();
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
      const monthHours = (nextMonthStart - monthStart) / 3_600_000;
      const weeks = monthHours / (24 * 7);
      const sessionWindows = monthHours / 4;
      const roundUsd = (value: number) => String(Math.max(0.01, Math.round(value * 100) / 100));
      setWeeklyCap(roundUsd(monthly / weeks));
      setSessionCap(roundUsd(monthly / sessionWindows));
      setMessage('Calculated weekly and session caps from monthly usage.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to calculate limits');
    }
  }

  const capFields: Array<{
    label: string;
    value: string;
    setter: (next: string) => void;
    placeholder: string;
  }> = [
    { label: 'Monthly cap USD', value: monthlyCap, setter: setMonthlyCap, placeholder: '500' },
    { label: 'Weekly cap USD', value: weeklyCap, setter: setWeeklyCap, placeholder: '125' },
    { label: 'Session cap USD', value: sessionCap, setter: setSessionCap, placeholder: '2.75' },
  ];

  return (
    <div className="min-h-screen overflow-y-auto bg-black px-5 py-6 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50">
              <KeyRound className="h-3.5 w-3.5" />
              Admin Config
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">User LLM Config</h1>
            <p className="mt-1 text-xs text-white/42">
              Write-only controls for usage caps and platform model selection access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { window.location.href = '/admin'; }} className="h-9 rounded-2xl border-white/10 bg-white/6 text-white">
              Dashboard
            </Button>
            <Button onClick={onLogout} className="h-9 rounded-2xl border-white/10 bg-white/6 text-white">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </header>

        <Card className="p-5">
          <form onSubmit={loadUser} className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-white/40">User email</label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@example.com"
                className="h-11 rounded-2xl border-white/10 bg-black/25 text-white"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading || !email.trim()} className="h-11 rounded-2xl border-white/10 bg-white/10 text-white">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Load
              </Button>
            </div>
          </form>
        </Card>

        <form onSubmit={saveConfig} className="space-y-5">
          <Card className="p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Usage Limits</h2>
              <p className="mt-1 text-xs text-white/42">
                Only three LLM caps are enforced: monthly, weekly, and session usage. Blank fields clear the override and fall back to plan defaults where available.
              </p>
            </div>
            <div className="mb-4">
              <Button type="button" onClick={calculateFromMonthlyCap} className="h-9 rounded-2xl border-white/10 bg-white/8 text-white">
                Calculate weekly + session from monthly
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {capFields.map(({ label, value, setter, placeholder }) => (
                <label key={label} className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-white/40">{label}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                    placeholder={placeholder}
                    className="h-10 rounded-2xl border-white/10 bg-black/25 text-white"
                  />
                </label>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Model Selection Access</h2>
              <p className="mt-1 text-xs text-white/42">
                Enables the user's Developer settings model picker. OpenRouter models are excluded from this platform list.
              </p>
            </div>
            <label className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Allow platform model selection</span>
                <span className="block text-xs text-white/40">User can choose their primary platform agent model.</span>
              </span>
              <input
                type="checkbox"
                checked={modelChoiceEnabled}
                onChange={(event) => setModelChoiceEnabled(event.target.checked)}
                className="h-5 w-5 accent-white"
              />
            </label>
            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={!modelChoiceEnabled || options.length === 0}
              searchable
              options={[
                { value: '__default__', label: 'Default platform model', description: 'Use the platform default for this plan.' },
                ...options.map((option) => ({
                  value: option.id,
                  label: option.label,
                  description: `${option.provider} • ${option.id} • ${adminModelPricingText(option)}`,
                })),
              ]}
            />
          </Card>

          {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</Card>}
          {message && <Card className="border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</Card>}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/40">
              {loaded ? `Loaded ${loaded.email} (${loaded.userId})` : 'Load a user before saving config.'}
            </div>
            <Button type="submit" disabled={saving || !email.trim()} className="h-11 rounded-2xl border-white/20 bg-white text-black hover:bg-white/90">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save config
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [path, setPath] = useState(() => window.location.pathname);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [range, setRange] = useState<TimeRangeValue>('24h');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const isConfigPage = path === '/admin/config';

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);

  useEffect(() => {
    adminApi.session()
      .then((session) => setAuthenticated(session.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingSession(false));
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!authenticated || isConfigPage) return;
    setLoading(true);
    setLoadErrors([]);
    const q = rangeQuery(range);
    const userQuery = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : '';

    async function safe<T>(key: keyof DashboardData, path: string, next: Partial<DashboardData>, errors: string[]) {
      try {
        next[key] = await adminApi.get<T>(path) as any;
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) {
          setAuthenticated(false);
          throw err;
        }
        errors.push(`${String(key)}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    const next: DashboardData = {};
    const errors: string[] = [];
    try {
      await Promise.all([
        safe('overview', `/overview?${q}`, next, errors),
        safe('usageSeries', `/usage/series?${q}&groupBy=none`, next, errors),
        safe('usageByModel', `/usage/summary?${q}&groupBy=model`, next, errors),
        safe('usageByService', `/usage/summary?${q}&groupBy=service`, next, errors),
        safe('usageByAction', `/usage/summary?${q}&groupBy=action`, next, errors),
        safe('usageByPlan', `/usage/summary?${q}&groupBy=plan`, next, errors),
        safe('usageByBilledTo', `/usage/summary?${q}&groupBy=billed_to`, next, errors),
        safe('users', `/users?${q}&limit=80${userQuery}`, next, errors),
        safe('errors', `/errors?${q}&limit=80`, next, errors),
        safe('activity', `/activity?${q}&limit=80`, next, errors),
        safe('activitySummary', `/activity/summary?${q}&groupBy=category`, next, errors),
        safe('reliability', '/structured-reliability', next, errors),
        safe('integrations', `/integrations/summary?${q}`, next, errors),
        safe('appCalls', `/apps/tool-calls?${q}&limit=80`, next, errors),
        safe('browserResources', '/browser/resources?limit=80', next, errors),
        safe('approvals', '/approvals?limit=80&status=pending', next, errors),
        safe('funnel', `/analytics/funnel?${q}`, next, errors),
        safe('features', `/analytics/features?${q}`, next, errors),
        safe('retention', '/analytics/retention', next, errors),
        safe('health', '/health', next, errors),
        safe('config', '/config/status', next, errors),
        safe('securityEvents', '/security-events?limit=80', next, errors),
      ]);
      setData(next);
      setLoadErrors(errors);
      setLastUpdated(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [authenticated, isConfigPage, query, range]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshNonce]);

  useEffect(() => {
    if (!authenticated || isConfigPage) return;
    const id = window.setInterval(() => setRefreshNonce((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [authenticated, isConfigPage]);

  const planRows = useMemo(() => {
    const plans = data.overview?.plans || {};
    return Object.entries(plans).map(([name, value]) => ({ name, value }));
  }, [data.overview]);

  const usageSeries = data.usageSeries?.rows || data.overview?.series || [];
  const overviewCards = data.overview?.cards || {};

  async function logout() {
    try {
      await adminApi.logout();
    } finally {
      setAuthenticated(false);
      setData({});
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPanel onLogin={() => setAuthenticated(true)} />;
  }

  if (isConfigPage) {
    return <AdminConfigPage onLogout={() => void logout()} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      <div className="relative z-10 flex h-full">
        <aside className="hidden w-[92px] border-r border-white/10 bg-black px-3 py-5 lg:block">
          <div className="mb-8 flex justify-center">
            <div className="rounded-3xl border border-white/20 bg-white/5 p-3 text-white/70">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 rounded-3xl px-2 py-3 text-[10px] transition-colors',
                    activeTab === tab.id ? 'bg-white/12 text-white' : 'text-white/38 hover:bg-white/6 hover:text-white/70',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/10 bg-black px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50">
                  <Smartphone className="h-3.5 w-3.5" />
                  Dashboard
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Construct Admin</h1>
                <p className="mt-1 text-xs text-white/42">
                  Read-only production telemetry, refreshed every minute. Last updated {lastUpdated ? formatDate(lastUpdated) : '-'}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[150px]">
                  <Select value={range} onChange={(value) => setRange(value as TimeRangeValue)} options={rangeOptions} />
                </div>
                <div className="relative min-w-[220px] flex-1 sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search users"
                    className="h-9 rounded-2xl border-white/10 bg-black/25 pl-9 text-white"
                  />
                </div>
                <Button onClick={() => setRefreshNonce((n) => n + 1)} disabled={loading} className="h-9 rounded-2xl border-white/10 bg-white/6 text-white">
                  <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                  Refresh
                </Button>
                <Button onClick={() => { window.location.href = '/admin/config'; }} className="h-9 rounded-2xl border-white/10 bg-white/6 text-white">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Config
                </Button>
                <Button onClick={() => void logout()} className="h-9 rounded-2xl border-white/10 bg-white/6 text-white">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs',
                      activeTab === tab.id ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-white/5 text-white/50',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {loadErrors.length > 0 && (
              <Card className="mb-5 border-white/20 bg-white/5 p-3 text-xs text-white">
                Failed to load some data: {loadErrors.slice(0, 3).join('; ')}
              </Card>
            )}

            {activeTab === 'overview' && (
              <OverviewTab
                cards={overviewCards}
                planRows={planRows}
                series={usageSeries}
                data={data}
                openDrawer={setDrawer}
              />
            )}
            {activeTab === 'usage' && <UsageTab data={data} openDrawer={setDrawer} />}
            {activeTab === 'users' && <UsersTab data={data} openDrawer={setDrawer} />}
            {activeTab === 'errors' && <ErrorsTab data={data} openDrawer={setDrawer} />}
            {activeTab === 'activity' && <ActivityTab data={data} openDrawer={setDrawer} />}
            {activeTab === 'integrations' && <IntegrationsTab data={data} openDrawer={setDrawer} />}
            {activeTab === 'analytics' && <AnalyticsTab data={data} openDrawer={setDrawer} />}
            {activeTab === 'health' && <HealthTab data={data} openDrawer={setDrawer} />}
          </div>
        </main>
      </div>

      <DetailDrawer drawer={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

function OverviewTab({
  cards,
  planRows,
  series,
  data,
  openDrawer,
}: {
  cards: any;
  planRows: Array<{ name: string; value: unknown }>;
  series: any[];
  data: DashboardData;
  openDrawer: (drawer: DrawerState) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Users" value={formatNumber(cards.totalUsers)} detail={`${formatNumber(cards.newUsers?.value)} new - ${deltaLabel(cards.newUsers)}`} icon={Users} onClick={() => openDrawer({ title: 'User overview', data: data.users })} />
        <MetricCard label="Active" value={formatNumber(cards.activeUsers?.value)} detail={deltaLabel(cards.activeUsers)} icon={Activity} />
        <MetricCard label="LLM Cost" value={formatCost(cards.costUsd?.value)} detail={deltaLabel(cards.costUsd)} icon={CircleDollarSign} />
        <MetricCard label="Errors" value={formatNumber(cards.errors?.value)} detail={deltaLabel(cards.errors)} icon={AlertTriangle} onClick={() => openDrawer({ title: 'Recent errors', data: data.errors })} />
        <MetricCard label="Requests" value={formatNumber(cards.requests?.value)} detail={deltaLabel(cards.requests)} icon={Gauge} />
        <MetricCard label="Tokens" value={formatNumber(cards.tokens?.value)} detail={deltaLabel(cards.tokens)} icon={Bot} />
        <MetricCard label="Approvals" value={formatNumber(cards.pendingApprovals)} detail="Pending" icon={Clock3} />
        <MetricCard label="Browsers" value={formatNumber(cards.activeBrowserSessions)} detail="Active" icon={Layers3} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
        <ChartFrame title="Traffic and spend trend">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <CartesianGrid stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fill: 'rgba(255,255,255,.5)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,.5)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#000000', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="cost" stroke="#ffffff" fill="rgba(255,255,255,0.1)" strokeWidth={2} />
              <Line type="monotone" dataKey="requests" stroke="#aaaaaa" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Plan distribution">
          {planRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planRows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={4}>
                  {planRows.map((row, idx) => <Cell key={row.name} fill={palette[idx % palette.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#000000', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartFrame>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Needs Attention" subtitle="Cost spikes, recurring errors, and pending queues" />
          <div className="space-y-2">
            {(data.overview?.attention || []).length ? data.overview.attention.map((item: any, idx: number) => (
              <button key={`${item.kind}-${idx}`} type="button" onClick={() => openDrawer({ title: item.title, eyebrow: item.kind, data: item })} className="flex w-full items-center justify-between rounded-2xl border border-white/[0.07] bg-black/18 px-3 py-3 text-left hover:bg-white/5.5">
                <div>
                  <div className="text-sm text-white">{item.title}</div>
                  <div className="text-xs text-white/42">{item.detail}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/30" />
              </button>
            )) : <EmptyState label="No attention items in this range" />}
          </div>
        </Card>
        <Card className="p-4">
          <SectionHeader title="Latest Production Events" subtitle="Recent audit events and errors" />
          <div className="space-y-2">
            {(data.overview?.latestActivity || []).slice(0, 7).map((item: any) => (
              <button key={item.id} type="button" onClick={() => openDrawer({ title: item.action || item.category, eyebrow: 'activity', data: item })} className="flex w-full gap-3 rounded-2xl border border-white/[0.07] bg-black/18 px-3 py-3 text-left hover:bg-white/5.5">
                <StatusPill value={item.result} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white/80">{item.summary || item.action}</div>
                  <div className="text-xs text-white/35">{formatDate(item.timestamp)} - {item.category}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function UsageTab({ data, openDrawer }: { data: DashboardData; openDrawer: (drawer: DrawerState) => void }) {
  const models = data.usageByModel?.rows || [];
  const services = data.usageByService?.rows || [];
  const actions = data.usageByAction?.rows || [];
  const billed = data.usageByBilledTo?.rows || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartFrame title="Model cost comparison">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={models.slice(0, 12)}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="key" tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14 }} />
              <Bar dataKey="cost" radius={[8, 8, 0, 0]} fill="#ffffff" />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title="Requests by service">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={services.slice(0, 12)}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="key" tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14 }} />
              <Bar dataKey="requests" radius={[8, 8, 0, 0]} fill="#cccccc" />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
      <Card className="p-4">
        <SectionHeader title="Model Leaderboard" subtitle="Cost, token, request, and BYOK/platform split" />
        <DataTable
          rows={models}
          onRow={(row) => openDrawer({ title: row.key, eyebrow: 'model usage', data: row })}
          columns={[
            { key: 'key', label: 'Model', render: (row) => <span className="font-mono text-white/80">{row.key}</span> },
            { key: 'requests', label: 'Requests', render: (row) => formatNumber(row.requests) },
            { key: 'users', label: 'Users', render: (row) => formatNumber(row.users) },
            { key: 'tokens', label: 'Tokens', render: (row) => formatNumber(row.tokens) },
            { key: 'cost', label: 'Cost', render: (row) => formatCost(row.cost) },
            { key: 'avg_cost', label: 'Avg/request', render: (row) => formatCost(row.avg_cost) },
          ]}
        />
      </Card>
      <div className="grid gap-5 xl:grid-cols-3">
        <MiniList title="Services" rows={services} valueKey="requests" openDrawer={openDrawer} />
        <MiniList title="Actions" rows={actions} valueKey="requests" openDrawer={openDrawer} />
        <MiniList title="Billing Source" rows={billed} valueKey="cost" cost openDrawer={openDrawer} />
      </div>
    </div>
  );
}

function MiniList({ title, rows, valueKey, cost, openDrawer }: { title: string; rows: any[]; valueKey: string; cost?: boolean; openDrawer: (drawer: DrawerState) => void }) {
  return (
    <Card className="p-4">
      <SectionHeader title={title} />
      <div className="space-y-2">
        {(rows || []).slice(0, 10).map((row) => (
          <button key={row.key} type="button" onClick={() => openDrawer({ title: row.key, eyebrow: title, data: row })} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/4 px-3 py-2 text-left hover:bg-white/[0.07]">
            <span className="truncate text-xs text-white/70">{row.key}</span>
            <span className="font-mono text-xs text-white">{cost ? formatCost(row[valueKey]) : formatNumber(row[valueKey])}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function UsersTab({ data, openDrawer }: { data: DashboardData; openDrawer: (drawer: DrawerState) => void }) {
  const users = data.users?.users || [];
  return (
    <Card className="p-4">
      <SectionHeader title="Users and Billing" subtitle={`${formatNumber(data.users?.total || users.length)} matching users - read only`} />
      <DataTable
        rows={users}
        onRow={(row) => openDrawer({ title: row.email || row.id, eyebrow: 'user detail', data: row })}
        columns={[
          { key: 'email', label: 'User', render: (row) => <div><div className="font-mono text-white/80">{row.email || '-'}</div><div className="text-white/35">{row.displayName || row.username || row.id}</div></div> },
          { key: 'plan', label: 'Plan', render: (row) => <StatusPill value={row.subscription?.plan} /> },
          { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.subscription?.status} /> },
          { key: 'requests', label: 'Requests', render: (row) => formatNumber(row.usage?.requests) },
          { key: 'cost', label: 'Cost', render: (row) => formatCost(row.usage?.costUsd) },
          { key: 'tokens', label: 'Tokens', render: (row) => formatNumber(row.usage?.tokens) },
          { key: 'errors', label: 'Errors', render: (row) => formatNumber(row.errorCount) },
          { key: 'last', label: 'Last Usage', render: (row) => formatDate(row.usage?.lastUsageAt) },
        ]}
      />
    </Card>
  );
}

function ErrorsTab({ data, openDrawer }: { data: DashboardData; openDrawer: (drawer: DrawerState) => void }) {
  const errors = data.errors?.errors || [];
  const groups = data.errors?.groups || [];
  const reliabilityEntries = data.reliability?.entries || data.reliability?.breakers || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
        <Card className="p-4">
          <SectionHeader title="Errors" subtitle="Persisted errors with Sentry links" action={data.errors?.links?.sentry && <a className="text-xs text-white/70 hover:text-white hover:underline" href={data.errors.links.sentry} target="_blank" rel="noreferrer">Open Sentry</a>} />
          <DataTable
            rows={errors}
            onRow={(row) => openDrawer({ title: row.message, eyebrow: row.source, data: row })}
            columns={[
              { key: 'source', label: 'Source', render: (row) => <span className="text-white/80">{row.source}</span> },
              { key: 'message', label: 'Message', render: (row) => truncate(row.message, 80) },
              { key: 'email', label: 'User', render: (row) => row.email || row.user_id || '-' },
              { key: 'correlation_id', label: 'Correlation', render: (row) => row.correlation_id ? <CorrelationButton value={row.correlation_id} openDrawer={openDrawer} /> : '-' },
              { key: 'created_at', label: 'Time', render: (row) => formatDate(row.created_at) },
            ]}
          />
        </Card>
        <Card className="p-4">
          <SectionHeader title="Recurring Groups" />
          <div className="space-y-2">
            {groups.slice(0, 12).map((group: any, idx: number) => (
              <button key={`${group.source}-${idx}`} type="button" onClick={() => openDrawer({ title: group.source, eyebrow: 'error group', data: group })} className="w-full rounded-2xl bg-white/4 px-3 py-3 text-left hover:bg-white/[0.07]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white/80">{group.source}</span>
                  <span className="font-mono text-xs text-white/80">{formatNumber(group.count)}</span>
                </div>
                <div className="mt-1 truncate text-xs text-white/38">{group.message}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Card className="p-4">
        <SectionHeader title="Structured LLM Reliability" subtitle={data.reliability?.note || 'Per-isolate snapshot. No reset controls are exposed.'} />
        {Array.isArray(reliabilityEntries) && reliabilityEntries.length ? (
          <DataTable
            rows={reliabilityEntries}
            onRow={(row) => openDrawer({ title: row.model || row.key || 'Reliability', data: row })}
            columns={[
              { key: 'model', label: 'Model', render: (row) => row.model || row.key || '-' },
              { key: 'role', label: 'Role', render: (row) => row.role || '-' },
              { key: 'state', label: 'State', render: (row) => <StatusPill value={row.state} /> },
              { key: 'failures', label: 'Failures', render: (row) => formatNumber(row.failures || row.failureCount) },
              { key: 'lastFailureAt', label: 'Last Failure', render: (row) => formatDate(row.lastFailureAt) },
            ]}
          />
        ) : <EmptyState label="No reliability entries reported by this isolate" />}
      </Card>
    </div>
  );
}

function ActivityTab({ data, openDrawer }: { data: DashboardData; openDrawer: (drawer: DrawerState) => void }) {
  const rows = data.activity?.entries || [];
  const summary = data.activitySummary?.rows || [];
  return (
    <div className="space-y-5">
      <ChartFrame title="Activity by category">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={summary}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="key" tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14 }} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#ffffff" />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      <Card className="p-4">
        <SectionHeader title="Audit Timeline" subtitle="Agent actions, source types, terminal/tool/correlation IDs" />
        <DataTable
          rows={rows}
          onRow={(row) => openDrawer({ title: row.action, eyebrow: row.category, data: row })}
          columns={[
            { key: 'timestamp', label: 'Time', render: (row) => formatDate(row.timestamp) },
            { key: 'category', label: 'Category', render: (row) => <StatusPill value={row.category} /> },
            { key: 'action', label: 'Action', render: (row) => row.action },
            { key: 'summary', label: 'Summary', render: (row) => truncate(row.summary, 90) },
            { key: 'email', label: 'User', render: (row) => row.email || row.user_id || '-' },
            { key: 'result', label: 'Result', render: (row) => <StatusPill value={row.result} /> },
            { key: 'duration_ms', label: 'Duration', render: (row) => row.duration_ms ? `${row.duration_ms}ms` : '-' },
            { key: 'correlation_id', label: 'Correlation', render: (row) => row.correlation_id ? <CorrelationButton value={row.correlation_id} openDrawer={openDrawer} /> : '-' },
          ]}
        />
      </Card>
    </div>
  );
}

function IntegrationsTab({ data, openDrawer }: { data: DashboardData; openDrawer: (drawer: DrawerState) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Slack Installs" value={formatNumber(data.integrations?.slack?.installations)} detail="linked teams" icon={LinkIcon} />
        <MetricCard label="Telegram Links" value={formatNumber(data.integrations?.telegram?.links)} detail="mobile channel links" icon={Smartphone} />
        <MetricCard label="Pending Approvals" value={formatNumber((data.approvals?.rows || []).length)} detail="read-only queue" icon={Clock3} />
        <MetricCard label="Browser Resources" value={formatNumber((data.browserResources?.rows || []).length)} detail="active resources" icon={Layers3} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <MiniList title="Composio Connections" rows={data.integrations?.composio || []} valueKey="count" openDrawer={openDrawer} />
        <MiniList title="App Connections" rows={data.integrations?.appConnections || []} valueKey="count" openDrawer={openDrawer} />
      </div>
      <Card className="p-4">
        <SectionHeader title="App Gateway Calls" />
        <DataTable
          rows={data.appCalls?.rows || []}
          onRow={(row) => openDrawer({ title: row.name, eyebrow: row.app_id, data: row })}
          columns={[
            { key: 'app_id', label: 'App' },
            { key: 'name', label: 'Name' },
            { key: 'kind', label: 'Kind', render: (row) => <StatusPill value={row.kind} /> },
            { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
            { key: 'duration_ms', label: 'Duration', render: (row) => `${row.duration_ms || 0}ms` },
            { key: 'email', label: 'User', render: (row) => row.email || row.user_id },
            { key: 'created_at', label: 'Time', render: (row) => formatDate(row.created_at) },
          ]}
        />
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Approvals" />
          <DataTable
            rows={data.approvals?.rows || []}
            onRow={(row) => openDrawer({ title: row.tool_name || row.platform, eyebrow: 'approval', data: row })}
            columns={[
              { key: 'platform', label: 'Platform' },
              { key: 'tool_name', label: 'Tool' },
              { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
              { key: 'email', label: 'User', render: (row) => row.email || row.user_id },
              { key: 'requested_at', label: 'Requested', render: (row) => formatDate(row.requested_at) },
            ]}
          />
        </Card>
        <Card className="p-4">
          <SectionHeader title="Browser Resources" />
          <DataTable
            rows={data.browserResources?.rows || []}
            onRow={(row) => openDrawer({ title: row.kind, eyebrow: 'browser resource', data: row })}
            columns={[
              { key: 'kind', label: 'Kind' },
              { key: 'email', label: 'User', render: (row) => row.email || row.user_id },
              { key: 'session_key', label: 'Session', render: (row) => row.session_key ? <CopyButton value={row.session_key} /> : '-' },
              { key: 'started_at', label: 'Started', render: (row) => formatDate(row.started_at) },
              { key: 'expires_at', label: 'Expires', render: (row) => formatDate(row.expires_at) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function AnalyticsTab({ data, openDrawer }: { data: DashboardData; openDrawer: (drawer: DrawerState) => void }) {
  const funnel = data.funnel?.steps || [];
  const features = data.features?.rows || [];
  const retention = data.retention?.rows || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartFrame title="Activation funnel">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14 }} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#cccccc" />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title="Retention proxy by signup week">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={retention.slice().reverse()}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="cohort" tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14 }} />
              <Line type="monotone" dataKey="signups" stroke="#cccccc" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="active_later" stroke="#ffffff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
      <Card className="p-4">
        <SectionHeader title="Feature Adoption" subtitle="First-party PostHog-like service/action usage" />
        <DataTable
          rows={features}
          onRow={(row) => openDrawer({ title: `${row.service}.${row.action}`, eyebrow: 'feature', data: row })}
          columns={[
            { key: 'service', label: 'Service' },
            { key: 'action', label: 'Action' },
            { key: 'users', label: 'Users', render: (row) => formatNumber(row.users) },
            { key: 'requests', label: 'Requests', render: (row) => formatNumber(row.requests) },
            { key: 'cost', label: 'Cost', render: (row) => formatCost(row.cost) },
          ]}
        />
      </Card>
    </div>
  );
}

function HealthTab({ data, openDrawer }: { data: DashboardData; openDrawer: (drawer: DrawerState) => void }) {
  const configItems = data.config?.items || [];
  const securityEvents = data.securityEvents?.events || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="DB" value={data.health?.db?.ok ? 'OK' : 'Issue'} detail="D1 ping" icon={Database} />
        <MetricCard label="Sentry" value={data.health?.observability?.sentryConfigured ? 'On' : 'Off'} detail="runtime errors" icon={AlertTriangle} />
        <MetricCard label="PostHog" value={data.health?.observability?.posthogConfigured ? 'On' : 'Off'} detail="analytics link-outs" icon={BarChart3} />
        <MetricCard label="Environment" value={data.health?.environment || '-'} detail={data.health?.checkedAt ? formatDate(data.health.checkedAt) : '-'} icon={ShieldCheck} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Configuration Presence" subtitle="Values are redacted; this is presence only" />
          <DataTable
            rows={configItems}
            onRow={(row) => openDrawer({ title: row.key, eyebrow: 'config', data: row })}
            columns={[
              { key: 'key', label: 'Key', render: (row) => <span className="font-mono">{row.key}</span> },
              { key: 'configured', label: 'Configured', render: (row) => row.configured ? <CheckCircle2 className="h-4 w-4 text-white/80" /> : <XCircle className="h-4 w-4 text-white/40" /> },
              { key: 'requiredForDashboard', label: 'Required', render: (row) => row.requiredForDashboard ? 'yes' : 'no' },
              { key: 'warning', label: 'Note', render: (row) => row.warning || '-' },
            ]}
          />
        </Card>
        <Card className="p-4">
          <SectionHeader title="Admin Security Events" subtitle="Hashed IP only, no password or cookie material" />
          <DataTable
            rows={securityEvents}
            onRow={(row) => openDrawer({ title: row.event_type, eyebrow: 'security event', data: row })}
            columns={[
              { key: 'event_type', label: 'Event' },
              { key: 'ok', label: 'OK', render: (row) => <StatusPill value={row.ok ? 'ok' : 'failed'} /> },
              { key: 'ipHash', label: 'IP Hash', render: (row) => <span className="font-mono">{truncate(row.ipHash, 18)}</span> },
              { key: 'createdAt', label: 'Time', render: (row) => formatDate(row.createdAt) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: unknown }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void copyText(value);
      }}
      className="inline-flex max-w-[180px] items-center gap-1 rounded-full border border-white/10 bg-white/4 px-2 py-1 font-mono text-[10px] text-white/60 hover:text-white"
    >
      <Copy className="h-3 w-3" />
      <span className="truncate">{String(value || '-')}</span>
    </button>
  );
}

function CorrelationButton({ value, openDrawer }: { value: unknown; openDrawer: (drawer: DrawerState) => void }) {
  const [loading, setLoading] = useState(false);
  const id = String(value || '');
  return (
    <button
      type="button"
      onClick={async (event) => {
        event.stopPropagation();
        if (!id) return;
        setLoading(true);
        try {
          const data = await adminApi.get(`/correlation/${encodeURIComponent(id)}`);
          openDrawer({ title: id, eyebrow: 'correlation timeline', data });
        } catch (err) {
          openDrawer({ title: id, eyebrow: 'correlation lookup failed', data: { error: err instanceof Error ? err.message : 'Failed to load correlation', id } });
        } finally {
          setLoading(false);
        }
      }}
      className="inline-flex max-w-[180px] items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-1 font-mono text-[10px] text-white hover:bg-white/10"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
      <span className="truncate">{id}</span>
    </button>
  );
}

function DetailDrawer({ drawer, onClose }: { drawer: DrawerState; onClose: () => void }) {
  if (!drawer) return null;
  return (
    <div className="fixed inset-0 z-80 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-black p-5 text-white sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {drawer.eyebrow && <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">{drawer.eyebrow}</div>}
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em]">{truncate(drawer.title, 80)}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mb-3 flex gap-2">
          <Button size="sm" onClick={() => void copyText(JSON.stringify(drawer.data, null, 2))} className="rounded-xl border-white/10 bg-white/6 text-white">
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy JSON
          </Button>
          <Button size="sm" onClick={() => setTimeout(onClose, 0)} className="rounded-xl border-white/10 bg-white/6 text-white">
            <Eye className="mr-2 h-3.5 w-3.5" />
            Read only
          </Button>
        </div>
        <pre className="whitespace-pre-wrap rounded-3xl border border-white/10 bg-black/30 p-4 text-[11px] leading-relaxed text-white/68">
          {JSON.stringify(drawer.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default AdminDashboard;
