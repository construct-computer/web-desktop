/**
 * Settings — macOS System Settings-style app with sidebar navigation.
 *
 * Sections:
 *   User         — Agent status, profile name, agent name, email
 *   Agent        — Autonomy and recovery behavior
 *   Connections  — Slack + Telegram connect/disconnect
 *   Customisation — Wallpaper, sound, and voice preferences
 *   Subscription — Billing, usage, top-ups
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Bot, Link2, Paintbrush, Volume2, CreditCard,
  Image,
  Loader2, Check, AlertCircle, Unplug, Send, Save, ChevronRight,
  Code2, Upload, Mail, Lock, Globe, Search, Plug, MessageCircle,
  Zap, ExternalLink, RefreshCw, LogOut, Trash2,
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { getPlatformDisplayName } from '@/lib/platforms';
import { useSettingsStore, WALLPAPERS, getWallpaperSrc, saveCustomWallpaper } from '@/stores/settingsStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsNav, type SettingsSection } from '@/lib/settingsNav';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AGENT_EMAIL_DOMAIN } from '@/lib/config';

import { openAuthRedirect } from '@/lib/utils';
import {
  getSlackConfigured, getSlackInstallUrl, getSlackStatus, disconnectSlack,
  getTelegramStatus, getTelegramLinkUrl, getTelegramBotInfo, telegramLoginWidget, disconnectTelegram,
  getAgentConfig, updateAgentConfig,
  getComposioConnected, composioFinalize, disconnectComposio, searchComposioToolkits,
  getComposioToolkitDetail,
  getPlatformModelSettings, updatePlatformModel,
  getAutopilotPolicy, updateAutopilotPolicy,
  listAuthSessions, removeLoggedOutAuthSession, revokeAuthSession, revokeOtherAuthSessions,
  type PlatformModelSettings,
  type AutopilotPolicy,
  type AutonomyMode,
  type AuthSessionRecord,
} from '@/services/api';
import { ComposioAuthPanel } from './ComposioAuthPanel';
import { BillingSection } from './BillingSection';
import { ByokSection } from './ByokSection';
import { UsageSection, InfoCard } from './UsageSection';
import { useBillingStore } from '@/stores/billingStore';
import { getTimezoneOptions, getDetectedTimezone } from '@/lib/timezones';
// Dev app upload removed — apps are now hosted MCP servers
import { useDevAppStore } from '@/stores/devAppStore';
import type { WindowConfig } from '@/types';

// ── Types ──

type Section = SettingsSection;
type TelegramWidgetUser = Record<string, string>;

declare global {
  interface Window {
    onTelegramWidgetAuth?: (user: TelegramWidgetUser) => void | Promise<void>;
  }
}

interface SectionDef {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

type DeviceSvgProps = { className?: string };

function DeviceSidebarIcon({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 18h5M10.5 14v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="15" y="10" width="5" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 16.2h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const SECTIONS: SectionDef[] = [
  { id: 'user', label: 'User', icon: User },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'connections', label: 'Connections', icon: Link2 },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'usage', label: 'Usage', icon: Zap },
  { id: 'customisation', label: 'Customisation', icon: Paintbrush },
  { id: 'devices', label: 'Devices', icon: DeviceSidebarIcon },
  { id: 'developer', label: 'Developer', icon: Code2 },
];

// ── macOS-style toggle switch ──

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-emerald-500' : 'bg-black/15 dark:bg-white/20'
      } disabled:cursor-default disabled:opacity-60`}
    >
      <span
        className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        } mt-[2px]`}
      />
    </button>
  );
}

// ── Main Component ──

export function SettingsWindow({ config }: { config: WindowConfig }) {
  void config;
  const isMobile = useIsMobile();
  const pendingSection = useSettingsNav((s) => s.pendingSection);
  const setPendingSection = useSettingsNav((s) => s.setPendingSection);
  const [localSection, setLocalSection] = useState<Section>('user');
  // pendingSection (set by other windows) overrides local until the user navigates.
  const section = pendingSection ?? localSection;
  const setSection = (next: Section) => {
    if (pendingSection) setPendingSection(null);
    setLocalSection(next);
  };

  return (
    <div className={`flex ${isMobile ? 'flex-col' : ''} h-full text-[var(--color-text)] select-none`}>
      {/* Sidebar / Topnav — on mobile, fade right edge to hint at scrollable overflow */}
      <div
        className={`${isMobile ? 'w-full flex-shrink-0 border-b overflow-x-auto py-2 px-2 whitespace-nowrap' : 'w-[180px] flex-shrink-0 border-r overflow-y-auto py-2 px-2'} border-black/[0.06] dark:border-white/[0.06] surface-sidebar`}
        style={isMobile ? {
          maskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
        } : undefined}
      >
        <div className={`${isMobile ? 'flex gap-1.5' : 'space-y-0.5'}`}>
          {SECTIONS.map((s) => {
                const active = section === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSection(s.id)}
                    className={`flex items-center gap-2 px-2.5 ${isMobile ? 'py-2' : 'py-[5px]'} rounded-md text-[13px] transition-all duration-100 ${
                      !isMobile ? 'w-full' : ''
                    } ${
                      active
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-black/90 dark:text-white/90 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="flex items-center justify-center w-4 shrink-0">
                      <s.icon className={`w-[15px] h-[15px] ${active ? 'text-white' : 'text-black/50 dark:text-white/50'}`} />
                    </span>
                    <span className={active ? 'font-medium' : ''}>{s.label}</span>
                  </button>
                );
              })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {section === 'user' && <UserSection />}
        {section === 'devices' && <DevicesSection />}
        {section === 'agent' && <AgentSection />}
        {section === 'connections' && <ConnectionsSection />}
        {section === 'customisation' && <CustomisationSection />}
        {section === 'subscription' && <SubscriptionSection />}
        {section === 'usage' && <UsageSectionWrapper />}
        {section === 'developer' && <DeveloperSection />}
      </div>
    </div>
  );
}

// ── Section wrapper ──

function SectionPanel({ title, subtitle, action, children }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-7 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold mb-1 tracking-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {!subtitle && !action && <div className="mb-1" />}
      {children}
    </div>
  );
}

// ── Grouped settings card ──

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg surface-card border border-black/[0.06] dark:border-white/[0.06] overflow-visible ${className}`}>
      {children}
    </div>
  );
}

function SettingsRow({ label, description, children, noBorder }: {
  label: string;
  description?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 min-h-[44px] ${
      !noBorder ? 'border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0' : ''
    }`}>
      <div className="flex-1 min-w-0">
        <span className="text-[13px]">{label}</span>
        {description && <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function formatRelativeTime(value: number): string {
  const diffMs = Date.now() - value;
  if (diffMs < 10_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function surfaceLabel(surface: string): string {
  if (surface === 'mobile_app') return 'Mobile app';
  if (surface === 'desktop_app') return 'Desktop app';
  if (surface === 'telegram_mini') return 'Telegram Mini App';
  return 'Web';
}

type DeviceIconKind = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'mobile-app' | 'desktop-app' | 'web' | 'unknown';

function sessionIconKind(session: AuthSessionRecord): DeviceIconKind {
  const os = (session.os || '').toLowerCase();
  if (os.includes('ios') || os.includes('iphone') || os.includes('ipad')) return 'ios';
  if (os.includes('android')) return 'android';
  if (os.includes('mac')) return 'macos';
  if (os.includes('windows')) return 'windows';
  if (os.includes('linux')) return 'linux';
  if (session.surface === 'mobile_app') return 'mobile-app';
  if (session.surface === 'desktop_app') return 'desktop-app';
  if (session.surface === 'web') return 'web';
  return 'unknown';
}

function deviceIconTone(kind: DeviceIconKind): string {
  switch (kind) {
    case 'macos': return 'bg-sky-500/12 text-sky-400 ring-sky-400/12';
    case 'windows': return 'bg-cyan-500/12 text-cyan-400 ring-cyan-400/12';
    case 'linux': return 'bg-amber-500/12 text-amber-300 ring-amber-300/12';
    case 'ios': return 'bg-violet-500/12 text-violet-300 ring-violet-300/12';
    case 'android': return 'bg-emerald-500/12 text-emerald-400 ring-emerald-400/12';
    case 'mobile-app': return 'bg-fuchsia-500/12 text-fuchsia-300 ring-fuchsia-300/12';
    case 'desktop-app': return 'bg-blue-500/12 text-blue-300 ring-blue-300/12';
    case 'web': return 'bg-indigo-500/12 text-indigo-300 ring-indigo-300/12';
    default: return 'bg-white/[0.06] text-[var(--color-text-muted)] ring-white/10';
  }
}

function MacosDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4.2" y="5.2" width="15.6" height="10.2" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 18.8h5.6M12 15.5v3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.4 8.9c.7-.8 1.7-1.2 3.1-1.2s2.4.4 3.1 1.2M9.4 11.8h5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="13.2" r="0.75" fill="currentColor" />
    </svg>
  );
}

function WindowsDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4.2" y="5.2" width="15.6" height="10.2" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.3 8.2h3.1v3.1H8.3zM12.6 8.2h3.1v3.1h-3.1zM8.3 12.3h3.1v3.1H8.3zM12.6 12.3h3.1v3.1h-3.1z" fill="currentColor" />
      <path d="M9.2 18.8h5.6M12 15.5v3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function LinuxDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="5.4" width="16" height="13.2" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.8 9.1h14.4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7.1" cy="7.3" r="0.7" fill="currentColor" />
      <circle cx="9.2" cy="7.3" r="0.7" fill="currentColor" opacity="0.65" />
      <path d="M8 12.2l2 1.8-2 1.8M11.6 16h4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IosDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="7" y="3.5" width="10" height="17" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.2 6h3.6M10.4 18h3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.4 8.4h5.2v7.4H9.4z" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
    </svg>
  );
}

function AndroidDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="6.4" y="3.8" width="11.2" height="16.4" rx="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.4 10.1h5.2v4.1a1.5 1.5 0 0 1-1.5 1.5h-2.2a1.5 1.5 0 0 1-1.5-1.5v-4.1z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 8.8l-1-1.3M14 8.8l1-1.3M10 17.6h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10.8" cy="12" r="0.55" fill="currentColor" />
      <circle cx="13.2" cy="12" r="0.55" fill="currentColor" />
    </svg>
  );
}

function MobileAppDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="7" y="3.6" width="10" height="16.8" rx="2.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.6 8h2.1v2.1H9.6zM12.8 8h2.1v2.1h-2.1zM9.6 11.3h2.1v2.1H9.6zM12.8 11.3h2.1v2.1h-2.1z" fill="currentColor" />
      <path d="M10.6 17.4h2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function DesktopAppDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.2 8.4h9.6M7.2 11.1h5.2M9.2 19h5.6M12 16.2V19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.2 11.2l2.5 2.5M17.7 11.2l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function WebDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="13.5" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.8 8.8h14.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.6 13.7a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 0 0-6.8 0zM9 13.7h6M12 10.4c.9.9 1.3 2 1.3 3.3s-.4 2.4-1.3 3.3M12 10.4c-.9.9-1.3 2-1.3 3.3s.4 2.4 1.3 3.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="7" cy="6.9" r="0.55" fill="currentColor" />
    </svg>
  );
}

function UnknownDeviceSvg({ className }: DeviceSvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4.5" y="5.2" width="13.2" height="9.2" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14.4" y="10.2" width="5.1" height="8.4" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 18.5h3.2M10.8 14.6v3.8M16.3 16.4h1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DeviceSessionIcon({ session, className }: { session: AuthSessionRecord; className?: string }) {
  switch (sessionIconKind(session)) {
    case 'macos': return <MacosDeviceSvg className={className} />;
    case 'windows': return <WindowsDeviceSvg className={className} />;
    case 'linux': return <LinuxDeviceSvg className={className} />;
    case 'ios': return <IosDeviceSvg className={className} />;
    case 'android': return <AndroidDeviceSvg className={className} />;
    case 'mobile-app': return <MobileAppDeviceSvg className={className} />;
    case 'desktop-app': return <DesktopAppDeviceSvg className={className} />;
    case 'web': return <WebDeviceSvg className={className} />;
    default: return <UnknownDeviceSvg className={className} />;
  }
}

type DisplayAuthSession = AuthSessionRecord & {
  sessionIds: string[];
  activeSessionIds: string[];
  revokedSessionIds: string[];
  duplicateCount: number;
};

function deviceGroupKey(session: AuthSessionRecord): string {
  if (session.deviceId) return `device:${session.deviceId}`;
  return [
    'fingerprint',
    session.surface || '',
    session.deviceType || '',
    session.browser || '',
    session.os || '',
    session.ipAddress || '',
    session.location || '',
    session.timezone || '',
  ].join('|').toLowerCase();
}

function compareSessionsForDisplay(a: AuthSessionRecord, b: AuthSessionRecord): number {
  if (a.current !== b.current) return a.current ? -1 : 1;
  const aRevoked = Boolean(a.revokedAt);
  const bRevoked = Boolean(b.revokedAt);
  if (aRevoked !== bRevoked) return aRevoked ? 1 : -1;
  if (a.online !== b.online) return a.online ? -1 : 1;
  return (b.lastSeenAt || 0) - (a.lastSeenAt || 0) || (b.updatedAt || 0) - (a.updatedAt || 0);
}

function dedupeAuthSessions(sessions: AuthSessionRecord[]): DisplayAuthSession[] {
  const groups = new Map<string, AuthSessionRecord[]>();
  for (const session of sessions) {
    const key = deviceGroupKey(session);
    groups.set(key, [...(groups.get(key) || []), session]);
  }

  return Array.from(groups.values())
    .map((group) => {
      const sorted = [...group].sort(compareSessionsForDisplay);
      const representative = sorted[0];
      return {
        ...representative,
        sessionIds: sorted.map((session) => session.id),
        activeSessionIds: sorted.filter((session) => !session.revokedAt && !session.current).map((session) => session.id),
        revokedSessionIds: sorted.filter((session) => session.revokedAt).map((session) => session.id),
        duplicateCount: sorted.length,
      };
    })
    .sort(compareSessionsForDisplay);
}

function DevicesSection() {
  const [sessions, setSessions] = useState<AuthSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listAuthSessions();
    if (result.success) {
      setSessions(result.data.sessions);
      setError(null);
    } else {
      setError(result.error || 'Failed to load devices');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const revokeOne = async (session: DisplayAuthSession) => {
    setBusy(`revoke:${session.id}`);
    const ids = session.activeSessionIds.length > 0 ? session.activeSessionIds : [session.id];
    for (const id of ids) {
      const result = await revokeAuthSession(id);
      if (!result.success) {
        setError(result.error || 'Failed to log out device');
        break;
      }
    }
    await refresh();
    setBusy(null);
  };

  const removeLoggedOut = async (session: DisplayAuthSession) => {
    setBusy(`remove:${session.id}`);
    for (const id of session.revokedSessionIds) {
      const result = await removeLoggedOutAuthSession(id);
      if (!result.success) {
        setError(result.error || 'Failed to remove logged out device');
        break;
      }
    }
    await refresh();
    setBusy(null);
  };

  const revokeOthers = async () => {
    setBusy('others');
    const result = await revokeOtherAuthSessions();
    if (!result.success) setError(result.error || 'Failed to log out other devices');
    await refresh();
    setBusy(null);
  };

  const activeSessions = sessions.filter((session) => !session.revokedAt);
  const otherActiveCount = activeSessions.filter((session) => !session.current).length;
  const displaySessions = dedupeAuthSessions(sessions);

  return (
    <SectionPanel
      title="Devices"
      subtitle="See where your account is signed in and log out devices you do not recognize."
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="destructive" onClick={revokeOthers} disabled={!otherActiveCount || busy === 'others'}>
            {busy === 'others' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Log out others
          </Button>
        </div>
      }
    >
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <SettingsCard>
        {loading && sessions.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[13px] text-[var(--color-text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading devices...
          </div>
        ) : displaySessions.length === 0 ? (
          <div className="px-4 py-5 text-[13px] text-[var(--color-text-muted)]">No devices found.</div>
        ) : (
          displaySessions.map((session) => {
            const revoked = Boolean(session.revokedAt);
            const title = session.deviceLabel || [session.browser, session.os].filter(Boolean).join(' on ') || 'Unknown device';
            const revokeBusy = busy === `revoke:${session.id}`;
            const removeBusy = busy === `remove:${session.id}`;
            const iconKind = sessionIconKind(session);
            return (
              <div
                key={session.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0"
              >
                <div className={`relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${deviceIconTone(iconKind)} ${revoked ? 'opacity-60' : ''}`}>
                  <DeviceSessionIcon session={session} className="h-[22px] w-[22px]" />
                  <span className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] ${
                    revoked ? 'bg-zinc-500' : session.online ? 'bg-emerald-500' : 'bg-zinc-400'
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-medium truncate">{title}</p>
                    {session.current && (
                      <span className="rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                        Current
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      revoked
                        ? 'bg-zinc-500/12 text-zinc-500'
                        : session.online
                          ? 'bg-emerald-500/12 text-emerald-500'
                          : 'bg-zinc-500/12 text-zinc-500'
                    }`}>
                      {revoked ? 'Logged out' : session.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                    {surfaceLabel(session.surface)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                    {session.location ? ` · ${session.location}` : ''}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                    Last active {formatRelativeTime(session.lastSeenAt)}
                    {session.timezone ? ` · ${session.timezone}` : ''}
                  </p>
                </div>
                {!revoked && session.activeSessionIds.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => void revokeOne(session)} disabled={revokeBusy}>
                    {revokeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : session.current ? 'Log out others' : 'Log out'}
                  </Button>
                )}
                {revoked && session.revokedSessionIds.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => void removeLoggedOut(session)} disabled={removeBusy}>
                    {removeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Remove
                  </Button>
                )}
              </div>
            );
          })
        )}
      </SettingsCard>
    </SectionPanel>
  );
}

// ── User Section ──

function UserSection() {
  const { user, updateProfile } = useAuthStore();
  const { computer, updateComputer } = useComputerStore();
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const setPendingSection = useSettingsNav((s) => s.setPendingSection);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const isPaid = subscription?.plan === 'pro' || subscription?.plan === 'starter';

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [agentName, setAgentName] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [timezone, setTimezone] = useState(getDetectedTimezone());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingEmail = computer?.config?.agentmailEmail;
  const emailLocked = !!existingEmail;

  // Populate agent name from computer config
  useEffect(() => {
    const nextName = computer?.config?.identityName;
    if (!nextName) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setAgentName(nextName);
    });
    return () => { cancelled = true; };
  }, [computer?.config?.identityName]);

  // Populate timezone from agent config
  useEffect(() => {
    const instanceId = computer?.id;
    if (!instanceId) return;
    getAgentConfig(instanceId).then(res => {
      if (res.success && res.data?.timezone) {
        setTimezone(res.data.timezone);
      }
    });
  }, [computer?.id]);

  // Populate email username from existing config
  useEffect(() => {
    if (!existingEmail) return;
    // Extract base username from "ankush@example.com" -> "ankush".
    const base = existingEmail.replace(/@.*$/, '');
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setEmailUsername(base);
    });
    return () => { cancelled = true; };
  }, [existingEmail]);

  // Reset saved indicator after a delay
  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const profileOk = await updateProfile({ displayName: displayName.trim() });

      const updateData: Parameters<typeof updateComputer>[0] = {
        ownerName: displayName.trim(),
        agentName: agentName.trim() || 'Construct Agent',
      };

      // Include email username only if not already set and user is on a paid plan.
      // (Backend also enforces this — belt-and-suspenders to avoid a 403 round-trip.)
      if (!emailLocked && isPaid && emailUsername.trim()) {
        updateData.agentmailInboxUsername = emailUsername.trim();
      }

      // Save timezone to agent config
      const instanceId = computer?.id || '';
      if (instanceId) {
        await updateAgentConfig(instanceId, { timezone });
      }

      const computerOk = await updateComputer(updateData);
      if (profileOk && computerOk) {
        setSaved(true);
      } else {
        setError('Failed to save some settings');
      }
    } catch {
      setError('Failed to save');
    }
    setSaving(false);
  };

  return (
    <SectionPanel title="User" subtitle="Manage your profile and agent identity.">
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* You — name + email */}
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">You</h3>
      <SettingsCard>
        <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06]">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-[42px] h-[42px] rounded-full border border-black/5 dark:border-white/10" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-[42px] h-[42px] rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-black/50 dark:text-white/50 text-lg font-semibold">
              {(user?.displayName || user?.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium truncate">{user?.displayName || user?.username || 'User'}</p>
            <p className="text-[12px] text-[var(--color-text-muted)] truncate">{user?.email || ''}</p>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5 block">Your Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="!bg-transparent !border-0 !shadow-none !ring-0 !px-0 text-[13px] focus-visible:!ring-0"
          />
        </div>

        <SettingsRow label="Email" noBorder>
          <span className="text-[13px] text-[var(--color-text-muted)]">{user?.email || 'Not set'}</span>
        </SettingsRow>
      </SettingsCard>

      {/* Agent — name + email */}
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mt-5 mb-1.5">Agent</h3>
      <SettingsCard>
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5 block">Agent Name</label>
          <Input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Construct Agent"
            className="!bg-transparent !border-0 !shadow-none !ring-0 !px-0 text-[13px] focus-visible:!ring-0"
          />
        </div>

        <SettingsRow label="Agent Email" noBorder>
          {emailLocked ? (
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="text-[13px] text-[var(--color-text)]">{existingEmail}</span>
              <Lock className="w-3 h-3 text-[var(--color-text-muted)]" />
            </div>
          ) : !isPaid ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-text-muted)]">Available on paid plans</span>
              <button
                type="button"
                onClick={() => setPendingSection('subscription')}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full
                  bg-emerald-500/15 text-emerald-600 dark:text-emerald-400
                  hover:bg-emerald-500/25 transition-colors"
              >
                Upgrade
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-[var(--color-border)]">
              <Input
                type="text"
                value={emailUsername}
                onChange={(e) => setEmailUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="yourname"
                className="!border-0 !shadow-none !ring-0 text-[13px] !rounded-none !py-1.5 !px-2 bg-transparent min-w-[100px]"
              />
              <span className="text-[12px] text-[var(--color-text-muted)] px-2 bg-[var(--color-surface-raised)] border-l border-[var(--color-border)] py-1.5 whitespace-nowrap select-none">
                @{AGENT_EMAIL_DOMAIN}
              </span>
            </div>
          )}
        </SettingsRow>
      </SettingsCard>

      {/* Timezone */}
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mt-5 mb-1.5">Timezone</h3>
      <SettingsCard>
        <SettingsRow label="Timezone" noBorder>
          <div className="flex items-center gap-1.5 max-w-[240px]">
            <Globe className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
            <Select
              value={timezone}
              onChange={setTimezone}
              options={getTimezoneOptions()}
              searchable
              align="right"
              className="text-[12px]"
            />
          </div>
        </SettingsRow>
      </SettingsCard>

      {/* Save */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-[7px] rounded-[7px] transition-all ${
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-[var(--color-accent)] text-white hover:opacity-90 active:opacity-80 disabled:opacity-50'
          }`}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>
    </SectionPanel>
  );
}

// ── Agent Section ──

const AUTONOMY_MODE_OPTIONS: Array<{
  mode: AutonomyMode;
  label: string;
  summary: string;
  detail: string;
}> = [
  {
    mode: 'conservative',
    label: 'Careful',
    summary: 'Asks before anything that may affect people, money, external messages, or broad changes.',
    detail: 'Best when you want close supervision or the task is sensitive.',
  },
  {
    mode: 'standard',
    label: 'Standard',
    summary: 'Handles routine work and safe retries, then asks for credentials, approvals, or unclear decisions.',
    detail: 'Best default for normal business workflows.',
  },
  {
    mode: 'aggressive',
    label: 'Auto',
    summary: 'Takes more low and medium risk decisions on its own, with fewer interruptions.',
    detail: 'Still asks before critical, destructive, or explicitly restricted actions.',
  },
];

function AgentSection() {
  const [policy, setPolicy] = useState<AutopilotPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAutopilotPolicy().then((result) => {
      if (cancelled) return;
      if (result.success) {
        setPolicy(result.data);
        setError(null);
      } else {
        setError(result.error || 'Failed to load agent settings');
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const savePolicy = async (
    update: AutonomyMode | { mode?: AutonomyMode; enabled?: boolean },
    busyKey: string,
    optimistic: (current: AutopilotPolicy) => AutopilotPolicy,
  ) => {
    if (!policy || savingKey) return;
    const previous = policy;
    setSavingKey(busyKey);
    setError(null);
    setPolicy(optimistic(policy));
    const result = await updateAutopilotPolicy(update);
    if (result.success) {
      setPolicy(result.data);
    } else {
      setPolicy(previous);
      setError(result.error || 'Failed to save agent settings');
    }
    setSavingKey(null);
  };

  const handleModeChange = (mode: AutonomyMode) => {
    if (!policy || policy.mode === mode) return;
    void savePolicy(
      { mode },
      `mode:${mode}`,
      (current) => ({ ...current, mode }),
    );
  };

  const handleEnabledChange = (enabled: boolean) => {
    if (!policy || policy.enabled === enabled) return;
    void savePolicy(
      { enabled },
      'enabled',
      (current) => ({ ...current, enabled }),
    );
  };

  const availableModes = new Set(policy?.modes ?? AUTONOMY_MODE_OPTIONS.map((option) => option.mode));
  const busy = loading || !!savingKey;

  return (
    <SectionPanel title="Agent" subtitle="Choose how independently the agent works and recovers.">
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <SettingsCard>
        <SettingsRow
          label="Autonomous recovery"
          description="Lets the agent continue background work, retry recoverable failures, and resume safe steps even when the desktop is closed."
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
          ) : (
            <Toggle
              checked={policy?.enabled ?? true}
              disabled={!!savingKey}
              onChange={handleEnabledChange}
            />
          )}
        </SettingsRow>

        <div className="px-4 py-3.5">
          <div className="mb-3">
            <h3 className="text-[13px] font-medium">Autonomy mode</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">
              Pick how much judgment the agent can use before asking you.
            </p>
          </div>

          <div className="grid gap-2">
            {AUTONOMY_MODE_OPTIONS.map((option) => {
              const selected = policy?.mode === option.mode;
              const unavailable = !availableModes.has(option.mode);
              const disabled = busy || unavailable;
              const savingThis = savingKey === `mode:${option.mode}`;

              return (
                <button
                  key={option.mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleModeChange(option.mode)}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors disabled:cursor-default ${
                    selected
                      ? 'border-[var(--color-accent)] bg-black/[0.03] dark:bg-white/[0.05]'
                      : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.035] hover:bg-black/[0.04] dark:hover:bg-white/[0.055]'
                  } ${disabled && !selected ? 'opacity-55' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold">{option.label}</span>
                        {option.mode === 'standard' && (
                          <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-text)] opacity-80 mt-1 leading-snug">
                        {option.summary}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-1 leading-snug">
                        {option.detail}
                      </p>
                    </div>
                    <div className="mt-0.5 w-5 h-5 shrink-0 rounded-full border border-black/10 dark:border-white/15 flex items-center justify-center">
                      {savingThis ? (
                        <Loader2 className="w-3 h-3 animate-spin text-[var(--color-accent)]" />
                      ) : selected ? (
                        <Check className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {policy?.enabled === false && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/15 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Autonomous recovery is off. The selected mode will apply when recovery is enabled again.</span>
            </div>
          )}
        </div>
      </SettingsCard>
    </SectionPanel>
  );
}

// ── Connections Section ──

const SLACK_OAUTH_URL = 'https://slack.com/oauth/v2/authorize?client_id=10603607090582.10618588079921&scope=app_mentions:read,im:read,im:write,im:history,chat:write,files:write,reactions:read,reactions:write,channels:read,channels:history,users:read,users:read.email&user_scope=';

type AuthType = 'oauth' | 'api-key' | 'bearer' | 'basic' | 'no-auth' | 'custom';

interface ConnectionDef {
  slug: string;
  name: string;
  description: string;
  authType?: AuthType;
}

const DEFAULT_COMPOSIO_INTEGRATIONS: ConnectionDef[] = [
  { slug: 'gmail', name: 'Gmail', description: 'Read, compose, and manage email.', authType: 'oauth' },
  { slug: 'googledrive', name: 'Google Drive', description: 'Access and organize cloud files.', authType: 'oauth' },
  { slug: 'googledocs', name: 'Google Docs', description: 'Create and edit documents.', authType: 'oauth' },
  { slug: 'googlesheets', name: 'Google Sheets', description: 'Manage spreadsheets and formulas.', authType: 'oauth' },
  { slug: 'googlecalendar', name: 'Google Calendar', description: 'Manage events and scheduling.', authType: 'oauth' },
  { slug: 'github', name: 'GitHub', description: 'Manage repos, issues, and pull requests.', authType: 'oauth' },
];

/** Toolkits we offer through built-in integrations — hide them from composio results
 *  so users don't try to connect them via composio's managed OAuth (which doesn't exist). */
const BUILTIN_COMPOSIO_SLUGS = new Set(['slack', 'telegram']);

/** Check if a toolkit is available for the user's plan. */
function isToolkitAvailableForPlan(slug: string, plan: string): boolean {
  void slug;
  void plan;
  return true; // All integrations available to all plans
}

/** Map raw Composio auth_schemes (and no_auth flag) to a single normalized AuthType. */
function inferAuthType(schemes?: string[], noAuth?: boolean): AuthType | undefined {
  if (noAuth) return 'no-auth';
  if (!schemes || schemes.length === 0) return undefined;
  const set = new Set(schemes.map((s) => String(s).toUpperCase()));
  if (set.has('OAUTH2') || set.has('OAUTH1')) return 'oauth';
  if (set.has('API_KEY')) return 'api-key';
  if (set.has('BEARER_TOKEN')) return 'bearer';
  if (set.has('BASIC')) return 'basic';
  if (set.has('NO_AUTH')) return 'no-auth';
  return 'custom';
}

const AUTH_BADGE_CONFIG: Record<AuthType, { label: string; className: string }> = {
  oauth:      { label: 'OAuth',      className: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  'api-key':  { label: 'API Key',    className: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  bearer:     { label: 'Token',      className: 'bg-purple-500/15 text-purple-300 border-purple-500/20' },
  basic:      { label: 'Basic',      className: 'bg-slate-500/15 text-slate-300 border-slate-500/20' },
  'no-auth':  { label: 'No Auth',    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  custom:     { label: 'Custom',     className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
};

function AuthBadge({ type }: { type: AuthType }) {
  const c = AUTH_BADGE_CONFIG[type];
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full uppercase tracking-wide border ${c.className}`}>
      {c.label}
    </span>
  );
}

function ConnectionsSection() {
  const userPlan = useAuthStore((s) => s.user?.plan);

  // Slack state
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackTeamName, setSlackTeamName] = useState('');
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackDisconnecting, setSlackDisconnecting] = useState(false);

  // Telegram state
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramLinkUrl, setTelegramLinkUrl] = useState<string | null>(null);
  const [telegramGenerating, setTelegramGenerating] = useState(false);
  const [telegramDisconnecting, setTelegramDisconnecting] = useState(false);
  const [telegramPolling, setTelegramPolling] = useState(false);
  const [telegramWidgetReady, setTelegramWidgetReady] = useState(false);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const telegramWidgetRef = useRef<HTMLDivElement>(null);

  // Composio state
  const [composioConnected, setComposioConnected] = useState<Set<string>>(new Set());
  const [composioLoading, setComposioLoading] = useState(true);
  const [composioPending, setComposioPending] = useState<string | null>(null);
  const [expandedComposio, setExpandedComposio] = useState<string | null>(null);
  const [composioDetails, setComposioDetails] = useState<Record<string, {
    tools: Array<{ slug: string; name: string; description: string }>;
    toolsCount: number;
    loading: boolean;
  }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ slug: string; name: string; description: string; logo?: string; auth_schemes?: string[]; no_auth?: boolean }>>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // When non-null, the row for this slug is expanded with the auth-scheme picker.
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const refreshComposio = useCallback(async () => {
    try {
      const r = await getComposioConnected();
      if (r.success && r.data?.connected) {
        setComposioConnected(new Set(r.data.connected.map((a) => a.toolkit)));
      }
    } catch { /* ignore */ }
    finally {
      setComposioLoading(false);
    }
  }, []);

  // Check status on mount
  useEffect(() => {
    (async () => {
      try {
        const [configRes, statusRes] = await Promise.all([getSlackConfigured(), getSlackStatus()]);
        if (configRes.success) setSlackConfigured(configRes.data.configured);
        if (statusRes.success) {
          setSlackConnected(statusRes.data.connected);
          setSlackTeamName(statusRes.data.teamName || '');
        }
      } catch { /* ignore */ }
      setSlackLoading(false);
    })();

    (async () => {
      try {
        const res = await getTelegramStatus();
        if (res.success) {
          setTelegramConnected(res.data.connected);
          setTelegramBotUsername(res.data.botUsername || '');
        }
      } catch { /* ignore */ }
      setTelegramLoading(false);
    })();

    refreshComposio();
  }, [refreshComposio]);

  // Telegram polling
  useEffect(() => {
    if (!telegramPolling || telegramConnected) return;
    const interval = setInterval(async () => {
      const status = await getTelegramStatus();
      if (status.success && status.data.connected) {
        setTelegramPolling(false);
        setTelegramLinkUrl(null);
        setTelegramConnected(true);
        setTelegramBotUsername(status.data.botUsername || '');
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [telegramPolling, telegramConnected]);

  // Listen for auth popup completion via BroadcastChannel + postMessage + focus
  useEffect(() => {
    const refreshSlack = () => {
      getSlackStatus().then(r => {
        if (r.success) {
          setSlackConnected(r.data.connected);
          if (r.data.teamName) setSlackTeamName(r.data.teamName);
        }
      });
      setSlackConnecting(false);
    };

    const handleOAuthCallback = (params: Record<string, string>) => {
      if (params.slack === 'connected') refreshSlack();
      if (params.telegram === 'connected') {
        getTelegramStatus().then(r => {
          if (r.success) setTelegramConnected(r.data.connected);
        });
      }
    };

    // BroadcastChannel listener (works even when window.opener is null)
    let oauthChannel: BroadcastChannel | null = null;
    try {
      oauthChannel = new BroadcastChannel('construct:oauth');
      oauthChannel.onmessage = (e) => {
        if (e.data?.type === 'construct:oauth-callback') {
          handleOAuthCallback(e.data.params || {});
        }
      };
    } catch { /* not supported */ }

    // postMessage listener (direct parent-child)
    const messageHandler = (e: MessageEvent) => {
      if (e.data?.type === 'slack_auth_complete' && e.data.success) refreshSlack();
      if (e.data?.type === 'construct:oauth-callback') handleOAuthCallback(e.data.params || {});
      if (e.data?.type === 'composio:connected') {
        composioFinalize().finally(() => {
          refreshComposio();
          setComposioPending(null);
        });
      }
    };

    // Focus listener (fallback: refresh when popup closes)
    const focusHandler = () => refreshSlack();

    window.addEventListener('message', messageHandler);
    window.addEventListener('focus', focusHandler);
    return () => {
      window.removeEventListener('message', messageHandler);
      window.removeEventListener('focus', focusHandler);
      oauthChannel?.close();
    };
  }, [refreshComposio]);

  // Slack handlers
  const handleSlackConnect = async () => {
    setError(null);
    if (slackConfigured) {
      setSlackConnecting(true);
      const result = await getSlackInstallUrl();
      setSlackConnecting(false);
      if (result.success && result.data.url) {
        openAuthRedirect(result.data.url);
      } else {
        setError(result.success ? (result.data.error || 'Unknown error') : result.error);
      }
    } else {
      openAuthRedirect(SLACK_OAUTH_URL);
    }
  };

  const handleSlackDisconnect = async () => {
    setSlackDisconnecting(true);
    await disconnectSlack();
    setSlackDisconnecting(false);
    setSlackConnected(false);
    setSlackTeamName('');
  };

  // Telegram Login Widget — inject the widget script when user clicks "Connect"
  const handleTelegramConnect = async () => {
    setError(null);
    setTelegramGenerating(true);

    // First, get the bot username
    const botInfo = await getTelegramBotInfo();
    if (!botInfo.success || !botInfo.data.botUsername) {
      setError('Could not fetch bot info');
      setTelegramGenerating(false);
      return;
    }

    setTelegramBotUsername(botInfo.data.botUsername);
    setTelegramWidgetReady(true);
    setTelegramGenerating(false);
  };

  // Load the Telegram Login Widget when ready
  useEffect(() => {
    if (!telegramWidgetReady || !telegramBotUsername || !telegramWidgetRef.current) return;

    // Clear any previous widget
    telegramWidgetRef.current.innerHTML = '';

    // Inject Telegram Login Widget script
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', telegramBotUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramWidgetAuth(user)');
    script.async = true;

    // Set up the global callback
    window.onTelegramWidgetAuth = async (user: TelegramWidgetUser) => {
      setTelegramLinking(true);
      const result = await telegramLoginWidget(user);
      setTelegramLinking(false);

      if (result.success) {
        setTelegramConnected(true);
        setTelegramWidgetReady(false);
        setTelegramBotUsername(telegramBotUsername);
      } else {
        setError(result.error || 'Failed to link Telegram account');
        setTelegramWidgetReady(false);
      }
    };

    telegramWidgetRef.current.appendChild(script);

    return () => {
      delete window.onTelegramWidgetAuth;
    };
  }, [telegramWidgetReady, telegramBotUsername]);

  // Fallback: deep link flow (if Login Widget doesn't work)
  const handleTelegramDeepLink = async () => {
    setError(null);
    setTelegramWidgetReady(false); // hide widget so telegramLinkUrl view takes over
    setTelegramGenerating(true);
    const result = await getTelegramLinkUrl();
    setTelegramGenerating(false);
    if (result.success) {
      setTelegramLinkUrl(result.data.url);
      setTelegramPolling(true);
    } else {
      setError(result.error);
    }
  };

  const handleTelegramDisconnect = async () => {
    setTelegramDisconnecting(true);
    await disconnectTelegram();
    setTelegramDisconnecting(false);
    setTelegramConnected(false);
    setTelegramBotUsername('');
    setTelegramLinkUrl(null);
    setTelegramWidgetReady(false);
  };

  // Composio handlers
  const runComposioSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const r = await searchComposioToolkits(q.trim());
      if (r.success && r.data?.toolkits) {
        setSearchResults(r.data.toolkits);
      }
    } catch { /* ignore */ }
    setSearching(false);
  }, []);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => runComposioSearch(q), 350);
  };

  // Clicking "Connect" on a Composio row opens the multi-scheme picker inline.
  // The picker (ComposioAuthPanel) decides between OAuth, API key, bearer, basic,
  // or NO_AUTH based on what the toolkit actually supports.
  const handleComposioConnect = (slug: string) => {
    setError(null);
    setConnectingSlug(slug);
    setExpandedComposio(slug);
  };

  const handleComposioConnected = async (slug: string) => {
    setConnectingSlug((cur) => (cur === slug ? null : cur));
    await refreshComposio();
  };

  const handleComposioDisconnect = async (slug: string) => {
    setComposioPending(slug);
    await disconnectComposio(slug);
    setComposioConnected((prev) => { const next = new Set(prev); next.delete(slug); return next; });
    setComposioPending(null);
  };

  // Build full list: Slack + Telegram + composio defaults + extras
  const defaultSlugs = new Set(DEFAULT_COMPOSIO_INTEGRATIONS.map((d) => d.slug));
  const extraConnected: ConnectionDef[] = [...composioConnected]
    .filter((s) => !defaultSlugs.has(s))
    .map((s) => ({ slug: s, name: s.charAt(0).toUpperCase() + s.slice(1), description: 'Connected integration.' }));
  const composioList = [...DEFAULT_COMPOSIO_INTEGRATIONS, ...extraConnected];
  const filteredSearchResults = searchResults.filter(
    (r) => !defaultSlugs.has(r.slug) && !BUILTIN_COMPOSIO_SLUGS.has(r.slug.toLowerCase()),
  );

  return (
    <SectionPanel title="Connections" subtitle="Connect your agent to messaging platforms and third-party services.">
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Built-in integrations (Slack, Telegram) ── */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <MessageCircle className="w-4 h-4 text-[var(--color-text-muted)]" />
        <span className="text-[13px] font-semibold">Built-in</span>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] mb-3 px-1 leading-snug">
        Chat with your agent on the messaging platforms you already use.
      </p>
      <SettingsCard>
        {/* Slack row */}
        <ConnectionRow
          icon={<PlatformIcon platform="slack" size={20} />}
          name="Slack"
          description={
            slackConnected
              ? `Connected to ${slackTeamName || 'workspace'}`
              : 'Connect your agent to a Slack workspace.'
          }
          authType="oauth"
          isConnected={slackConnected}
          isPending={slackConnecting || slackDisconnecting}
          isLoading={slackLoading}
          onConnect={handleSlackConnect}
          onDisconnect={handleSlackDisconnect}
        />

        {/* Telegram row */}
        <ConnectionRow
          icon={<PlatformIcon platform="telegram" size={20} />}
          name="Telegram"
          description={
            telegramConnected
              ? `Linked via @${telegramBotUsername || 'bot'}`
              : 'Chat with your agent directly in Telegram.'
          }
          authType="oauth"
          isConnected={telegramConnected}
          isPending={telegramGenerating || telegramDisconnecting || telegramLinking}
          isLoading={telegramLoading}
          onConnect={handleTelegramConnect}
          onDisconnect={handleTelegramDisconnect}
          isLast
          expanded={
            !telegramConnected && (telegramWidgetReady || telegramLinkUrl) ? (
              <TelegramExpanded
                widgetReady={telegramWidgetReady}
                widgetRef={telegramWidgetRef}
                linkUrl={telegramLinkUrl}
                generating={telegramGenerating}
                onUseDeepLink={handleTelegramDeepLink}
              />
            ) : null
          }
        />
      </SettingsCard>

      {/* ── Third-party integrations (Composio) ── */}
      <div className="h-6" />
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <Plug className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-[13px] font-semibold">Integrations</span>
        </div>
        <button
          type="button"
          onClick={() => {
            import('@/stores/windowStore').then(({ useWindowStore }) => {
              useWindowStore.getState().openWindow('app-registry', {
                title: 'App Store',
                metadata: { view: 'integrations' },
              });
            });
          }}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-[7px] bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.07] dark:hover:bg-white/[0.09] transition-colors"
        >
          Browse all
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] mb-3 px-1 leading-snug">
        Connect services your agent can use from chat. Browse the App Store for the full integration catalog.
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search for more integrations (Notion, Linear, Discord...)"
          className="w-full text-[12px] pl-9 pr-3 py-2 rounded-[8px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:border-[var(--color-accent)]/40 placeholder:text-[var(--color-text-muted)]"
        />
      </div>

      {/* Inline hints — never replace the list with an empty state */}
      {(() => {
        const isSearchActive = searchQuery.trim().length >= 2;
        const hasSearchResults = filteredSearchResults.length > 0;
        const showResults = isSearchActive && hasSearchResults;

        return (
          <>
            {isSearchActive && searching && (
              <div className="flex items-center gap-2 mb-2 px-1 text-[11px] text-[var(--color-text-muted)]">
                <Loader2 className="w-3 h-3 animate-spin" /> Searching...
              </div>
            )}
            {isSearchActive && !searching && !hasSearchResults && (
              <p className="text-[11px] text-[var(--color-text-muted)] mb-2 px-1">
                No matches for &quot;{searchQuery.trim()}&quot;. Showing suggestions instead.
              </p>
            )}

            <SettingsCard className="mb-2">
              {showResults ? (
                filteredSearchResults.slice(0, 10).map((r, i) => {
                  const at = inferAuthType(r.auth_schemes, r.no_auth);
                  const isItemExpanded = expandedComposio === r.slug;
                  const isConnecting = connectingSlug === r.slug && !composioConnected.has(r.slug);
                  const isAvailable = isToolkitAvailableForPlan(r.slug, userPlan || 'free');
                  return (
                    <ConnectionRow
                      key={r.slug}
                      icon={
                        <PlatformIcon platform={r.slug} logoUrl={r.logo} size={20} />
                      }
                      name={getPlatformDisplayName(r.slug, r.name)}
                      description={r.description || r.slug}
                      authType={at}
                      isConnected={composioConnected.has(r.slug)}
                      isPending={composioPending === r.slug}
                      disabled={!isAvailable}
                      disabledReason={!isAvailable ? 'Upgrade to Starter or Pro to connect this integration' : undefined}
                      onConnect={() => handleComposioConnect(r.slug)}
                      onDisconnect={() => handleComposioDisconnect(r.slug)}
                      isLast={i === Math.min(filteredSearchResults.length, 10) - 1}
                      onToggleExpand={() => {
                        const willExpand = !isItemExpanded;
                        setExpandedComposio(willExpand ? r.slug : null);
                        if (!willExpand && isConnecting) setConnectingSlug(null);
                        if (willExpand && !composioDetails[r.slug] && !isConnecting) {
                          setComposioDetails(prev => ({ ...prev, [r.slug]: { ...prev[r.slug], loading: true } }));
                          getComposioToolkitDetail(r.slug).then(res => {
                            if (res.success && res.data) {
                              setComposioDetails(prev => ({
                                ...prev,
                                [r.slug]: {
                                  tools: res.data.tools.slice(0, 20),
                                  toolsCount: res.data.tools_count,
                                  loading: false
                                }
                              }));
                            } else {
                              setComposioDetails(prev => ({ ...prev, [r.slug]: { tools: [], toolsCount: 0, loading: false } }));
                            }
                          }).catch(() => {
                            setComposioDetails(prev => ({ ...prev, [r.slug]: { tools: [], toolsCount: 0, loading: false } }));
                          });
                        }
                      }}
                      isExpanded={isItemExpanded}
                      expanded={
                        isConnecting ? (
                          <div className="pt-3 pl-[40px]">
                            <ComposioAuthPanel slug={r.slug} onConnected={() => handleComposioConnected(r.slug)} />
                          </div>
                        ) : isItemExpanded ? (
                          <div className="pt-3 pl-[40px]">
                            {composioDetails[r.slug]?.loading ? (
                              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading tools...
                              </div>
                            ) : composioDetails[r.slug]?.toolsCount ? (
                              <div>
                                <div className="text-[11px] text-[var(--color-text-muted)] mb-2">
                                  Tools ({composioDetails[r.slug].toolsCount}):
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {composioDetails[r.slug].tools.slice(0, 7).map(tool => (
                                    <span
                                      key={tool.slug}
                                      title={tool.description}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] bg-white/5 text-white/80 rounded border border-white/10 hover:bg-white/10 transition-colors"
                                    >
                                      <span className="w-1 h-1 rounded-full bg-[var(--color-accent)]"></span>
                                      {tool.name}
                                    </span>
                                  ))}
                                  {composioDetails[r.slug].toolsCount > 7 && (
                                    <span className="inline-flex items-center px-2 py-0.5 text-[9px] text-white/40">
                                      +{composioDetails[r.slug].toolsCount - 7} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-[var(--color-text-muted)]">No tools available</div>
                            )}
                          </div>
                        ) : null
                      }
                    />
                  );
                })
              ) : composioLoading ? (
                <div className="flex items-center gap-2 px-4 py-4 text-[11px] text-[var(--color-text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking integrations...
                </div>
              ) : (
                composioList.map((def, i) => {
                  const isItemExpanded = expandedComposio === def.slug;
                  const isConnecting = connectingSlug === def.slug && !composioConnected.has(def.slug);
                  const isAvailable = isToolkitAvailableForPlan(def.slug, userPlan || 'free');
                  return (
                    <ConnectionRow
                      key={def.slug}
                      icon={
                        <PlatformIcon platform={def.slug} size={20} />
                      }
                      name={getPlatformDisplayName(def.slug, def.name)}
                      description={def.description}
                      authType={def.authType}
                      isConnected={composioConnected.has(def.slug)}
                      isPending={composioPending === def.slug}
                      disabled={!isAvailable}
                      disabledReason={!isAvailable ? 'Upgrade to Starter or Pro to connect this integration' : undefined}
                      onConnect={() => handleComposioConnect(def.slug)}
                      onDisconnect={() => handleComposioDisconnect(def.slug)}
                      isLast={i === composioList.length - 1}
                      onToggleExpand={() => {
                        const willExpand = !isItemExpanded;
                        setExpandedComposio(willExpand ? def.slug : null);
                        if (!willExpand && isConnecting) setConnectingSlug(null);
                        // Fetch details when expanding
                        if (willExpand && !composioDetails[def.slug] && !isConnecting) {
                          setComposioDetails(prev => ({ ...prev, [def.slug]: { ...prev[def.slug], loading: true } }));
                          getComposioToolkitDetail(def.slug).then(r => {
                            if (r.success && r.data) {
                              setComposioDetails(prev => ({
                                ...prev,
                                [def.slug]: {
                                  tools: r.data.tools.slice(0, 20),
                                  toolsCount: r.data.tools_count,
                                  loading: false
                                }
                              }));
                            } else {
                              setComposioDetails(prev => ({ ...prev, [def.slug]: { tools: [], toolsCount: 0, loading: false } }));
                            }
                          }).catch(() => {
                            setComposioDetails(prev => ({ ...prev, [def.slug]: { tools: [], toolsCount: 0, loading: false } }));
                          });
                        }
                      }}
                      isExpanded={isItemExpanded}
                      expanded={
                        isConnecting ? (
                          <div className="pt-3 pl-[40px]">
                            <ComposioAuthPanel slug={def.slug} onConnected={() => handleComposioConnected(def.slug)} />
                          </div>
                        ) : isItemExpanded ? (
                          <div className="pt-3 pl-[40px]">
                            {composioDetails[def.slug]?.loading ? (
                              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading tools...
                              </div>
                            ) : composioDetails[def.slug]?.toolsCount ? (
                              <div>
                                <div className="text-[11px] text-[var(--color-text-muted)] mb-2">
                                  Tools ({composioDetails[def.slug].toolsCount}):
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {composioDetails[def.slug].tools.slice(0, 7).map(tool => (
                                    <span
                                      key={tool.slug}
                                      title={tool.description}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] bg-white/5 text-white/80 rounded border border-white/10 hover:bg-white/10 transition-colors"
                                    >
                                      <span className="w-1 h-1 rounded-full bg-[var(--color-accent)]"></span>
                                      {tool.name}
                                    </span>
                                  ))}
                                  {composioDetails[def.slug].toolsCount > 7 && (
                                    <span className="inline-flex items-center px-2 py-0.5 text-[9px] text-white/40">
                                      +{composioDetails[def.slug].toolsCount - 7} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-[var(--color-text-muted)]">No tools available</div>
                            )}
                          </div>
                        ) : null
                      }
                    />
                  );
                })
              )}
            </SettingsCard>
          </>
        );
      })()}
    </SectionPanel>
  );
}

// ── Shared connection row used by all rows in ConnectionsSection ──

function ConnectionRow({
  icon, name, description, authType, isConnected, isPending, isLoading, disabled, disabledReason,
  onConnect, onDisconnect, expanded, isLast, onToggleExpand, isExpanded,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  authType?: AuthType;
  isConnected: boolean;
  isPending: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  expanded?: React.ReactNode;
  isLast?: boolean;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
}) {
  const expandable = onToggleExpand !== undefined;
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  return (
    <div className={!isLast ? 'border-b border-black/[0.06] dark:border-white/[0.06]' : ''}>
      <div className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
        <div className="w-[28px] h-[28px] rounded-[6px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {icon}
        </div>
        <button
          onClick={expandable ? onToggleExpand : undefined}
          className={`flex-1 min-w-0 text-left ${expandable ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-medium truncate">{name}</span>
            {isConnected && (
              <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-px rounded-full uppercase tracking-wide">
                Connected
              </span>
            )}
            {disabled && (
              <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-px rounded-full uppercase tracking-wide border border-amber-400/20">
                Pro
              </span>
            )}
            {authType && <AuthBadge type={authType} />}
          </div>
          <p className={`text-[11px] text-[var(--color-text-muted)] mt-0.5 ${isExpanded ? 'whitespace-normal' : 'truncate'}`}>{description}</p>
        </button>
        <div className="flex-shrink-0">
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin text-[var(--color-text-muted)]" />
          ) : isConnected ? (
            <button
              onClick={onDisconnect}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
              Disconnect
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={disabled ? () => setShowTooltip(!showTooltip) : onConnect}
                onMouseEnter={() => disabled && setShowTooltip(true)}
                onMouseLeave={() => disabled && setShowTooltip(false)}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 disabled:opacity-40 transition-colors"
              >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                {disabled ? 'Upgrade' : 'Connect'}
              </button>
              {disabled && showTooltip && disabledReason && (
                <div
                  ref={tooltipRef}
                  className="absolute right-0 top-full mt-2 z-50 w-[220px] p-3 rounded-lg bg-zinc-900 border border-zinc-700 shadow-2xl"
                >
                  <p className="text-[11px] text-white leading-snug">
                    {disabledReason}
                  </p>
                  <div className="absolute -top-1 right-4 w-2 h-2 bg-zinc-900 border-t border-l border-zinc-700 rotate-45 transform" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 -mt-1">{expanded}</div>
      )}
    </div>
  );
}

function TelegramExpanded({
  widgetReady, widgetRef, linkUrl, generating, onUseDeepLink,
}: {
  widgetReady: boolean;
  widgetRef: React.RefObject<HTMLDivElement | null>;
  linkUrl: string | null;
  generating: boolean;
  onUseDeepLink: () => void;
}) {
  if (widgetReady) {
    return (
      <div className="space-y-2 pl-[40px]">
        <div ref={widgetRef} />
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Click the button above to sign in with your Telegram account.
        </p>
        <button
          onClick={onUseDeepLink}
          disabled={generating}
          className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <Send className="w-2.5 h-2.5" />
          Or link via bot message instead
        </button>
      </div>
    );
  }
  if (linkUrl) {
    const match = linkUrl.match(/t\.me\/([^?]+)\?start=(.+)/);
    return (
      <div className="space-y-2 pl-[40px]">
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#2AABEE] hover:text-[#2AABEE]/80 transition-colors"
        >
          <Send className="w-3 h-3" />
          Open in Telegram
        </a>
        {match && (() => {
          const [, botUser, code] = match;
          const command = `/start ${code}`;
          return (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--color-text-muted)]">
                Or send this to <a href={`https://t.me/${botUser}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#2AABEE] hover:underline">@{botUser}</a>:
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(command)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] transition-colors"
                title="Click to copy"
              >
                <code className="text-[10px] font-mono">{command}</code>
              </button>
            </div>
          );
        })()}
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Waiting for confirmation... (link expires in 10 minutes)
        </div>
      </div>
    );
  }
  return null;
}



// ── Customisation Section ──

function CustomisationSection() {
  const {
    wallpaperId,
    setWallpaper,
    soundEnabled,
    toggleSound,
    voiceAutoSend,
    setVoiceAutoSend,
  } = useSettingsStore();

  return (
    <SectionPanel title="Customisation" subtitle="Customise your desktop look, sound, and voice behavior.">
      {/* Theme toggle removed — dark mode is permanent */}

      {/* Wallpaper */}
      <div className="mt-5">
        <div className="flex items-center gap-2 mb-3">
          <Image className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-[13px] font-medium">Wallpaper</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {WALLPAPERS.map((wp) => {
            const isActive = wallpaperId === wp.id;
            return (
              <button
                key={wp.id}
                onClick={() => setWallpaper(wp.id)}
                className={`relative rounded-[10px] overflow-hidden transition-all duration-150 focus:outline-none ring-2 ${
                  isActive
                    ? 'ring-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)]'
                    : 'ring-transparent hover:ring-black/10 dark:hover:ring-white/10'
                }`}
              >
                <div
                  className="w-full aspect-[16/10]"
                  style={{
                    backgroundImage: `url(${getWallpaperSrc(wp.id)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-medium truncate"
                  style={{
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  {wp.name}
                </div>
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 w-[18px] h-[18px] rounded-full bg-[var(--color-accent)] flex items-center justify-center shadow">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}

          {/* Custom wallpaper upload tile */}
          <CustomWallpaperTile
            isActive={wallpaperId === 'custom'}
            onSelect={() => setWallpaper('custom')}
            onUpload={async (file) => {
              const ok = await saveCustomWallpaper(file);
              if (ok) setWallpaper('custom');
            }}
          />
        </div>
      </div>
      <div className="mt-6 pt-5 border-t border-black/6 dark:border-white/6">
        <div className="flex items-center gap-2 mb-3">
          <Volume2 className="w-4 h-4 text-text-muted" />
          <span className="text-[13px] font-medium">Sound</span>
        </div>
        <SettingsCard>
          <SettingsRow label="UI Sounds" description="Play sounds for clicks, notifications, and other actions.">
            <Toggle checked={soundEnabled} onChange={toggleSound} />
          </SettingsRow>
          <SettingsRow label="Voice Auto-Send" description="Automatically send transcribed voice messages instead of placing them in the input for review.">
            <Toggle checked={voiceAutoSend} onChange={setVoiceAutoSend} />
          </SettingsRow>
        </SettingsCard>
      </div>
    </SectionPanel>
  );
}

function CustomWallpaperTile({ isActive, onSelect, onUpload }: {
  isActive: boolean;
  onSelect: () => void;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const customSrc = (() => { try { return localStorage.getItem('construct:custom-wallpaper'); } catch { return null; } })();

  return (
    <button
      onClick={() => {
        if (customSrc) {
          onSelect();
        } else {
          inputRef.current?.click();
        }
      }}
      className={`relative rounded-[10px] overflow-hidden transition-all duration-150 focus:outline-none ring-2 ${
        isActive
          ? 'ring-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)]'
          : 'ring-transparent hover:ring-black/10 dark:hover:ring-white/10'
      }`}
    >
      {customSrc ? (
        <div
          className="w-full aspect-[16/10]"
          style={{ backgroundImage: `url(${customSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      ) : (
        <div className="w-full aspect-[16/10] flex items-center justify-center bg-white/5 border border-dashed border-white/20">
          <Upload className="w-5 h-5 text-white/30" />
        </div>
      )}
      <div
        className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-medium truncate flex items-center justify-between"
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', color: 'rgba(255,255,255,0.9)' }}
      >
        <span>Custom</span>
        {customSrc && (
          <span
            className="text-[9px] opacity-60 hover:opacity-100 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          >
            Change
          </span>
        )}
      </div>
      {isActive && (
        <div className="absolute top-1.5 right-1.5 w-[18px] h-[18px] rounded-full bg-[var(--color-accent)] flex items-center justify-center shadow">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </button>
  );
}

// ── Subscription Section ──

function SubscriptionSection() {
  const subscription = useBillingStore((s) => s.subscription);
  const openPortal = useBillingStore((s) => s.openPortal);
  const [portalLoading, setPortalLoading] = useState(false);

  const isNonProd = subscription?.environment === 'staging' || subscription?.environment === 'local';
  const canManageBilling = !isNonProd && !!subscription?.dodoSubscriptionId;

  const handleManageBilling = useCallback(async () => {
    setPortalLoading(true);
    try {
      const result = await openPortal();
      if ('url' in result) window.location.href = result.url;
    } finally {
      setPortalLoading(false);
    }
  }, [openPortal]);

  return (
    <SectionPanel
      title="Subscription"
      subtitle="Manage your plan and earn bonus credits."
      action={canManageBilling ? (
        <Button
          size="md"
          variant="default"
          onClick={handleManageBilling}
          disabled={portalLoading}
          className="shrink-0 gap-1.5"
        >
          {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Manage billing
        </Button>
      ) : undefined}
    >
      <BillingSection />
    </SectionPanel>
  );
}

// ── Usage Section ──

function formatModelPrice(value: number | null | undefined): string {
  if (value == null) return 'n/a';
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function platformPricingText(option: PlatformModelSettings['options'][number] | undefined): string {
  if (!option) return 'Input n/a / Output n/a / Cache n/a per 1M tokens';
  return `Input ${formatModelPrice(option.pricing.input)} / Output ${formatModelPrice(option.pricing.output)} / Cache ${formatModelPrice(option.pricing.cache)} per 1M tokens`;
}

function PlatformModelPickerCard() {
  const [platformModel, setPlatformModel] = useState<PlatformModelSettings | null>(null);
  const [platformModelLoading, setPlatformModelLoading] = useState(true);
  const [platformModelSaving, setPlatformModelSaving] = useState(false);
  const [platformModelError, setPlatformModelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlatformModelSettings().then((result) => {
      if (cancelled) return;
      if (result.success) {
        setPlatformModel(result.data);
        setPlatformModelError(null);
      } else {
        setPlatformModelError(result.error);
      }
      setPlatformModelLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handlePlatformModelChange = async (value: string) => {
    const nextModel = value === '__default__' ? null : value;
    setPlatformModelSaving(true);
    setPlatformModelError(null);
    const result = await updatePlatformModel(nextModel);
    if (result.success) {
      setPlatformModel(result.data);
    } else {
      setPlatformModelError(result.error);
    }
    setPlatformModelSaving(false);
  };

  if (!platformModelLoading && !platformModel?.enabled) return null;

  return (
    <div className="mt-6 pt-5 border-t border-black/[0.06] dark:border-white/[0.06]">
      <InfoCard>
        <div className="px-4 pt-3.5 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span className="text-[13px] font-medium">Primary Agent Model</span>
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
            Choose the platform model used for your main agent orchestration. OpenRouter BYOK models stay separate.
          </p>
          {platformModelLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading model access...
            </div>
          ) : platformModel?.enabled ? (
            <div className="space-y-3">
              <Select
                value={platformModel.selectedModel || '__default__'}
                onChange={handlePlatformModelChange}
                disabled={platformModelSaving}
                searchable
                options={[
                  {
                    value: '__default__',
                    label: `Default (${platformModel.defaultModel})`,
                    description: `Use the platform-optimized model stack. ${platformPricingText(platformModel.options.find((option) => option.id === platformModel.defaultModel))}`,
                  },
                  ...platformModel.options.map((option) => ({
                    value: option.id,
                    label: option.label,
                    description: `${option.provider} • ${Math.round(option.contextWindow / 1000)}k context${option.vision ? ' • vision' : ''}${option.reasoning ? ' • reasoning' : ''} • ${platformPricingText(option)}`,
                  })),
                ]}
              />
              <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-muted)]">
                <span>Effective model: <span className="font-mono">{platformModel.effectiveModel}</span></span>
                {platformModelSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              </div>
            </div>
          ) : null}
          {platformModelError && (
            <div className="flex items-start gap-2 text-[11px] text-red-600 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{platformModelError}</span>
            </div>
          )}
        </div>
      </InfoCard>
    </div>
  );
}

function UsageSectionWrapper() {
  return (
    <SectionPanel title="Usage" subtitle="AI usage, model selection, and storage statistics.">
      <UsageSection />
      <PlatformModelPickerCard />
      <div className="mt-6 pt-5 border-t border-black/[0.06] dark:border-white/[0.06]">
        <div className="mb-3">
          <h3 className="text-[14px] font-semibold">Bring your own OpenRouter key</h3>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
            Power fallback inference, or replace the platform AI entirely, with your own OpenRouter key.
          </p>
        </div>
        <ByokSection />
      </div>
    </SectionPanel>
  );
}

// ── Developer Section ──

function DeveloperSection() {
  const { developerMode, setDeveloperMode } = useSettingsStore();
  const { status, error, appInfo, devUrl, connect, disconnect, refreshTools } = useDevAppStore();

  const [urlInput, setUrlInput] = useState(devUrl || '');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    await connect(urlInput.trim());
  };

  const handleOpenApp = () => {
    import('@/stores/windowStore').then(({ useWindowStore }) => {
      useWindowStore.getState().openWindow('app', {
        title: appInfo?.name || 'Dev App',
        icon: appInfo?.iconUrl || undefined,
        metadata: { appId: 'dev-app' },
        width: 560,
        height: 620,
      });
    });
  };

  return (
    <SectionPanel title="Developer" subtitle="Tools for app development and testing.">
      <SettingsCard>
        <SettingsRow label="Developer Mode" description="Enable developer tools for building and testing Construct apps.">
          <Toggle checked={developerMode} onChange={setDeveloperMode} />
        </SettingsRow>
      </SettingsCard>

      {developerMode && (
        <div className="mt-4">
          <SettingsCard>
            <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="w-4 h-4 opacity-50" />
                <span className="text-[13px] font-medium">Connect Dev Server</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-snug">
                Run <code className="px-1 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] font-mono text-[10px]">wrangler dev</code> locally, then enter the URL to connect your app for testing.
              </p>
            </div>

            <div className="p-4">
              {status === 'connected' && appInfo ? (
                /* Connected state */
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      {appInfo.iconUrl ? (
                        <img src={appInfo.iconUrl} alt="" className="w-10 h-10 rounded-lg" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-black/[0.06] dark:bg-white/[0.06] flex items-center justify-center">
                          <Code2 className="w-5 h-5 opacity-40" />
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[var(--color-bg-secondary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium truncate">{appInfo.name}</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">dev</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] truncate">{appInfo.description}</p>
                    </div>
                    <span className="text-[11px] opacity-40 flex-shrink-0">{appInfo.tools.length} tool{appInfo.tools.length !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-[10px] font-mono text-[var(--color-text-muted)] opacity-60">{devUrl}</p>
                  {appInfo.tools.length > 0 && (
                    <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
                      {appInfo.tools.map((t) => (
                        <div key={t.name} className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06]">{t.name}</span>
                          {t.description && <span className="truncate opacity-60">{t.description}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleOpenApp}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
                    >
                      <Globe className="w-3 h-3" />
                      Open App
                    </button>
                    <button
                      onClick={refreshTools}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
                    >
                      Refresh Tools
                    </button>
                    <button
                      onClick={disconnect}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-colors ml-auto"
                    >
                      <Unplug className="w-3 h-3" />
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                /* Disconnected / validating / error state */
                <div className="space-y-3">
                  <form onSubmit={handleConnect} className="flex gap-2">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="http://localhost:8787"
                      disabled={status === 'validating'}
                      className="flex-1 px-3 py-1.5 text-[12px] font-mono rounded-md
                                 bg-black/[0.04] dark:bg-white/[0.06]
                                 border border-black/[0.08] dark:border-white/[0.08]
                                 text-[var(--color-text)] placeholder-black/30 dark:placeholder-white/30
                                 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/40
                                 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={status === 'validating' || !urlInput.trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold rounded-md
                                 bg-[var(--color-accent)] text-white
                                 hover:brightness-110
                                 disabled:opacity-50
                                 transition-all"
                    >
                      {status === 'validating' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Link2 className="w-3 h-3" />
                      )}
                      {status === 'validating' ? 'Connecting...' : 'Connect'}
                    </button>
                  </form>
                  {error && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-red-500/5 dark:bg-red-500/10 text-red-700 dark:text-red-300">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SettingsCard>

          <div className="mt-3 px-1">
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              Your app must serve <code className="px-1 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] font-mono text-[10px]">/mcp</code> (JSON-RPC) and <code className="px-1 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] font-mono text-[10px]">/health</code> endpoints. The agent will be able to call your app's tools while connected.
            </p>
          </div>
        </div>
      )}
    </SectionPanel>
  );
}
