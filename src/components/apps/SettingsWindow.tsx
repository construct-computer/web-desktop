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

import { useState, useEffect, useRef } from 'react';
import {
  User, Link2, Paintbrush, Volume2, CreditCard,
  Image,
  Loader2, Check, AlertCircle, Unplug, Send, Save, ChevronRight,
  Code2, Upload, FileArchive, Mail, Lock, Globe,
} from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useSettingsStore, WALLPAPERS, getWallpaperSrc, saveCustomWallpaper } from '@/stores/settingsStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';

import { openAuthRedirect } from '@/lib/utils';
import {
  getSlackConfigured, getSlackInstallUrl, getSlackStatus, disconnectSlack,
  getTelegramStatus, getTelegramLinkUrl, getTelegramBotInfo, telegramLoginWidget, disconnectTelegram,
  getAgentConfig, updateAgentConfig,
} from '@/services/api';
import { BillingSection } from './BillingSection';
import { useBillingStore } from '@/stores/billingStore';
import { getTimezoneOptions, getDetectedTimezone } from '@/lib/timezones';
// Dev app upload removed — apps are now hosted MCP servers
import { useAppStore } from '@/stores/appStore';
import { useDevAppStore } from '@/stores/devAppStore';
import type { WindowConfig } from '@/types';

// ── Types ──

type Section = 'user' | 'connections' | 'appearance' | 'sound' | 'subscription' | 'developer';

interface SectionDef {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionDef[][] = [
  // Group 1: System
  [
    { id: 'user', label: 'User', icon: User },
    { id: 'connections', label: 'Connections', icon: Link2 },
  ],
  // Group 2: Preferences
  [
    { id: 'appearance', label: 'Appearance', icon: Paintbrush },
    { id: 'sound', label: 'Sound', icon: Volume2 },
  ],
  // Group 3: Billing
  [
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
  ],
  // Group 4: Advanced
  [
    { id: 'developer', label: 'Developer', icon: Code2 },
  ],
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
  const [section, setSection] = useState<Section>('user');

  return (
    <div className="flex h-full text-[var(--color-text)] select-none">
      {/* Sidebar */}
      <div className="w-[180px] flex-shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] overflow-y-auto py-2 px-2">
        {SECTIONS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="my-1.5 mx-1" />}
            <div className="space-y-px">
              {group.map((s) => {
                const active = section === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSection(s.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-[5px] rounded-md text-[13px] transition-all duration-100 ${
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
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {section === 'user' && <UserSection />}
        {section === 'connections' && <ConnectionsSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'sound' && <SoundSection />}
        {section === 'subscription' && <SubscriptionSection />}
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

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
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

const AGENT_EMAIL_SUFFIX = '-agent';

function UserSection() {
  const { user, updateProfile } = useAuthStore();
  const { computer, updateComputer, isLoading: computerLoading } = useComputerStore();
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const isPro = subscription?.plan === 'pro';

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
      // Extract base username: "ankush-agent@construct.computer" → "ankush"
      let base = existingEmail.replace(/@(construct\.computer|agentmail\.to)$/i, '');
      base = base.replace(/-(agent|construct)(-\d+)?$/, (_m: string, _s: string, num: string) => num ?? '');
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

      // Include email username if not already set
      if (!emailLocked && emailUsername.trim()) {
        updateData.agentmailInboxUsername = `${emailUsername.trim()}${AGENT_EMAIL_SUFFIX}`;
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
          ) : !isPro ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-text-muted)]">Available on Pro plan</span>
              <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tracking-wide uppercase">Pro</span>
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
                {AGENT_EMAIL_SUFFIX}@construct.computer
              </span>
            </div>
          )}
        </SettingsRow>
      </SettingsCard>

      {/* Timezone */}
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mt-5 mb-1.5">Timezone</h3>
      <SettingsCard>
        <SettingsRow label="Timezone" noBorder>
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="bg-transparent text-[13px] outline-none cursor-pointer text-right max-w-[220px] truncate"
              style={{ color: 'var(--color-text)' }}
            >
              {getTimezoneOptions().map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
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

function ConnectionsSection() {
  const userPlan = useAuthStore((s) => s.user?.plan);
  const isSubscribed = userPlan === 'pro' || userPlan === 'starter';

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

  const [error, setError] = useState<string | null>(null);

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
  }, []);

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
  }, []);

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

  return (
    <SectionPanel title="Connections" subtitle="Connect your agent to messaging platforms.">
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Slack */}
      <SettingsCard>
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-[8px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
              <PlatformIcon platform="slack" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">Slack</span>
                {slackConnected && (
                  <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-px rounded-full uppercase tracking-wide">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                {slackConnected
                  ? `Connected to ${slackTeamName || 'workspace'}`
                  : 'Connect your agent to a Slack workspace'
                }
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3">
            {slackLoading ? (
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[12px]">Checking status...</span>
              </div>
            ) : slackConnected ? (
              <div className="space-y-2">
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  @mention the bot in any channel or DM it directly.
                </p>
                <button
                  onClick={handleSlackDisconnect}
                  disabled={slackDisconnecting}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                >
                  {slackDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={handleSlackConnect}
                  disabled={slackConnecting || !isSubscribed}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 disabled:opacity-40 transition-colors"
                >
                  {slackConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {isSubscribed ? 'Add to Slack' : 'Subscribe to connect'}
                </button>
              </div>
            )}
          </div>
        </div>
      </SettingsCard>

      <div className="h-3" />

      {/* Telegram */}
      <SettingsCard>
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-[8px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
              <PlatformIcon platform="telegram" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">Telegram</span>
                {telegramConnected && (
                  <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-px rounded-full uppercase tracking-wide">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                {telegramConnected
                  ? `Linked via @${telegramBotUsername || 'bot'}`
                  : 'Chat with your agent directly in Telegram'
                }
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3">
            {telegramLoading ? (
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[12px]">Checking status...</span>
              </div>
            ) : telegramConnected ? (
              <div className="space-y-2">
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  Send DMs or add the bot to groups and use /bind.
                </p>
                <button
                  onClick={handleTelegramDisconnect}
                  disabled={telegramDisconnecting}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                >
                  {telegramDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                  Disconnect
                </button>
              </div>
            ) : telegramLinking ? (
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[12px]">Linking account...</span>
              </div>
            ) : telegramWidgetReady ? (
              <div className="space-y-3">
                {/* Telegram Login Widget renders here */}
                <div ref={telegramWidgetRef} />

                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Click the button above to sign in with your Telegram account.
                </p>

                {/* Fallback: deep link */}
                <div className="border-t border-[var(--color-border)] pt-2.5 mt-2.5">
                  <button
                    onClick={handleTelegramDeepLink}
                    disabled={telegramGenerating}
                    className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    <Send className="w-3 h-3" />
                    Or link via bot message instead
                  </button>
                </div>
              </div>
            ) : telegramLinkUrl ? (
              <div className="space-y-3">
                <a
                  href={telegramLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2AABEE] hover:text-[#2AABEE]/80 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Open in Telegram
                </a>

                {/* Copyable /start command */}
                {(() => {
                  const match = telegramLinkUrl.match(/t\.me\/([^?]+)\?start=(.+)/);
                  if (!match) return null;
                  const [, botUser, code] = match;
                  const command = `/start ${code}`;
                  return (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        Or send this to <a href={`https://t.me/${botUser}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#2AABEE] hover:underline">@{botUser}</a>:
                      </p>
                      <button
                        onClick={() => navigator.clipboard.writeText(command)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] transition-colors cursor-pointer"
                        title="Click to copy"
                      >
                        <code className="text-[11px] font-mono">{command}</code>
                        <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Waiting for confirmation...
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  The link expires in 10 minutes.
                </p>
              </div>
            ) : (
              <button
                onClick={handleTelegramConnect}
                disabled={telegramGenerating || !isSubscribed}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 disabled:opacity-40 transition-colors"
              >
                {telegramGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {isSubscribed ? 'Connect Telegram' : 'Subscribe to connect'}
              </button>
            )}
          </div>
        </div>
      </SettingsCard>
    </SectionPanel>
  );
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
        <div className="grid grid-cols-3 gap-2.5">
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
    <SectionPanel title="Subscription" subtitle="Manage your billing and usage.">
      <BillingSection />
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
