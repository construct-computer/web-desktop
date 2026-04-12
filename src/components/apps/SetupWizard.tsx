import { useState, useEffect, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { openAuthPopup, openAuthRedirect } from '@/lib/utils';
import analytics from '@/lib/analytics';
import {
  Loader2,
  Check,
  Sparkles,
  AlertCircle,
  ChevronRight,
  ArrowLeft,
  Unplug,
  Send,
  Lock,
  Mail,
  Search,
  ExternalLink,
  X,
} from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useWindowStore } from '@/stores/windowStore';
import { useBillingStore } from '@/stores/billingStore';
import {
  checkAgentEmailAvailability,
  getSlackConfigured,
  getSlackInstallUrl,
  getSlackStatus,
  disconnectSlack,
  getTelegramStatus,
  getTelegramLinkUrl,
  disconnectTelegram,
  searchComposioToolkits,
  getComposioConnected,
  getComposioAuthUrl,
  getComposioStatus,
  disconnectComposio,
} from '@/services/api';
import { getEmailStatus } from '@/services/agentmail';
import type { WindowConfig } from '@/types';

const logger = log('SetupWizard');

// ── Session storage persistence (survives OAuth redirects) ───────────────────

const SETUP_STORAGE_KEY = 'setup_wizard_progress';

interface SetupProgress {
  step: 1 | 2;
  screen: Screen;
  ownerName: string;
  ownerEmail: string;
  agentName: string;
  emailUsername: string;
}

function saveProgress(progress: SetupProgress) {
  try { sessionStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(progress)); } catch { /* */ }
}

function loadProgress(): SetupProgress | null {
  try {
    const raw = sessionStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.step === 'number') return parsed as SetupProgress;
  } catch { /* */ }
  return null;
}

function clearProgress() {
  sessionStorage.removeItem(SETUP_STORAGE_KEY);
}

// ── localStorage flag for instant step-1-done detection ───────────────────
// Avoids a flash of step 1 when reopening the wizard after completing it.
const STEP1_DONE_KEY = 'setup_wizard_step1_done';

function isStep1Done(): boolean {
  try { return localStorage.getItem(STEP1_DONE_KEY) === '1'; } catch { return false; }
}

function markStep1Done() {
  try { localStorage.setItem(STEP1_DONE_KEY, '1'); } catch { /* */ }
}

function clearStep1Done() {
  try { localStorage.removeItem(STEP1_DONE_KEY); } catch { /* */ }
}

// ── Types ────────────────────────────────────────────────────────────────────

type Screen = 'grid' | 'slack' | 'telegram';

interface SetupWizardProps {
  config: WindowConfig;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SetupWizard({ config }: SetupWizardProps) {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const markSetupDone = useAuthStore((s) => s.markSetupDone);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const updateComputer = useComputerStore((s) => s.updateComputer);
  const instanceId = useComputerStore((s) => s.instanceId);
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const isPro = subscription?.plan === 'pro';

  // Restore saved progress
  const saved = useRef(loadProgress());

  // Use localStorage flag for instant step-1-done detection (no async wait)
  const step1AlreadyDone = useRef(isStep1Done());
  const [step, setStep] = useState<1 | 2>(saved.current?.step || (step1AlreadyDone.current ? 2 : 1));
  const [screen, setScreen] = useState<Screen>(saved.current?.screen || 'grid');

  // ── Profile state ──
  const [ownerName, setOwnerName] = useState(saved.current?.ownerName || user?.displayName || '');
  const [ownerEmail, setOwnerEmail] = useState(user?.email || saved.current?.ownerEmail || '');
  const [agentName, setAgentName] = useState(saved.current?.agentName || 'Construct Agent');
  const [nameError, setNameError] = useState('');

  // ── Email state ──
  const [emailUsername, setEmailUsername] = useState(saved.current?.emailUsername || '');
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState('');
  const [emailSuggestion, setEmailSuggestion] = useState('');
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailInitialized = useRef(!!(saved.current?.emailUsername));
  const [emailLocked, setEmailLocked] = useState(false);

  // ── Integration state ──
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackTeamName, setSlackTeamName] = useState('');
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState('');

  // ── Saving state ──
  const [isSaving, setIsSaving] = useState(false);

  // ── Auto-generate email username from owner name ──
  useEffect(() => {
    if (emailInitialized.current || emailLocked) return;
    const name = ownerName || user?.displayName || user?.username || '';
    if (name) {
      const generated = generateEmailUsername(name);
      setEmailUsername(generated);
      emailInitialized.current = true;
    }
  }, [ownerName, user, emailLocked]);

  // ── Check if inbox already exists (lock email if so) ──
  // The local step1Done flag provides an instant skip to step 2 on reopen.
  // This effect silently confirms in the background and keeps state in sync.
  useEffect(() => {
    getEmailStatus().then((r) => {
      if (r.success && r.data?.configured && r.data.inboxId && r.data.email) {
        const username = extractBaseUsername(r.data.email);
        setEmailUsername(username);
        setEmailLocked(true);
        emailInitialized.current = true;
        // Persist the flag so future opens are instant
        markStep1Done();
        // If we haven't already jumped (e.g. fresh session, no localStorage),
        // move to step 2 now
        if (!step1AlreadyDone.current && (!saved.current?.step || saved.current.step === 1)) {
          setStep(2);
          setScreen('grid');
        }
      }
    });
  }, []);

  // ── Check integration status on mount ──
  useEffect(() => {
    sessionStorage.setItem('setup_wizard_open', '1');

    getSlackConfigured().then((r) => {
      if (r.success && r.data.configured) {
        setSlackConfigured(true);
        getSlackStatus().then((s) => {
          if (s.success && s.data.connected) {
            setSlackConnected(true);
            setSlackTeamName(s.data.teamName || '');
          }
        });
      }
    });
    getTelegramStatus().then((r) => {
      if (r.success && r.data.connected) {
        setTelegramConnected(true);
        setTelegramBotUsername(r.data.botUsername || '');
      }
    });

    return () => { sessionStorage.removeItem('setup_wizard_open'); };
  }, []);

  // ── Email availability check (debounced) ──
  const checkEmailAvailability = useCallback((username: string) => {
    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    if (!username || !instanceId) {
      setEmailAvailable(null); setEmailError(''); setEmailSuggestion('');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(username) || username.length < 2) {
      setEmailAvailable(false);
      setEmailError('Use 2+ characters: letters, numbers, hyphens, dots.');
      setEmailSuggestion('');
      return;
    }
    setEmailChecking(true); setEmailError(''); setEmailSuggestion('');
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
        setEmailAvailable(true); // optimistic
      }
    }, 400);
  }, [instanceId]);

  // ── Ensure any non-empty username gets an availability check ──
  // Covers auto-generated usernames, session-restored values, and late instanceId arrival.
  useEffect(() => {
    if (!emailLocked && emailUsername && emailAvailable === null && !emailChecking && instanceId) {
      checkEmailAvailability(emailUsername);
    }
  }, [emailUsername, emailAvailable, emailLocked, emailChecking, instanceId, checkEmailAvailability]);

  // ── Persist progress ──
  const persistProgress = useCallback((overrideScreen?: Screen, overrideStep?: 1 | 2) => {
    saveProgress({ step: overrideStep || step, screen: overrideScreen || screen, ownerName, ownerEmail, agentName, emailUsername });
  }, [step, screen, ownerName, ownerEmail, agentName, emailUsername]);

  // ── Navigate to detail screen (within step 2) ──
  const goTo = (s: Screen) => { persistProgress(s, 2); setScreen(s); };
  const goBack = () => { persistProgress('grid', 2); setScreen('grid'); };

  // ── Step 1 -> Step 2: save profile + email config ──
  const handleContinue = async () => {
    const trimmedName = ownerName.trim();
    if (!trimmedName) { setNameError('Please enter your name'); return; }
    if (trimmedName.length > 100) { setNameError('Name must be under 100 characters'); return; }
    if (!emailLocked && isPro) {
      if (!emailUsername.trim()) { setEmailError('Please enter an email username'); return; }
      if (emailAvailable === false) return;
    }

    const trimmedAgentName = agentName.trim() || 'Construct Agent';
    const nameChanged = trimmedName !== (user?.displayName || '');
    const emailChanged = !emailLocked;

    setIsSaving(true);
    try {
      if (nameChanged) {
        await updateProfile({ displayName: trimmedName });
      }
      // owner_email is NOT sent — backend resolves it from the auth-verified
      // DB record to prevent spoofing. The frontend only displays it read-only.
      await updateComputer({
        ownerName: trimmedName,
        agentName: trimmedAgentName,
        ...(emailChanged && isPro && { agentmailInboxUsername: emailUsername.trim().toLowerCase() }),
      });
      // Move to step 2 and persist
      analytics.setupStepCompleted('profile_email', { emailChanged });
      setStep(2);
      setScreen('grid');
      persistProgress('grid', 2);
      markStep1Done();

      // Notify the email window to refresh (inbox was just configured)
      if (emailChanged) {
        window.dispatchEvent(new CustomEvent('agent-email-configured'));
      }
    } catch (err) {
      logger.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Step 2 "Get Started": mark setup completed ──
  const handleDone = async () => {
    setIsSaving(true);
    try {
      await markSetupDone();
    } catch (err) {
      logger.error('Failed to mark setup done:', err);
      // Continue anyway — closing the wizard is more important
    }
    analytics.setupCompleted();
    sessionStorage.removeItem('setup_wizard_open');
    clearProgress();
    clearStep1Done();
    closeWindow(config.id);
    setIsSaving(false);
  };

  // ── OAuth popup (opens in centered popup, polls for status) ──
  const handleOAuthRedirect = (url: string) => {
    openAuthPopup(url);
  };

  // ── Step 1: Profile + Email ──
  if (step === 1) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-surface)] transition-all duration-500">
        <Step1Screen
          user={user}
          ownerName={ownerName}
          setOwnerName={(v) => { setOwnerName(v); if (nameError) setNameError(''); }}
          nameError={nameError}
          ownerEmail={ownerEmail}
          setOwnerEmail={setOwnerEmail}
          agentName={agentName}
          setAgentName={setAgentName}
          emailUsername={emailUsername}
          setEmailUsername={(v) => { setEmailUsername(v); checkEmailAvailability(v); }}
          emailChecking={emailChecking}
          emailAvailable={emailAvailable}
          emailError={emailError}
          emailSuggestion={emailSuggestion}
          emailLocked={emailLocked}
          isPro={!!isPro}
          onUseSuggestion={(s) => { const base = extractBaseUsername(s); setEmailUsername(base); checkEmailAvailability(base); }}
          onContinue={handleContinue}
          isSaving={isSaving}
        />
      </div>
    );
  }

  // ── Step 2: Integrations ──
  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] transition-all duration-500">
      {screen === 'grid' ? (
        <Step2Grid
          slackConnected={slackConnected}
          telegramConnected={telegramConnected}
          onSelect={goTo}
          onBack={() => { setStep(1); persistProgress('grid', 1); }}
          onDone={handleDone}
          isSaving={isSaving}
        />
      ) : screen === 'slack' ? (
        <SlackScreen
          slackConfigured={slackConfigured}
          slackConnected={slackConnected}
          slackTeamName={slackTeamName}
          onBack={goBack}
          onConnected={(teamName) => { setSlackConnected(true); setSlackTeamName(teamName); goBack(); }}
          onDisconnected={() => { setSlackConnected(false); setSlackTeamName(''); }}
          onOAuthRedirect={handleOAuthRedirect}
        />
      ) : screen === 'telegram' ? (
        <TelegramScreen
          telegramConnected={telegramConnected}
          telegramBotUsername={telegramBotUsername}
          onBack={goBack}
          onConnected={(botUsername) => { setTelegramConnected(true); setTelegramBotUsername(botUsername); goBack(); }}
          onDisconnected={() => { setTelegramConnected(false); setTelegramBotUsername(''); }}
        />
      ) : null}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateEmailUsername(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
  return base || 'my';
}

/** Extract the username (without domain) from an email or suggestion. */
function extractBaseUsername(suggestion: string): string {
  return suggestion.replace(/@.*$/, '');
}

/** Format a suggestion for display as a full email address. */
function formatSuggestionDisplay(suggestion: string): string {
  const base = extractBaseUsername(suggestion);
  return `${base}@agents.construct.computer`;
}

/* ─── Step 1: Profile + Email ───────────────────────────────── */

function Step1Screen({
  user,
  ownerName, setOwnerName, nameError,
  ownerEmail, setOwnerEmail,
  agentName, setAgentName,
  emailUsername, setEmailUsername,
  emailChecking, emailAvailable, emailError, emailSuggestion, emailLocked,
  isPro,
  onUseSuggestion,
  onContinue, isSaving,
}: {
  user: { displayName?: string | null; avatarUrl?: string | null; email?: string | null; username?: string | null } | null;
  ownerName: string; setOwnerName: (v: string) => void; nameError: string;
  ownerEmail: string; setOwnerEmail: (v: string) => void;
  agentName: string; setAgentName: (v: string) => void;
  emailUsername: string; setEmailUsername: (v: string) => void;
  emailChecking: boolean; emailAvailable: boolean | null;
  emailError: string; emailSuggestion: string; emailLocked: boolean;
  isPro: boolean;
  onUseSuggestion: (s: string) => void;
  onContinue: () => void;
  isSaving: boolean;
}) {
  const canContinue = ownerName.trim().length > 0
    && (emailLocked || (emailUsername.trim().length > 0 && emailAvailable !== false && !emailChecking));

  return (
    <>
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="max-w-xl mx-auto px-8 py-5 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="text-center space-y-2 pt-3 pb-1">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-16 h-16 rounded-full mx-auto shadow-md drop-shadow-sm border border-black/10 dark:border-white/10"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-16 mx-auto bg-black/5 dark:bg-white/10 rounded-full flex items-center justify-center shadow-inner">
                <Sparkles className="w-8 h-8 text-black/40 dark:text-white/40 drop-shadow-sm" />
              </div>
            )}
            <h2 className="text-[24px] font-medium tracking-tight text-black dark:text-white drop-shadow-sm">Set Up Your Computer</h2>
            <p className="text-xs font-medium text-black/50 dark:text-white/50">
              Step 1 of 2 &mdash; Your profile and agent email
            </p>
          </div>

          {/* ── Profile ── */}
          <div className="space-y-1 px-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40 ml-2">Your Name</Label>
            <Input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onContinue(); }}
              placeholder="Your name"
              className="text-[14px] font-medium rounded-xl py-4 px-5 bg-white/50 dark:bg-black/20 border-black/5 dark:border-white/10 shadow-inner focus-visible:ring-black/20 dark:focus-visible:ring-white/20 text-black dark:text-white transition-all bg-transparent"
              autoFocus
            />
            {nameError && (
              <p className="text-xs text-red-500 ml-2">{nameError}</p>
            )}
          </div>

          {/* ── Owner Email ── */}
          <div className="space-y-1 px-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40 ml-2 flex items-center gap-1.5">
              Your Email
              {user?.email && <Lock className="w-3 h-3 text-black/30 dark:text-white/30" />}
            </Label>
            <Input
              type="email"
              value={ownerEmail}
              onChange={(e) => { if (!user?.email) setOwnerEmail(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') onContinue(); }}
              placeholder="you@example.com"
              className={`text-[14px] font-medium rounded-xl py-4 px-5 bg-white/50 dark:bg-black/20 border-black/5 dark:border-white/10 shadow-inner focus-visible:ring-black/20 dark:focus-visible:ring-white/20 text-black dark:text-white transition-all bg-transparent ${user?.email ? 'opacity-60 cursor-not-allowed' : ''}`}
              autoComplete="email"
              disabled={!!user?.email}
            />
            <p className="text-[10px] font-medium text-black/40 dark:text-white/40 ml-2">
              {user?.email
                ? 'Verified from your login. This cannot be changed.'
                : 'Your agent will use this when it needs to contact you.'}
            </p>
          </div>

          {/* ── Agent Name ── */}
          <div className="space-y-1 px-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40 ml-2">Agent Name</Label>
            <Input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onContinue(); }}
              placeholder="Construct Agent"
              className="text-[14px] font-medium rounded-xl py-4 px-5 bg-white/50 dark:bg-black/20 border-black/5 dark:border-white/10 shadow-inner focus-visible:ring-black/20 dark:focus-visible:ring-white/20 text-black dark:text-white transition-all bg-transparent"
            />
            <p className="text-[10px] font-medium text-black/40 dark:text-white/40 ml-2 leading-relaxed">
              The name your agent uses when joining meetings or sending messages.
            </p>
          </div>

          {/* ── Agent Email ── */}
          <div className="space-y-1 px-2 pb-4">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40 ml-2 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Agent Email Address
              {emailLocked && <Lock className="w-3 h-3 text-black/30 dark:text-white/30" />}
              {!emailLocked && !isPro && <span className="px-1.5 py-0.5 text-[8px] rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tracking-wide uppercase normal-case ml-1">Pro</span>}
            </Label>
            {!isPro && !emailLocked ? (
              <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-black/10 px-5 py-4">
                <p className="text-[12px] text-black/50 dark:text-white/40">
                  Upgrade to Pro to give your agent its own <span className="font-medium text-black/70 dark:text-white/60">@agents.construct.computer</span> email address.
                </p>
              </div>
            ) : (
            <>
            <div className="flex items-stretch rounded-xl overflow-hidden border border-black/5 dark:border-white/10 shadow-inner bg-white/50 dark:bg-black/20 transition-all">
              <Input
                type="text"
                value={emailUsername}
                onChange={(e) => setEmailUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') onContinue(); }}
                placeholder="yourname"
                className="flex-1 rounded-none border-0 text-[14px] font-medium bg-transparent focus-visible:ring-0 text-black dark:text-white py-4 px-5 outline-none ring-0 shadow-none border-t-0 border-b-0"
                disabled={emailLocked}
              />
              <div className="flex items-center px-3 bg-black/5 dark:bg-white/5 border-l border-black/5 dark:border-white/10
                              text-black/60 dark:text-white/60 text-[13px] font-medium select-none shrink-0 border-t-0 border-b-0">
                @agents.construct.computer
              </div>
            </div>
            {/* Status */}
            <div className="min-h-[20px] ml-2 mt-2">
              {emailLocked && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-black/40 dark:text-white/40">
                  <Lock className="w-3 h-3" /> Email address is permanently set
                </span>
              )}
              {!emailLocked && (
                <span className="text-[11px] font-medium text-black/40 dark:text-white/40">
                  Choose carefully — this cannot be changed later.
                </span>
              )}
              {!emailLocked && emailChecking && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-black/50 dark:text-white/50">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                </span>
              )}
              {!emailLocked && !emailChecking && emailAvailable === true && emailUsername && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 drop-shadow-sm">
                  <Check className="w-3.5 h-3.5" /> {emailUsername}@agents.construct.computer is available
                </span>
              )}
              {!emailLocked && !emailChecking && emailAvailable === false && (
                <div className="flex flex-col gap-1 mt-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 drop-shadow-sm">
                    <AlertCircle className="w-3.5 h-3.5" /> {emailError}
                  </span>
                  {emailSuggestion && (
                    <button
                      onClick={() => onUseSuggestion(emailSuggestion)}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline text-left ml-5 mt-0.5"
                    >
                      Try {formatSuggestionDisplay(emailSuggestion)}?
                    </button>
                  )}
                </div>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-3 flex justify-end transition-all duration-500">
        <Button 
          variant="primary" 
          className="px-10 py-4 rounded-full font-medium shadow-md hover:scale-[1.02] transition-transform text-sm" 
          onClick={onContinue} 
          disabled={!canContinue || isSaving}
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {isSaving ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </>
  );
}

/** Popular apps shown as quick-connect chips below the search bar. */
const SUGGESTED_APPS = [
  { slug: 'googledrive', name: 'Google Drive' },
  { slug: 'googlecalendar', name: 'Google Calendar' },
  { slug: 'googledocs', name: 'Google Docs' },
  { slug: 'googlesheets', name: 'Google Sheets' },
  { slug: 'gmail', name: 'Gmail' },
  { slug: 'notion', name: 'Notion' },
  { slug: 'github', name: 'GitHub' },
  { slug: 'linear', name: 'Linear' },
  { slug: 'jira', name: 'Jira' },
  { slug: 'hubspot', name: 'HubSpot' },
  { slug: 'trello', name: 'Trello' },
  { slug: 'dropbox', name: 'Dropbox' },
];

/* ─── Step 2: Integrations Grid ─────────────────────────────── */

function Step2Grid({
  slackConnected,
  telegramConnected,
  onSelect, onBack, onDone, isSaving,
}: {
  slackConnected: boolean;
  telegramConnected: boolean;
  onSelect: (s: Screen) => void;
  onBack: () => void;
  onDone: () => void;
  isSaving: boolean;
}) {
  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ slug: string; name: string; description: string; logo?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Connected Composio apps ──
  const [connectedApps, setConnectedApps] = useState<Array<{ toolkit: string; accountId: string }>>([]);
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);
  const [disconnectingToolkit, setDisconnectingToolkit] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Built-in toolkits that have dedicated screens — don't show in search/connected
  const builtinToolkits = new Set(['slack', 'telegram']);

  // Load connected Composio apps on mount
  useEffect(() => {
    getComposioConnected().then((r) => {
      if (r.success && r.data.connected) {
        setConnectedApps(r.data.connected.filter(a => !builtinToolkits.has(a.toolkit)));
      }
    });
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const r = await searchComposioToolkits(searchQuery.trim());
      if (r.success && r.data.toolkits) {
        setSearchResults(r.data.toolkits.filter(t => !builtinToolkits.has(t.slug)));
      } else {
        setSearchResults([]);
      }
      setSearching(false);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // Connect a Composio toolkit via OAuth
  const handleConnect = async (toolkit: string) => {
    setConnectingToolkit(toolkit);
    const r = await getComposioAuthUrl(toolkit);
    if (r.success && r.data.url) {
      openAuthRedirect(r.data.url);
    } else {
      setConnectingToolkit(null);
    }
  };

  // Disconnect a Composio toolkit
  const handleDisconnect = async (toolkit: string) => {
    setDisconnectingToolkit(toolkit);
    await disconnectComposio(toolkit);
    setConnectedApps(prev => prev.filter(a => a.toolkit !== toolkit));
    setDisconnectingToolkit(null);
  };

  const builtinServices = ([
    { id: 'slack' as const, platform: 'slack', name: 'Slack', connected: slackConnected },
    { id: 'telegram' as const, platform: 'telegram', name: 'Telegram', connected: telegramConnected },
  ] as const);

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <>
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="max-w-xl mx-auto px-6 py-4 space-y-3 animate-in fade-in slide-in-from-right-4 duration-500">
          {/* Header */}
          <div className="text-center space-y-1 pt-2">
            <h2 className="text-xl font-medium tracking-tight text-black dark:text-white">Connect Services</h2>
            <p className="text-[11px] font-medium text-black/50 dark:text-white/50">
              Step 2 of 2 &mdash; Give your agent access to your apps
            </p>
          </div>

          {/* ── Built-in integrations (compact 2-col grid) ── */}
          <div className="grid grid-cols-2 gap-2">
            {builtinServices.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id as Screen)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all duration-200
                  ${c.connected
                    ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
                    : 'border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/20 hover:bg-white/70 dark:hover:bg-black/30'
                  }`}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                  <PlatformIcon platform={c.platform} size={18} />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <span className="text-[12px] font-semibold text-black dark:text-white block leading-tight truncate">{c.name}</span>
                  <span className="text-[10px] font-medium text-black/40 dark:text-white/40 leading-tight block">
                    {c.connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* ── More Apps: Search + Suggestions + Connected ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 font-bold ml-1">More Apps</span>
              <div className="flex-1 h-px bg-black/5 dark:bg-white/10" />
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/30 dark:text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search apps (Notion, Jira, GitHub...)"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/10 text-[12px] font-medium text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                  <X className="w-3 h-3 text-black/40 dark:text-white/40" />
                </button>
              )}
            </div>

            {/* Suggested apps (when not searching) */}
            {!isSearching && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_APPS
                  .filter(s => !connectedApps.some(a => a.toolkit === s.slug))
                  .map((s) => {
                    const isConnecting = connectingToolkit === s.slug;
                    return (
                      <button
                        key={s.slug}
                        onClick={() => !isConnecting && handleConnect(s.slug)}
                        disabled={isConnecting}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/20 hover:bg-white/70 dark:hover:bg-black/30 transition-all text-[11px] font-medium text-black/70 dark:text-white/70 disabled:opacity-50"
                      >
                        {isConnecting
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <ToolkitLogo slug={s.slug} size={14} />
                        }
                        {s.name}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Search results */}
            {isSearching && (
              <div>
                {searching ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-black/40 dark:text-white/40">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-4 text-[11px] text-black/40 dark:text-white/40">
                    No apps found for &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {searchResults.map((t) => {
                      const alreadyConnected = connectedApps.some(a => a.toolkit === t.slug);
                      const isConnecting = connectingToolkit === t.slug;
                      return (
                        <button
                          key={t.slug}
                          onClick={() => !alreadyConnected && !isConnecting && handleConnect(t.slug)}
                          disabled={isConnecting}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left
                            ${alreadyConnected
                              ? 'border-emerald-500/30 bg-emerald-500/5 cursor-default'
                              : 'border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/20 hover:bg-white/70 dark:hover:bg-black/30 cursor-pointer'
                            } disabled:opacity-60`}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                            {isConnecting
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-black/40 dark:text-white/40" />
                              : <ToolkitLogo slug={t.slug} logo={t.logo} size={16} />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-black dark:text-white block truncate">{t.name}</span>
                            <span className="text-[10px] font-medium text-black/35 dark:text-white/35 block truncate">
                              {isConnecting ? 'Connecting...' : t.description || t.slug}
                            </span>
                          </div>
                          {alreadyConnected && (
                            <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Connected apps (2-col grid) */}
            {connectedApps.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {connectedApps.map((app) => (
                  <div
                    key={app.toolkit}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 group"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                      <ToolkitLogo slug={app.toolkit} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold text-black dark:text-white capitalize truncate block">{app.toolkit}</span>
                    </div>
                    <button
                      onClick={() => handleDisconnect(app.toolkit)}
                      disabled={disconnectingToolkit === app.toolkit}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      title="Disconnect"
                    >
                      {disconnectingToolkit === app.toolkit
                        ? <Loader2 className="w-3 h-3 animate-spin text-red-500" />
                        : <X className="w-3 h-3 text-red-400 hover:text-red-500" />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 flex items-center justify-between">
        <Button variant="ghost" className="px-4 py-3 rounded-full font-medium hover:bg-black/5 dark:hover:bg-white/10 text-sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <Button
          variant="primary"
          className="px-8 py-3 rounded-full font-medium shadow-md hover:scale-[1.02] transition-transform text-sm"
          onClick={onDone}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {isSaving ? 'Finishing...' : 'Finish setup'}
          {!isSaving && <ChevronRight className="w-4 h-4 ml-1" />}
        </Button>
      </div>
    </>
  );
}

/* ─── Detail Screen Shell ───────────────────────────────────── */

function DetailShell({
  title,
  icon,
  onBack,
  children,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  onBack: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)]">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-[var(--color-surface-raised)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-5 space-y-4">
          {children}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 flex gap-2">
        {footer}
      </div>
    </>
  );
}

/* ─── Slack Screen ──────────────────────────────────────────── */

const SLACK_OAUTH_URL = 'https://slack.com/oauth/v2/authorize?client_id=10603607090582.10618588079921&scope=app_mentions:read,im:read,im:write,im:history,chat:write,files:write,reactions:read,reactions:write,channels:read,channels:history,users:read,users:read.email&user_scope=';

function SlackScreen({
  slackConfigured,
  slackConnected,
  slackTeamName,
  onBack,
  onConnected: _onConnected,
  onDisconnected,
  onOAuthRedirect,
}: {
  slackConfigured: boolean;
  slackConnected: boolean;
  slackTeamName: string;
  onBack: () => void;
  onConnected: (teamName: string) => void;
  onDisconnected: () => void;
  onOAuthRedirect: (url: string) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    // If the backend has Slack OAuth configured, use its install URL
    // (may include instance-specific redirect_uri). Otherwise, use
    // the direct Slack OAuth URL.
    if (slackConfigured) {
      setConnecting(true);
      setError(null);
      const result = await getSlackInstallUrl();
      setConnecting(false);
      if (result.success && result.data.url) {
        onOAuthRedirect(result.data.url);
      } else {
        setError(result.success ? (result.data.error || 'Unknown error') : result.error);
      }
    } else {
      onOAuthRedirect(SLACK_OAUTH_URL);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectSlack();
    setDisconnecting(false);
    onDisconnected();
  };

  return (
    <DetailShell
      title="Slack"
      icon={<PlatformIcon platform="slack" size={20} />}
      onBack={onBack}
      footer={<Button variant="ghost" className="w-full" onClick={onBack}>Back</Button>}
    >
      {slackConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-success)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-lg p-2.5">
            <Check className="w-3.5 h-3.5 shrink-0" />
            Connected to <span className="font-medium">{slackTeamName || 'Slack workspace'}</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            @mention the bot in any channel or DM it directly. Each thread creates a separate conversation with your agent.
          </p>
          <Button variant="default" size="sm" className="w-full" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Unplug className="w-4 h-4 mr-1" />}
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Add your agent to a Slack workspace. Team members can @mention the bot to send messages and receive responses in threads.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="mx-auto flex items-center justify-center rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            <img
              alt="Add to Slack"
              height="40"
              width="139"
              src="https://platform.slack-edge.com/img/add_to_slack.png"
              srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
            />
          </button>
          {connecting && (
            <div className="flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>
      )}
    </DetailShell>
  );
}

/* ─── Telegram Screen ───────────────────────────────────────── */

function TelegramScreen({
  telegramConnected,
  telegramBotUsername,
  onBack,
  onConnected,
  onDisconnected,
}: {
  telegramConnected: boolean;
  telegramBotUsername: string;
  onBack: () => void;
  onConnected: (botUsername: string) => void;
  onDisconnected: () => void;
}) {
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Generate link URL
  const handleGenerateLink = async () => {
    setGenerating(true);
    setError(null);
    const result = await getTelegramLinkUrl();
    setGenerating(false);
    if (result.success) {
      setLinkUrl(result.data.url);
      // Start polling for link confirmation
      setPolling(true);
    } else {
      setError(result.error);
    }
  };

  // Poll for link status while waiting
  useEffect(() => {
    if (!polling || telegramConnected) return;
    const interval = setInterval(async () => {
      const status = await getTelegramStatus();
      if (status.success && status.data.connected) {
        setPolling(false);
        setLinkUrl(null);
        onConnected(status.data.botUsername || '');
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, telegramConnected, onConnected]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectTelegram();
    setDisconnecting(false);
    onDisconnected();
  };

  return (
    <DetailShell
      title="Telegram"
      icon={<PlatformIcon platform="telegram" size={20} />}
      onBack={onBack}
      footer={<Button variant="ghost" className="w-full" onClick={onBack}>Back</Button>}
    >
      {telegramConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-success)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-lg p-2.5">
            <Check className="w-3.5 h-3.5 shrink-0" />
            Telegram linked{telegramBotUsername ? ` via @${telegramBotUsername}` : ''}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Send messages to @{telegramBotUsername || 'the bot'} on Telegram to talk to your agent.
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            To use in group chats, add the bot to your group and send /bind
          </p>
          <Button variant="default" size="sm" className="w-full" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Unplug className="w-4 h-4 mr-1" />}
            Disconnect
          </Button>
        </div>
      ) : linkUrl ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Click the link below to open Telegram and link your account:
          </p>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-lg border border-[var(--color-border)] p-3 hover:bg-[var(--color-bg-hover)] transition-colors text-sm font-medium text-[#2AABEE]"
          >
            <Send className="w-4 h-4" />
            Open in Telegram
          </a>
          {/* Copyable /start command for manual use */}
          {(() => {
            const match = linkUrl.match(/t\.me\/([^?]+)\?start=(.+)/);
            if (!match) return null;
            const [, botUser, code] = match;
            const command = `/start ${code}`;
            return (
              <div className="text-center space-y-1">
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Or send this to <a href={`https://t.me/${botUser}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#2AABEE] hover:underline">@{botUser}</a> in Telegram:
                </p>
                <button
                  onClick={() => { navigator.clipboard.writeText(command); }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer"
                  title="Click to copy"
                >
                  <code className="text-[11px] font-mono text-[var(--color-text)]">{command}</code>
                  <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>
            );
          })()}
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for confirmation...
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] text-center">
            The link expires in 10 minutes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Connect your Telegram account to chat with your agent directly in Telegram.
          </p>
          <Button variant="primary" className="w-full" onClick={handleGenerateLink} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Connect Telegram
          </Button>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>
      )}
    </DetailShell>
  );
}

/* ─── Toolkit Logo (uses Composio logo CDN) ─────────────────── */

function ToolkitLogo({ slug, logo, size = 20 }: { slug: string; logo?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = logo || `https://logos.composio.dev/api/${slug}`;
  if (failed) {
    const char = (slug || '?')[0].toUpperCase();
    return (
      <div
        className="flex items-center justify-center rounded-md font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.5, backgroundColor: '#6366f1' }}
      >
        {char}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={slug}
      width={size}
      height={size}
      className="object-contain"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}
