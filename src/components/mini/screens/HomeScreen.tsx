/**
 * HomeScreen — App grid home screen for the Telegram Mini App.
 * Shows system apps (ordered to match desktop Launchpad), installed apps,
 * connected Composio apps, agent status, and quick stats.
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { apiJSON, haptic, textColor, accent } from '../ui';
import { CalendarEmailQuickWidgets } from '@/components/desktop/CalendarEmailQuickWidgets';
import { LogOut } from 'lucide-react';

export type MiniScreen =
  | 'home' | 'files' | 'calendar' | 'email' | 'settings'
  | 'app-registry' | 'memory' | 'access-control' | 'audit-logs';

/** All navigable screens — MiniScreen + mobile-only screens like 'chat'. */
export type NavigableScreen = MiniScreen | 'chat';

interface UsageData {
  percentUsed: number;
  resetsIn: string;
  usedUsd?: number;
  capUsd?: number;
}

interface Props {
  onNavigate: (screen: NavigableScreen) => void;
  onLogout?: () => void;
}

export function HomeScreen({ onNavigate, onLogout }: Props) {
  const [usage, setUsage] = useState<UsageData | null>(null);

  const fetchData = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usageRes = await apiJSON<any>('/billing/usage/current');

    if (usageRes) {
      const resetsAt = usageRes.weeklyResetsAt || usageRes.resetsAt;
      const resetTs = resetsAt
        ? (typeof resetsAt === 'string' ? new Date(resetsAt).getTime() : resetsAt)
        : Date.now();
      const mins = Math.max(0, Math.round((resetTs - Date.now()) / 60_000));
      setUsage({
        percentUsed: usageRes.weeklyPercentUsed ?? usageRes.percentUsed ?? 0,
        resetsIn: `${Math.floor(mins / 60)}h ${mins % 60}m`,
        usedUsd: usageRes.weeklyUsedUsd,
        capUsd: usageRes.weeklyCapUsd,
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const user = useAuthStore((s) => s.user);
  const nameToUse = user?.displayName || user?.username || '';
  const userName = nameToUse.split(' ')[0] || 'there';
  const pct = usage?.percentUsed ?? 0;
  const barColor = pct >= 100 ? '#f87171' : pct >= 85 ? '#fbbf24' : '#22d3ee';
  
  return (
    <div className="flex-1 flex flex-col pb-6 relative overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-8 pb-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight" style={{ color: textColor() }}>
            Hi <span style={{ color: accent() }}>{userName}</span><br />
            Welcome
          </h1>
        </div>
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-end text-right">
            <span className="text-[11px] font-medium uppercase tracking-widest opacity-40 mb-1">Usage</span>
            <div className="w-16 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
            </div>
            <span className="text-[10px] mt-1 opacity-40">{Math.round(pct)}% used</span>
          </div>
          {onLogout && (
            <button
              onClick={() => { haptic('light'); onLogout(); }}
              className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full active:bg-white/10"
              style={{ color: textColor() }}
              aria-label="Log out"
            >
              <LogOut size={15} className="opacity-45" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* Bottom widgets — same frosted chrome as desktop / app windows */}
      <div className="px-5 mb-5 z-0 relative">
        <CalendarEmailQuickWidgets
          onCalendarClick={() => {
            haptic('light');
            onNavigate('calendar');
          }}
          onEmailClick={() => {
            haptic('light');
            onNavigate('email');
          }}
        />
      </div>

    </div>
  );
}
