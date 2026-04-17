/**
 * HomeScreen — App grid home screen for the Telegram Mini App.
 * Shows system apps (ordered to match desktop Launchpad), installed apps,
 * connected Composio apps, agent status, and quick stats.
 */

import { useEffect, useState, useCallback } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { apiJSON, haptic, bg2, textColor, accent, SectionLabel } from '../ui';

// App icons (same as desktop appRegistry)
import iconLaunchpad from '@/icons/launchpad.png';
import iconAppStore from '@/icons/app-store.png';
import iconSettings from '@/icons/settings.png';
import iconFiles from '@/icons/files.png';
import iconCalendar from '@/icons/calendar.png';
import iconEmail from '@/icons/email.png';
import iconAccessLogs from '@/icons/access-logs.png';
import iconAccessControl from '@/icons/access-control.png';
import iconMemory from '@/icons/memory.png';
import iconGeneric from '@/icons/generic.png';

export type MiniScreen =
  | 'home' | 'files' | 'calendar' | 'email' | 'settings'
  | 'app-registry' | 'memory' | 'access-control' | 'audit-logs';

/** All navigable screens — MiniScreen + mobile-only screens like 'chat'. */
export type NavigableScreen = MiniScreen | 'chat';

interface AppItem {
  id: MiniScreen;
  label: string;
  icon: string;
  badge?: number;
}

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

interface UsageData {
  percentUsed: number;
  resetsIn: string;
  usedUsd?: number;
  capUsd?: number;
}

interface Props {
  onNavigate: (screen: NavigableScreen) => void;
}

export function HomeScreen({ onNavigate }: Props) {
  const agentConnected = useComputerStore((s) => s.agentConnected);
  const agentRunning = useComputerStore((s) => s.agentRunning);
  const emailUnreadCount = useComputerStore((s) => s.emailUnreadCount);
  const computerConfig = useComputerStore((s) => s.computer?.config);

  const [usage, setUsage] = useState<UsageData | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [events, setEvents] = useState<any[]>([]);


  const fetchData = useCallback(async () => {
    const [usageRes, appsRes, composioRes, eventsRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiJSON<any>('/billing/usage/current'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiJSON<any>('/agent/apps'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiJSON<any>('/composio/connected'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiJSON<any>(
        `/calendar/agent/events?time_min=${new Date().toISOString()}&time_max=${new Date(Date.now() + 7 * 86_400_000).toISOString()}&max_results=2`
      ),
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
        usedUsd: usageRes.weeklyUsedUsd,
        capUsd: usageRes.weeklyCapUsd,
      });
    }

    if (appsRes) {
      // Intentionally removed: no longer handling installed/connected apps in HomeScreen
    }

    if (composioRes?.connected) {
      // Intentionally removed: no longer handling composio connected apps in HomeScreen
    }

    if (eventsRes?.events) {
      setEvents(eventsRes.events);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const agentName = computerConfig?.identityName || 'Construct';
  const statusDot = !agentConnected ? '#f87171' : agentRunning ? '#4ade80' : '#22c55e';
  const statusText = !agentConnected ? 'Offline' : agentRunning ? 'Working...' : 'Online';
  const pct = usage?.percentUsed ?? 0;
  const barColor = pct >= 100 ? '#f87171' : pct >= 85 ? '#fbbf24' : '#22d3ee';
  
  const now = new Date();





  return (
    <div className="flex-1 flex flex-col pb-6 relative overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-8 pb-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight" style={{ color: textColor() }}>
            Hi <span style={{ color: accent() }}>{agentName}</span><br />
            Welcome
          </h1>
        </div>
        <div className="flex flex-col items-end text-right">
          <span className="text-[11px] font-medium uppercase tracking-widest opacity-40 mb-1">Usage</span>
          <div className="w-16 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
          </div>
          <span className="text-[10px] mt-1 opacity-40">{Math.round(pct)}% used</span>
        </div>
      </div>

      {/* Center content (Clippy) — tap to open chat */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-6">
        <div className="flex items-center gap-2 mt-4 px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${agentRunning ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: statusDot }}
          />
          <span className="text-[12px] font-medium" style={{ color: statusDot }}>
            {statusText}
          </span>
        </div>
      </div>

      {/* Bottom Widgets */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-5 z-0 relative">
        <button 
          onClick={() => { haptic('light'); onNavigate('calendar'); }}
          className="flex flex-col justify-between p-4 rounded-[20px] text-left active:scale-95 transition-transform"
          style={{ backgroundColor: bg2(), minHeight: '110px' }}
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent() }}>{now.toLocaleString('default', { weekday: 'long' })}</span>
            <div className="text-3xl font-semibold leading-none mt-1" style={{ color: textColor() }}>
              {now.getDate()}
            </div>
          </div>
          <div className="text-[12px] opacity-60 mt-2 line-clamp-2">
            {events.length > 0 ? events[0].summary : 'No upcoming events'}
          </div>
        </button>

        <button 
          onClick={() => { haptic('light'); onNavigate('email'); }}
          className="flex flex-col p-4 rounded-[20px] text-left active:scale-95 transition-transform"
          style={{ backgroundColor: bg2(), minHeight: '110px' }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2">Inbox</span>
          
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[14px] font-medium" style={{ color: textColor() }}>{emailUnreadCount} new emails</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[14px] font-medium" style={{ color: textColor() }}>0 notifications</span>
          </div>
        </button>
      </div>

    </div>
  );
}
