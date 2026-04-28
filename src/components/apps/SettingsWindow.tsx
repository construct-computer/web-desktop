/**
 * Settings — macOS System Settings-style app with sidebar navigation.
 *
 * Sections:
 *   User         — Agent status, profile name, agent name, email
 *   Connections  — Slack + Telegram connect/disconnect
 *   Appearance   — Theme toggle, wallpaper picker
 *   Sound        — UI sounds toggle
 *   Subscription — Billing, usage, top-ups
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Link2, Paintbrush, Volume2, CreditCard,
  Image,
  Loader2, Check, AlertCircle, Unplug, Send, Save, ChevronRight,
  Code2, Upload, FileArchive, Mail, Lock, Globe, Search, Plug, MessageCircle,
  Zap,
} from 'lucide-react';
import { Button, Input, Label, Select } from '@/components/ui';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { getPlatformDisplayName } from '@/lib/platforms';
import { useSettingsStore, WALLPAPERS, getWallpaperSrc, saveCustomWallpaper } from '@/stores/settingsStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsNav, type SettingsSection } from '@/lib/settingsNav';
import { useIsMobile } from '@/hooks/useIsMobile';

import { openAuthRedirect } from '@/lib/utils';
import {
  getSlackConfigured, getSlackInstallUrl, getSlackStatus, disconnectSlack,
  getTelegramStatus, getTelegramLinkUrl, getTelegramBotInfo, telegramLoginWidget, disconnectTelegram,
  getAgentConfig, updateAgentConfig,
  getComposioConnected, composioFinalize, disconnectComposio, searchComposioToolkits,
  getComposioToolkitDetail,
} from '@/services/api';
import { ComposioAuthPanel } from './ComposioAuthPanel';
import { BillingSection } from './BillingSection';
import { ByokSection } from './ByokSection';
import { UsageSection } from './UsageSection';
import { useBillingStore } from '@/stores/billingStore';
import { getTimezoneOptions, getDetectedTimezone } from '@/lib/timezones';
import { hasPaidAccess } from '@/lib/plans';
// Dev app upload removed — apps are now hosted MCP servers
import { useAppStore } from '@/stores/appStore';
import { useDevAppStore } from '@/stores/devAppStore';
import type { WindowConfig } from '@/types';

// ── Types ──

type Section = SettingsSection;

interface SectionDef {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionDef[] = [
  { id: 'user', label: 'User', icon: User },
  { id: 'connections', label: 'Connections', icon: Link2 },
  { id: 'appearance', label: 'Appearance', icon: Paintbrush },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'usage', label: 'Usage', icon: Zap },
  { id: 'developer', label: 'Developer', icon: Code2 },
];

// ── macOS-style toggle switch ──

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-emerald-500' : 'bg-black/15 dark:bg-white/20'
      }`}
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

export function SettingsWindow({ config: _config }: { config: WindowConfig }) {
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
        {section === 'connections' && <ConnectionsSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'sound' && <SoundSection />}
        {section === 'subscription' && <SubscriptionSection />}
        {section === 'usage' && <UsageSectionWrapper />}
        {section === 'developer' && <DeveloperSection />}
      </div>
    </div>
  );
}

// ── Section wrapper ──

function SectionPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="px-7 py-6 max-w-[540px]">
      <h2 className="text-[22px] font-bold mb-1 tracking-tight">{title}</h2>
      {subtitle && <p className="text-[13px] text-[var(--color-text-muted)] mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-5" />}
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

// ── User Section ──

function UserSection() {
  const { user, updateProfile } = useAuthStore();
  const { computer, updateComputer, isLoading: computerLoading } = useComputerStore();
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
    if (computer?.config?.identityName) {
      setAgentName(computer.config.identityName);
    }
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
    if (existingEmail) {
      // Extract base username: "ankush@agents.construct.computer" → "ankush"
      const base = existingEmail.replace(/@.*$/, '');
      setEmailUsername(base);
    }
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
                @agents.construct.computer
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
function isToolkitAvailableForPlan(_slug: string, _plan: string): boolean {
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
  const isSubscribed = hasPaidAccess(userPlan);

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
    (window as any).onTelegramWidgetAuth = async (user: Record<string, string>) => {
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
      delete (window as any).onTelegramWidgetAuth;
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



// ── Appearance Section ──

function AppearanceSection() {
  const { theme, wallpaperId, toggleTheme, setWallpaper } = useSettingsStore();

  return (
    <SectionPanel title="Appearance" subtitle="Customize your desktop look and feel.">
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

// ── Sound Section ──

function SoundSection() {
  const { soundEnabled, toggleSound, voiceAutoSend, setVoiceAutoSend } = useSettingsStore();

  return (
    <SectionPanel title="Sound" subtitle="Configure audio feedback.">
      <SettingsCard>
        <SettingsRow label="UI Sounds" description="Play sounds for clicks, notifications, and other actions.">
          <Toggle checked={soundEnabled} onChange={toggleSound} />
        </SettingsRow>
        <SettingsRow label="Voice Auto-Send" description="Automatically send transcribed voice messages instead of placing them in the input for review.">
          <Toggle checked={voiceAutoSend} onChange={setVoiceAutoSend} />
        </SettingsRow>
      </SettingsCard>
    </SectionPanel>
  );
}

// ── Subscription Section ──

function SubscriptionSection() {
  return (
    <SectionPanel title="Subscription" subtitle="Manage your plan and earn bonus credits.">
      <BillingSection />
      <div className="mt-6 pt-5 border-t border-black/[0.06] dark:border-white/[0.06]">
        <div className="mb-3">
          <h3 className="text-[14px] font-semibold">Bring your own OpenRouter key</h3>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
            Power fall-back inference — or replace the platform AI entirely — with your own OpenRouter key.
          </p>
        </div>
        <ByokSection />
      </div>
    </SectionPanel>
  );
}

// ── Usage Section ──

function UsageSectionWrapper() {
  return (
    <SectionPanel title="Usage" subtitle="AI usage and storage statistics.">
      <UsageSection />
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
