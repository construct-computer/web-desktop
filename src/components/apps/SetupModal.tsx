/**
 * Setup Modal — permanent overlay that shows until the user completes initial setup.
 *
 * Collects: name, agent name, agent email address.
 * Cannot be dismissed until saved. After saving, marks setup as complete.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, Check, Sparkles, AlertCircle, Lock, Mail, ArrowRight,
} from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { checkAgentEmailAvailability } from '@/services/api';
import { getEmailStatus } from '@/services/agentmail';
import analytics from '@/lib/analytics';
import { log } from '@/lib/logger';

const logger = log('SetupModal');

// ── Email helpers ──

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

function extractBaseUsername(suggestion: string): string {
  return suggestion.replace(/@.*$/, '');
}

function formatSuggestionDisplay(suggestion: string): string {
  const base = extractBaseUsername(suggestion);
  return `${base}@agents.construct.computer`;
}

// ── Component ──

export function SetupModal() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const markSetupDone = useAuthStore((s) => s.markSetupDone);
  const updateComputer = useComputerStore((s) => s.updateComputer);
  const instanceId = useComputerStore((s) => s.instanceId);
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const startCheckout = useBillingStore((s) => s.startCheckout);
  const switchPlan = useBillingStore((s) => s.switchPlan);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const isPaid = subscription?.plan === 'pro' || subscription?.plan === 'starter';
  const isNonProdEnv = subscription?.environment === 'staging' || subscription?.environment === 'local';

  // Upgrade-in-place state.
  const [upgrading, setUpgrading] = useState<'starter' | 'pro' | null>(null);

  // Profile fields
  const [ownerName, setOwnerName] = useState(user?.displayName || '');
  const [agentName, setAgentName] = useState('Construct Agent');
  const [nameError, setNameError] = useState('');

  // Email fields
  const [emailUsername, setEmailUsername] = useState('');
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState('');
  const [emailSuggestion, setEmailSuggestion] = useState('');
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailInitialized = useRef(false);
  const [emailLocked, setEmailLocked] = useState(false);

  // Saving
  const [isSaving, setIsSaving] = useState(false);

  // Auto-generate email username from name
  useEffect(() => {
    if (emailInitialized.current || emailLocked) return;
    const name = ownerName || user?.displayName || user?.username || '';
    if (name) {
      const generated = generateEmailUsername(name);
      setEmailUsername(generated);
      emailInitialized.current = true;
    }
  }, [ownerName, user, emailLocked]);

  // Check if inbox already exists (lock email if so)
  useEffect(() => {
    getEmailStatus().then((r) => {
      if (r.success && r.data?.configured && r.data.inboxId && r.data.email) {
        const username = extractBaseUsername(r.data.email);
        setEmailUsername(username);
        setEmailLocked(true);
        emailInitialized.current = true;
      }
    });
  }, []);

  // Debounced email availability check
  const checkEmail = useCallback((username: string) => {
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

  // Initial availability check when username is auto-generated
  useEffect(() => {
    if (!emailLocked && emailUsername && emailAvailable === null && !emailChecking && instanceId) {
      checkEmail(emailUsername);
    }
  }, [emailUsername, emailAvailable, emailLocked, emailChecking, instanceId, checkEmail]);

  // Refetch subscription on window focus while still free — catches the case
  // where the user upgraded in another tab/popup and returned to the modal.
  useEffect(() => {
    if (isPaid) return;
    const onFocus = () => { fetchSubscription(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isPaid, fetchSubscription]);

  // Inline upgrade CTA — stays inside the setup modal, returns here post-checkout.
  const handleUpgrade = async (plan: 'starter' | 'pro') => {
    setUpgrading(plan);
    analytics.setupStepCompleted('upgrade_clicked', { plan, from: 'setup_modal_email' });
    if (isNonProdEnv) {
      await switchPlan(plan);
      await fetchSubscription();
      setUpgrading(null);
    } else {
      const url = await startCheckout(plan);
      if (url) {
        window.location.href = url;
      } else {
        setUpgrading(null);
      }
    }
  };

  // Save and complete setup
  const handleSave = async () => {
    const trimmedName = ownerName.trim();
    if (!trimmedName) { setNameError('Please enter your name'); return; }
    if (trimmedName.length > 100) { setNameError('Name must be under 100 characters'); return; }
    if (!emailLocked && isPaid) {
      if (!emailUsername.trim()) { setEmailError('Please enter an email username'); return; }
      if (emailAvailable === false) return;
    }

    const trimmedAgentName = agentName.trim() || 'Construct Agent';
    const emailChanged = !emailLocked && isPaid && !!emailUsername.trim();

    setIsSaving(true);
    try {
      await updateProfile({ displayName: trimmedName });
      await updateComputer({
        ownerName: trimmedName,
        agentName: trimmedAgentName,
        ...(emailChanged && { agentmailInboxUsername: emailUsername.trim().toLowerCase() }),
      });
      analytics.setupStepCompleted('profile_email', { emailChanged });

      if (emailChanged) {
        window.dispatchEvent(new CustomEvent('agent-email-configured'));
      }

      await markSetupDone();
      analytics.setupCompleted();

      // Tell the guided tour to advance past the setup step
      window.dispatchEvent(new Event('construct:setup-saved'));
    } catch (err) {
      logger.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = ownerName.trim().length > 0
    && (emailLocked || !isPaid || (emailUsername.trim().length > 0 && emailAvailable !== false && !emailChecking));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center modal-scrim">
      <div data-tour="setup" className="w-full max-w-md soft-popover rounded-2xl shadow-2xl shadow-black/18 dark:shadow-black/32 border border-black/10 dark:border-white/15 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="text-center px-8 pt-7 pb-2 space-y-2">
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
          <h2 className="text-xl font-semibold tracking-tight">Set Up Your Computer</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Configure your profile and agent email to get started.
          </p>
        </div>

        {/* Form */}
        <div className="px-8 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Your Name</Label>
            <Input
              type="text"
              value={ownerName}
              onChange={(e) => { setOwnerName(e.target.value); if (nameError) setNameError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Your name"
              autoFocus
            />
            {nameError && <p className="text-xs text-red-500 ml-1">{nameError}</p>}
          </div>

          {/* Email (read-only from auth) */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] ml-1 flex items-center gap-1.5">
              Your Email
              {user?.email && <Lock className="w-3 h-3 text-[var(--color-text-muted)]" />}
            </Label>
            <Input
              type="email"
              value={user?.email || ''}
              disabled
              className="opacity-60 cursor-not-allowed"
            />
            <p className="text-[10px] text-[var(--color-text-muted)] ml-1">
              Verified from your login. This cannot be changed.
            </p>
          </div>

          {/* Agent Name */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Agent Name</Label>
            <Input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Construct Agent"
            />
            <p className="text-[10px] text-[var(--color-text-muted)] ml-1">
              The name your agent uses when joining meetings or sending messages.
            </p>
          </div>

          {/* Agent Email */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] ml-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Agent Email Address
              {emailLocked && <Lock className="w-3 h-3 text-[var(--color-text-muted)]" />}
              {!emailLocked && !isPaid && <span className="px-1.5 py-0.5 text-[8px] rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tracking-wide uppercase normal-case ml-1">Paid</span>}
            </Label>
            {!isPaid && !emailLocked ? (
              <SetupModalUpgradeCard upgrading={upgrading} onUpgrade={handleUpgrade} />
            ) : (
            <>
            <div className="flex items-stretch rounded-lg overflow-hidden border border-[var(--color-border)]">
              <Input
                type="text"
                value={emailUsername}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
                  setEmailUsername(v);
                  checkEmail(v);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder="yourname"
                className="flex-1 rounded-none border-0 focus-visible:ring-0 shadow-none"
                disabled={emailLocked}
              />
              <div className="flex items-center px-3 bg-black/5 dark:bg-white/5 border-l border-[var(--color-border)] text-[var(--color-text-muted)] text-[13px] font-medium select-none shrink-0">
                @agents.construct.computer
              </div>
            </div>
            {/* Status */}
            <div className="min-h-[18px] ml-1 mt-1">
              {emailLocked && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                  <Lock className="w-3 h-3" /> Email address is permanently set
                </span>
              )}
              {!emailLocked && !emailChecking && !emailError && emailAvailable === null && (
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  Choose carefully — this cannot be changed later.
                </span>
              )}
              {!emailLocked && emailChecking && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                </span>
              )}
              {!emailLocked && !emailChecking && emailAvailable === true && emailUsername && (
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> {emailUsername}@agents.construct.computer is available
                </span>
              )}
              {!emailLocked && !emailChecking && emailAvailable === false && (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[11px] text-red-500">
                    <AlertCircle className="w-3.5 h-3.5" /> {emailError}
                  </span>
                  {emailSuggestion && (
                    <button
                      onClick={() => { const base = extractBaseUsername(emailSuggestion); setEmailUsername(base); checkEmail(base); }}
                      className="text-[11px] text-blue-500 hover:underline text-left ml-5"
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

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[var(--color-border)] flex justify-end">
          <Button
            variant="primary"
            className="px-8"
            onClick={handleSave}
            disabled={!canSave || isSaving}
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {isSaving ? 'Saving...' : 'Save & Get Started'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline email-upgrade CTA (compact variant for the modal) ─── */

function SetupModalUpgradeCard({
  upgrading,
  onUpgrade,
}: {
  upgrading: 'starter' | 'pro' | null;
  onUpgrade: (plan: 'starter' | 'pro') => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3.5 py-3 space-y-2.5">
      <p className="text-[11.5px] text-[var(--color-text-muted)] leading-snug">
        Give your agent a <span className="font-medium text-[var(--color-text)]">@agents.construct.computer</span> inbox — available on any paid plan.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onUpgrade('starter')}
          disabled={!!upgrading}
          className="group flex items-center justify-between gap-1 rounded-md border border-black/10 dark:border-white/10
            bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/40
            px-2.5 py-1.5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-[var(--color-text)]">Starter</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">$59/mo</div>
          </div>
          {upgrading === 'starter'
            ? <Loader2 className="w-3 h-3 animate-spin text-[var(--color-text-muted)]" />
            : <ArrowRight className="w-3 h-3 text-[var(--color-text-muted)] group-hover:translate-x-0.5 transition-transform" />
          }
        </button>
        <button
          type="button"
          onClick={() => onUpgrade('pro')}
          disabled={!!upgrading}
          className="group flex items-center justify-between gap-1 rounded-md border border-emerald-500/30
            bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14]
            px-2.5 py-1.5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-[var(--color-text)] flex items-center gap-1">
              Pro <Sparkles className="w-2.5 h-2.5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)]">$299/mo</div>
          </div>
          {upgrading === 'pro'
            ? <Loader2 className="w-3 h-3 animate-spin text-emerald-600 dark:text-emerald-400" />
            : <ArrowRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
          }
        </button>
      </div>
    </div>
  );
}
