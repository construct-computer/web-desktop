/**
 * HomeScreen — App grid home screen for the Telegram Mini App.
 * Shows system apps (ordered to match desktop Launchpad), installed apps,
 * connected Composio apps, agent status, and quick stats.
 */

import { useEffect, useState, useCallback } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { RefreshCw } from 'lucide-react';
import { apiJSON, haptic, bg2, textColor, accent, SectionLabel } from '../ui';

// App icons (same as desktop appRegistry)
import iconAppStore from '@/icons/app-store.png';
import iconSettings from '@/icons/settings.png';
import iconAccessLogs from '@/icons/access-logs.png';
import iconAccessControl from '@/icons/access-control.png';
import iconMemory from '@/icons/memory.png';
import iconFiles from '@/icons/files.png';
import iconCalendar from '@/icons/calendar.png';
import iconEmail from '@/icons/email.png';
import iconGeneric from '@/icons/generic.png';

export type MiniScreen =
  | 'home' | 'files' | 'calendar' | 'email' | 'settings'
  | 'app-registry' | 'memory' | 'access-control' | 'audit-logs';

interface AppItem {
  id: MiniScreen;
  label: string;
  icon: string;
  badge?: number;
}

/**
 * System apps — ordered to match the desktop Launchpad (appRegistry.ts).
 * Desktop-only apps (Terminal, Browser, Editor) are excluded.
 */
const SYSTEM_APPS: AppItem[] = [
  { id: 'app-registry', label: 'Apps', icon: iconAppStore },
  { id: 'settings', label: 'Settings', icon: iconSettings },
  { id: 'audit-logs', label: 'Audit Logs', icon: iconAccessLogs },
  { id: 'access-control', label: 'Access', icon: iconAccessControl },
  { id: 'memory', label: 'Memory', icon: iconMemory },
  { id: 'files', label: 'Files', icon: iconFiles },
  { id: 'calendar', label: 'Calendar', icon: iconCalendar },
  { id: 'email', label: 'Email', icon: iconEmail },
];

interface InstalledAppData {
  id: string;
  name: string;
  icon_url?: string;
}

interface UsageData {
  percentUsed: number;
  resetsIn: string;
  requestCount: number;
}

interface Props {
  onNavigate: (screen: MiniScreen) => void;
}

export function HomeScreen({ onNavigate }: Props) {
  const agentConnected = useComputerStore((s) => s.agentConnected);
  const agentRunning = useComputerStore((s) => s.agentRunning);
  const emailUnreadCount = useComputerStore((s) => s.emailUnreadCount);
  const computerConfig = useComputerStore((s) => s.computer?.config);

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [installedApps, setInstalledApps] = useState<InstalledAppData[]>([]);
  const [connectedApps, setConnectedApps] = useState<Array<{ toolkit: string; name?: string; logo?: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const [usageRes, appsRes, composioRes] = await Promise.all([
      apiJSON<any>('/billing/usage/current'),
      apiJSON<any>('/agent/apps'),
      apiJSON<any>('/composio/connected'),
    ]);

    if (usageRes) {
      const resetsAt = usageRes.weeklyResetsAt || usageRes.resetsAt;
      const resetTs = resetsAt
        ? (typeof resetsAt === 'string' ? new Date(resetsAt).getTime() : resetsAt)
        : Date.now();
      const mins = Math.max(0, Math.round((resetTs - Date.now()) / 60_000));
      setUsage({
        percentUsed: usageRes.weeklyPercentUsed ?? usageRes.percentUsed ?? 0,
        resetsIn: `${Math.floor(mins / 60)}h ${mins % 60}m`,
        requestCount: usageRes.requestCount || 0,
      });
    }

    // Installed apps from the app store
    const appsList = appsRes?.apps || (Array.isArray(appsRes) ? appsRes : []);
    setInstalledApps(appsList.map((a: any) => ({
      id: a.id,
      name: a.name,
      icon_url: a.icon_url,
    })));

    // Connected Composio toolkits
    if (composioRes?.connected) {
      setConnectedApps(composioRes.connected.map((c: any) => ({
        toolkit: c.toolkit,
        name: c.toolkit.charAt(0).toUpperCase() + c.toolkit.slice(1),
        logo: `https://logos.composio.dev/api/${c.toolkit}`,
      })));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    haptic('light');
  };

  const agentName = computerConfig?.identityName || 'Construct';
  const statusDot = !agentConnected ? '#f87171' : agentRunning ? '#4ade80' : '#22c55e';
  const statusText = !agentConnected ? 'Offline' : agentRunning ? 'Working...' : 'Online';
  const pct = usage?.percentUsed ?? 0;
  const barColor = pct >= 100 ? '#f87171' : pct >= 85 ? '#fbbf24' : '#22d3ee';

  // Add badges to system apps
  const appsWithBadges = SYSTEM_APPS.map(app => {
    if (app.id === 'email' && emailUnreadCount > 0) return { ...app, badge: emailUnreadCount };
    return app;
  });

  // Merge installed + composio apps (deduplicate against system app IDs)
  const systemIds = new Set(SYSTEM_APPS.map(a => a.id));
  const externalApps = [
    ...installedApps
      .filter(a => !systemIds.has(a.id as MiniScreen))
      .map(a => ({ id: a.id, label: a.name, icon: a.icon_url || iconGeneric })),
    ...connectedApps
      .filter(a => !systemIds.has(`composio-${a.toolkit}` as MiniScreen))
      .map(a => ({ id: `composio-${a.toolkit}`, label: a.name || a.toolkit, icon: a.logo || iconGeneric })),
  ];

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: textColor() }}>{agentName}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${agentRunning ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: statusDot }}
            />
            <span className="text-[13px] font-medium" style={{ color: statusDot }}>
              {statusText}
            </span>
          </div>
        </div>
        <button onClick={handleRefresh} className="p-2.5 rounded-full active:bg-white/5">
          <RefreshCw size={18} className={`opacity-40 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* System App Grid — 4 cols */}
      <div className="px-5 pt-2">
        <div className="grid grid-cols-4 gap-y-5 gap-x-2">
          {appsWithBadges.map((app) => (
            <button
              key={app.id}
              onClick={() => { onNavigate(app.id); haptic('light'); }}
              className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
            >
              <div className="relative">
                <img src={app.icon} alt="" className="w-12 h-12 rounded-[12px]" />
                {app.badge != null && app.badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
                    {app.badge > 9 ? '9+' : app.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium text-center leading-tight opacity-70 line-clamp-1" style={{ color: textColor() }}>
                {app.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Installed + Connected Apps */}
      {externalApps.length > 0 && (
        <div className="px-5 mt-6">
          <SectionLabel>Installed</SectionLabel>
          <div className="grid grid-cols-4 gap-y-5 gap-x-2">
            {externalApps.map((app) => (
              <div key={app.id} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-[12px] flex items-center justify-center overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <img
                    src={app.icon}
                    alt=""
                    className="w-8 h-8 rounded-md object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).src = iconGeneric; }}
                  />
                </div>
                <span className="text-[11px] font-medium text-center leading-tight opacity-70 line-clamp-1" style={{ color: textColor() }}>
                  {app.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="mx-5 mt-6 rounded-2xl p-4" style={{ backgroundColor: bg2(), boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
        <SectionLabel>Quick Stats</SectionLabel>

        {/* Usage bar */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] opacity-60">Usage</span>
          <span className="text-[13px] font-medium" style={{ color: barColor }}>
            {pct >= 100 ? 'Lite mode' : `${Math.min(pct, 100).toFixed(0)}%`}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.max(1, Math.min(100, pct))}%`, backgroundColor: barColor }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-[12px] opacity-40">Resets in</span>
            <span className="text-[13px] font-medium ml-1.5">{usage?.resetsIn ?? '—'}</span>
          </div>
          <div>
            <span className="text-[12px] opacity-40">Requests</span>
            <span className="text-[13px] font-medium ml-1.5">{usage?.requestCount ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
