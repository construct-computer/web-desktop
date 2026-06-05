import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Loader2, Check, AlertCircle, Unplug, Send, Save, ChevronRight,
  Mail, Lock, Globe, Search, Plug, MessageCircle,
} from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { getPlatformDisplayName } from '@/lib/platforms';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { useSettingsNav } from '@/lib/settingsNav';
import { AGENT_EMAIL_DOMAIN } from '@/lib/config';
import { stagingAgentEmailUsername } from '@/lib/agentEmail';
import { openAuthRedirect } from '@/lib/utils';
import {
  getSlackConfigured, getSlackInstallUrl, getSlackStatus, disconnectSlack,
  getTelegramStatus, getTelegramLinkUrl, getTelegramBotInfo, telegramLoginWidget, disconnectTelegram,
  checkAgentEmailAvailability,
  getAgentConfig, updateAgentConfig,
  getComposioConnected, composioFinalize, disconnectComposio, searchComposioToolkits,
  getComposioToolkitDetail,
  getAutopilotPolicy, updateAutopilotPolicy,
  type AutopilotPolicy,
} from '@/services/api';
import { ComposioAuthPanel } from '../ComposioAuthPanel';
import { getTimezoneOptions, getDetectedTimezone } from '@/lib/timezones';
import {
  SectionPanel, SettingsCard, SettingsRow, SettingsSubsection, Toggle,
} from './SettingsPrimitives';

type TelegramWidgetUser = Record<string, string>;

declare global {
  interface Window {
    onTelegramWidgetAuth?: (user: TelegramWidgetUser) => void | Promise<void>;
  }
}

function extractEmailBaseUsername(value: string): string {
  return value.replace(/@.*$/, '');
}

function formatEmailSuggestion(value: string): string {
  return `${extractEmailBaseUsername(value)}@${AGENT_EMAIL_DOMAIN}`;
}


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
  oauth:      { label: 'Sign in',    className: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
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


function ConstructIdentityPanel() {
  const user = useAuthStore((s) => s.user);
  const { computer, updateComputer } = useComputerStore();
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const setPendingSection = useSettingsNav((s) => s.setPendingSection);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const isPaid = subscription?.plan === 'pro' || subscription?.plan === 'starter';
  const isStagingEnv = subscription?.environment === 'staging';
  const stagingEmailUsername = stagingAgentEmailUsername(user?.email);

  const [agentName, setAgentName] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState('');
  const [emailSuggestion, setEmailSuggestion] = useState('');
  const [timezone, setTimezone] = useState(getDetectedTimezone());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const checkEmail = useCallback((username: string) => {
    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    const instanceId = computer?.id || '';
    if (!username || !instanceId) {
      setEmailAvailable(null);
      setEmailError('');
      setEmailSuggestion('');
      setEmailChecking(false);
      return;
    }
    if (isStagingEnv && username !== stagingEmailUsername) {
      setEmailAvailable(false);
      setEmailError(stagingEmailUsername
        ? `Use ${stagingEmailUsername}@${AGENT_EMAIL_DOMAIN} from your login email.`
        : 'Your account needs a login email before claiming a staging inbox.');
      setEmailSuggestion('');
      setEmailChecking(false);
      return;
    }
    if (!/^[a-z0-9][a-z0-9._+-]*[a-z0-9]$/.test(username) || username.length < 3) {
      setEmailAvailable(false);
      setEmailError('Use 3+ characters: letters, numbers, dots, hyphens, plus signs.');
      setEmailSuggestion('');
      setEmailChecking(false);
      return;
    }
    setEmailChecking(true);
    setEmailError('');
    setEmailSuggestion('');
    emailCheckTimer.current = setTimeout(async () => {
      const result = await checkAgentEmailAvailability(instanceId, username);
      setEmailChecking(false);
      if (result.success) {
        setEmailAvailable(result.data.available);
        if (!result.data.available) {
          setEmailError(result.data.reason || 'Username already taken');
          setEmailSuggestion(result.data.suggestion || '');
        }
      } else {
        setEmailAvailable(false);
        setEmailError(result.error || 'Could not check availability. Try again.');
        setEmailSuggestion('');
      }
    }, 400);
  }, [computer?.id, isStagingEnv, stagingEmailUsername]);

  useEffect(() => {
    if (!isPaid || emailLocked || !isStagingEnv) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setEmailUsername(stagingEmailUsername);
      if (stagingEmailUsername) {
        checkEmail(stagingEmailUsername);
      } else {
        setEmailAvailable(false);
        setEmailError('Your account needs a login email before claiming a staging inbox.');
        setEmailSuggestion('');
      }
    });
    return () => { cancelled = true; };
  }, [isPaid, emailLocked, isStagingEnv, stagingEmailUsername, checkEmail]);

  useEffect(() => {
    return () => {
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    };
  }, []);

  // Reset saved indicator after a delay
  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const handleSave = async () => {
    const selectedEmailUsername = isStagingEnv ? stagingEmailUsername : emailUsername.trim();
    const emailChanged = !emailLocked && isPaid && !!selectedEmailUsername;
    if (emailChanged && emailAvailable !== true) {
      setEmailError(emailChecking ? 'Wait for the availability check to finish.' : 'Check availability before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updateData: Parameters<typeof updateComputer>[0] = {
        agentName: agentName.trim() || 'Construct',
      };

      // Include email username only if not already set and user is on a paid plan.
      // (Backend also enforces this — belt-and-suspenders to avoid a 403 round-trip.)
      if (emailChanged) {
        updateData.agentmailInboxUsername = selectedEmailUsername;
      }

      // Save timezone to agent config
      const instanceId = computer?.id || '';
      if (instanceId) {
        await updateAgentConfig(instanceId, { timezone });
      }

      const computerResult = await updateComputer(updateData);
      if (computerResult.success) {
        setSaved(true);
      } else {
        if (emailChanged && computerResult.error) {
          setEmailAvailable(false);
          setEmailError(computerResult.error);
        }
        setError(computerResult.error || 'Failed to save some settings');
      }
    } catch {
      setError('Failed to save');
    }
    setSaving(false);
  };

  const selectedEmailUsername = isStagingEnv ? stagingEmailUsername : emailUsername.trim();
  const emailChanged = !emailLocked && isPaid && !!selectedEmailUsername;
  const canSave = (!emailChanged || (emailAvailable === true && !emailChecking));

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Construct — name + email */}
      <SettingsCard>
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5 block">Construct Name</label>
          <Input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Construct"
            className="!bg-transparent !border-0 !shadow-none !ring-0 !px-0 text-[13px] focus-visible:!ring-0"
          />
        </div>

        <SettingsRow label="Construct Email" info="A dedicated inbox Construct can use for business email when your plan includes it." noBorder>
          {emailLocked ? (
            <div className="settings-control-inline">
              <Mail className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="min-w-0 truncate text-[13px] text-[var(--color-text)]">{existingEmail}</span>
              <Lock className="w-3 h-3 text-[var(--color-text-muted)]" />
            </div>
          ) : !isPaid ? (
            <div className="settings-control-inline flex-wrap justify-end">
              <span className="min-w-0 text-[12px] text-[var(--color-text-muted)]">Available on paid plans</span>
              <button
                type="button"
                onClick={() => setPendingSection('billing')}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full
                  bg-emerald-500/15 text-emerald-600 dark:text-emerald-400
                  hover:bg-emerald-500/25 transition-colors"
              >
                Upgrade
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="w-full max-w-[320px] space-y-1">
              <div className="settings-email-control flex items-stretch gap-0 rounded-lg overflow-hidden border border-[var(--color-border)]">
                <Input
                  type="text"
                  value={emailUsername}
                  onChange={(e) => {
                    if (isStagingEnv) return;
                    const next = e.target.value.toLowerCase().replace(/[^a-z0-9._+-]/g, '');
                    setEmailUsername(next);
                    checkEmail(next);
                  }}
                  placeholder="yourname"
                  className="!border-0 !shadow-none !ring-0 text-[13px] !rounded-none !py-1.5 !px-2 bg-transparent min-w-[100px]"
                  disabled={isStagingEnv}
                />
                <span className="settings-email-domain text-[12px] text-[var(--color-text-muted)] px-2 bg-[var(--color-surface-raised)] border-l border-[var(--color-border)] py-1.5 whitespace-nowrap select-none">
                  @{AGENT_EMAIL_DOMAIN}
                </span>
              </div>
              <div className="min-h-[18px] text-[11px]">
                {emailChecking && (
                  <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                  </span>
                )}
                {!emailChecking && emailAvailable === true && emailUsername && (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5" /> {emailUsername}@{AGENT_EMAIL_DOMAIN} is available
                  </span>
                )}
                {!emailChecking && emailAvailable === false && (
                  <div className="flex flex-col gap-1 text-red-500">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {emailError}
                    </span>
                    {!isStagingEnv && emailSuggestion && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = extractEmailBaseUsername(emailSuggestion);
                          setEmailUsername(next);
                          checkEmail(next);
                        }}
                        className="text-left text-blue-500 hover:underline"
                      >
                        Try {formatEmailSuggestion(emailSuggestion)}?
                      </button>
                    )}
                  </div>
                )}
                {!emailChecking && emailAvailable === null && emailUsername && (
                  <span className="text-[var(--color-text-muted)]">
                    {isStagingEnv ? 'Staging uses your login email username.' : 'Choose carefully - this cannot be changed later.'}
                  </span>
                )}
              </div>
            </div>
          )}
        </SettingsRow>
      </SettingsCard>

      {/* Timezone */}
      <SettingsCard>
        <SettingsRow label="Timezone" noBorder>
          <div className="settings-control-inline max-w-[240px]">
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
      <div className="settings-action-row mt-4">
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className={`settings-primary-action inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-[7px] rounded-[7px] transition-all ${
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
    </div>
  );
}
function ConstructAutonomyPanel() {
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
        setError(result.error || 'Failed to load Construct settings');
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const savePolicy = async (
    update: { highAutonomyEnabled: boolean },
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
      setError(result.error || 'Failed to save Construct settings');
    }
    setSavingKey(null);
  };

  const highAutonomyEnabled = policy?.highAutonomyEnabled ?? true;
  const handleHighAutonomyChange = (enabled: boolean) => {
    if (!policy || highAutonomyEnabled === enabled) return;
    void savePolicy(
      { highAutonomyEnabled: enabled },
      'highAutonomyEnabled',
      (current) => ({ ...current, highAutonomyEnabled: enabled }),
    );
  };

  return (
    <>
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <SettingsCard>
        <SettingsRow
          label="High autonomy failsafe"
          info="Lets Construct continue routine trusted work without asking every time. It still asks before sensitive actions."
          description="When on, Construct can recover work and continue routine trusted actions by default."
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
          ) : (
            <Toggle
              checked={highAutonomyEnabled}
              disabled={!!savingKey}
              onChange={handleHighAutonomyChange}
            />
          )}
        </SettingsRow>

        <div className="px-4 py-3.5">
          <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.035] px-3 py-2.5">
            <h3 className="text-[13px] font-medium">Self-managed work</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-snug">
              Construct chooses how much it can do from the task, prior outcomes, and your saved preferences.
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-2 leading-snug">
              It still asks before credentials, destructive actions, payments or financial commitments, legal commitments, broad data exposure, or access from unknown or unauthorized people.
            </p>
          </div>

          {!loading && !highAutonomyEnabled && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/15 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>High autonomy is off. Recovery stays on, but Construct asks more often before actions outside your workspace.</span>
            </div>
          )}
        </div>
      </SettingsCard>
    </>
  );
}
function ConstructConnectionsPanel() {
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
    <>
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
        Chat with Construct on the messaging platforms you already use.
      </p>
      <SettingsCard>
        {/* Slack row */}
        <ConnectionRow
          icon={<PlatformIcon platform="slack" size={20} />}
          name="Slack"
          description={
            slackConnected
              ? `Connected to ${slackTeamName || 'workspace'}`
              : 'Connect Construct to a Slack workspace.'
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
              : 'Chat with Construct directly in Telegram.'
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
                title: 'Apps',
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
        Connect services Construct can use from chat. Browse Apps for the full catalog.
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search for more integrations (Notion, Linear, Discord...)"
          className="w-full text-[12px] pl-9 pr-3 py-2 rounded-[8px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] focus:outline-none placeholder:text-[var(--color-text-muted)]"
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
                          <div className="settings-expanded-indent pt-3 pl-[40px]">
                            <ComposioAuthPanel slug={r.slug} onConnected={() => handleComposioConnected(r.slug)} />
                          </div>
                        ) : isItemExpanded ? (
                          <div className="settings-expanded-indent pt-3 pl-[40px]">
                            {composioDetails[r.slug]?.loading ? (
                              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading actions...
                              </div>
                            ) : composioDetails[r.slug]?.toolsCount ? (
                              <div>
                                <div className="text-[11px] text-[var(--color-text-muted)] mb-2">
                                  Actions ({composioDetails[r.slug].toolsCount}):
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
                              <div className="text-[11px] text-[var(--color-text-muted)]">No actions available</div>
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
                          <div className="settings-expanded-indent pt-3 pl-[40px]">
                            <ComposioAuthPanel slug={def.slug} onConnected={() => handleComposioConnected(def.slug)} />
                          </div>
                        ) : isItemExpanded ? (
                          <div className="settings-expanded-indent pt-3 pl-[40px]">
                            {composioDetails[def.slug]?.loading ? (
                              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading actions...
                              </div>
                            ) : composioDetails[def.slug]?.toolsCount ? (
                              <div>
                                <div className="text-[11px] text-[var(--color-text-muted)] mb-2">
                                  Actions ({composioDetails[def.slug].toolsCount}):
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
                              <div className="text-[11px] text-[var(--color-text-muted)]">No actions available</div>
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
    </>
  );
}
function ConnectionRow({
  icon, name, description, authType, isConnected, isPending, isLoading, disabled, disabledReason,
  onConnect, onDisconnect, expanded, isLast, onToggleExpand, isExpanded,
}: {
  icon: ReactNode;
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
  expanded?: ReactNode;
  isLast?: boolean;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
}) {
  const expandable = onToggleExpand !== undefined;
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  return (
    <div className={!isLast ? 'border-b border-black/[0.06] dark:border-white/[0.06]' : ''}>
      <div className="settings-connection-row flex items-center gap-3 px-4 py-3 min-h-[52px]">
        <div className="w-[28px] h-[28px] rounded-[6px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {icon}
        </div>
        <button
          onClick={expandable ? onToggleExpand : undefined}
          className={`settings-connection-meta text-left ${expandable ? 'cursor-pointer' : ''}`}
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
        <div className="settings-connection-action flex justify-end">
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
      <div className="settings-expanded-indent space-y-2 pl-[40px]">
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
      <div className="settings-expanded-indent space-y-2 pl-[40px]">
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

export function ConstructSection() {
  return (
    <SectionPanel title="Construct" subtitle="Name your Construct, set how it works, and connect services.">
      <SettingsSubsection title="Identity">
        <ConstructIdentityPanel />
      </SettingsSubsection>

      <SettingsSubsection title="Autonomy" className="mt-5">
        <ConstructAutonomyPanel />
      </SettingsSubsection>

      <div className="mt-5">
        <ConstructConnectionsPanel />
      </div>
    </SectionPanel>
  );
}
