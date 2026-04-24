/**
 * EmailSetupPane — in-place onboarding inside the Email window.
 *
 * Replaces the old "Email is available on the Pro plan — Open Settings"
 * dead-end. Handles two distinct cohorts without ever leaving the app:
 *
 *   (a) Free users            → inline upgrade CTA (Starter / Pro).
 *   (b) Paid without inbox    → inline username picker with live availability
 *                               check and a "Create inbox" action.
 *
 * On staging/local the upgrade path uses `switchPlan` so the plan flips
 * in place. On prod it redirects to the Dodo checkout URL. Either way, a
 * window-focus listener re-fetches billing while the user is still free so
 * upgrades completed in another tab/popup are picked up automatically.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, Check, AlertCircle, Mail, Sparkles, ArrowRight,
} from 'lucide-react';
import { useBillingStore } from '@/stores/billingStore';
import { useAuthStore } from '@/stores/authStore';
import { useComputerStore } from '@/stores/agentStore';
import { checkAgentEmailAvailability } from '@/services/api';
import analytics from '@/lib/analytics';
import { log } from '@/lib/logger';

const logger = log('EmailSetupPane');

// ── Username helpers (same rules as SetupWizard) ──

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
  return `${extractBaseUsername(suggestion)}@agents.construct.computer`;
}

// ── Component ──

export function EmailSetupPane({ onConfigured }: { onConfigured?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const startCheckout = useBillingStore((s) => s.startCheckout);
  const switchPlan = useBillingStore((s) => s.switchPlan);
  const updateComputer = useComputerStore((s) => s.updateComputer);
  const instanceId = useComputerStore((s) => s.instanceId);

  const isPaid = subscription?.plan === 'pro' || subscription?.plan === 'starter';
  const isNonProdEnv = subscription?.environment === 'staging' || subscription?.environment === 'local';

  const [upgrading, setUpgrading] = useState<'starter' | 'pro' | null>(null);

  // ── Username picker state (only used when isPaid) ──
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [creating, setCreating] = useState(false);
  const initialized = useRef(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Make sure we have current subscription info on mount.
  useEffect(() => {
    if (!subscription) fetchSubscription();
  }, [subscription, fetchSubscription]);

  // Refetch subscription on window focus while the user is still free,
  // so upgrades completed in a side tab/popup are picked up automatically.
  useEffect(() => {
    if (isPaid) return;
    const onFocus = () => { fetchSubscription(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isPaid, fetchSubscription]);

  // Auto-generate a username once we have a name to derive from.
  useEffect(() => {
    if (!isPaid || initialized.current) return;
    const source = user?.displayName || user?.username || '';
    if (source) {
      const generated = generateEmailUsername(source);
      setUsername(generated);
      initialized.current = true;
    }
  }, [isPaid, user]);

  const runAvailabilityCheck = useCallback((next: string) => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!next || !instanceId) {
      setAvailable(null); setError(''); setSuggestion('');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(next) || next.length < 2) {
      setAvailable(false);
      setError('Use 2+ characters: letters, numbers, hyphens, dots.');
      setSuggestion('');
      return;
    }
    setChecking(true); setError(''); setSuggestion('');
    checkTimer.current = setTimeout(async () => {
      const result = await checkAgentEmailAvailability(instanceId, next);
      setChecking(false);
      if (result.success) {
        setAvailable(result.data.available);
        if (!result.data.available) {
          setError(result.data.reason || 'Username already taken');
          setSuggestion(result.data.suggestion || '');
        }
      } else {
        setAvailable(true); // optimistic
      }
    }, 400);
  }, [instanceId]);

  // Kick off a check for auto-generated or restored usernames.
  useEffect(() => {
    if (isPaid && username && available === null && !checking && instanceId) {
      runAvailabilityCheck(username);
    }
  }, [isPaid, username, available, checking, instanceId, runAvailabilityCheck]);

  // ── Upgrade handler (free → paid) ──
  const handleUpgrade = async (plan: 'starter' | 'pro') => {
    setUpgrading(plan);
    analytics.setupStepCompleted('upgrade_clicked', { plan, from: 'email_app' });
    try {
      if (isNonProdEnv) {
        await switchPlan(plan);
        await fetchSubscription();
      } else {
        const url = await startCheckout(plan);
        if (url) {
          window.location.href = url;
          return; // navigating away
        }
      }
    } catch (err) {
      logger.error('Upgrade failed:', err);
    } finally {
      setUpgrading(null);
    }
  };

  // ── Create inbox handler (paid → configured) ──
  const handleCreateInbox = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) { setError('Please enter a username'); return; }
    if (available === false) return;

    setCreating(true);
    try {
      const ok = await updateComputer({ agentmailInboxUsername: trimmed });
      if (ok) {
        analytics.setupStepCompleted('email_inbox_created', { from: 'email_app' });
        window.dispatchEvent(new CustomEvent('agent-email-configured'));
        onConfigured?.();
      } else {
        setError('Failed to create inbox. Please try again.');
      }
    } catch (err) {
      logger.error('Create inbox failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create inbox');
    } finally {
      setCreating(false);
    }
  };

  const canCreate = !!username.trim() && available !== false && !checking && !creating;

  // ── Loading subscription state ──
  if (!subscription) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--color-surface)]">
        <Loader2 size={22} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  // ── Paid — inline username picker ──
  if (isPaid) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] px-6">
        <div className="w-full max-w-md space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 flex items-center justify-center">
              <Mail className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h2 className="text-[17px] font-semibold tracking-tight text-black dark:text-white">
              Claim your agent&apos;s email
            </h2>
            <p className="text-[12px] text-black/50 dark:text-white/50 leading-relaxed">
              Pick a username — your agent will be able to send and receive email from
              <br className="hidden sm:block" />
              this address.
            </p>
          </div>

          {/* Username input */}
          <div className="space-y-2">
            <div className="flex items-stretch rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 shadow-inner transition-all">
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
                  setUsername(v);
                  runAvailabilityCheck(v);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreateInbox(); }}
                placeholder="yourname"
                className="flex-1 bg-transparent px-4 py-3 text-[14px] font-medium text-black dark:text-white outline-none"
                autoFocus
              />
              <div className="flex items-center px-3 bg-black/5 dark:bg-white/5 border-l border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 text-[12px] font-medium select-none shrink-0">
                @agents.construct.computer
              </div>
            </div>

            {/* Status */}
            <div className="min-h-[18px] ml-1">
              {checking && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-black/50 dark:text-white/50">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking availability…
                </span>
              )}
              {!checking && available === true && username && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5" />
                  {username}@agents.construct.computer is available
                </span>
              )}
              {!checking && available === false && (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-500">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                  </span>
                  {suggestion && (
                    <button
                      onClick={() => {
                        const base = extractBaseUsername(suggestion);
                        setUsername(base);
                        runAvailabilityCheck(base);
                      }}
                      className="text-[11px] font-medium text-blue-500 hover:underline text-left ml-5"
                    >
                      Try {formatSuggestionDisplay(suggestion)}?
                    </button>
                  )}
                </div>
              )}
              {!checking && available === null && username && (
                <span className="text-[11px] text-black/40 dark:text-white/40">
                  Choose carefully — this address is permanent.
                </span>
              )}
            </div>
          </div>

          {/* Create button */}
          <button
            type="button"
            onClick={handleCreateInbox}
            disabled={!canCreate}
            className="w-full flex items-center justify-center gap-2 rounded-xl
              bg-[var(--color-accent)] text-white font-medium text-[13px]
              py-3 shadow-md hover:brightness-110 active:brightness-95
              disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {creating ? 'Creating inbox…' : 'Create my inbox'}
          </button>

          <p className="text-[10.5px] text-center text-black/40 dark:text-white/40 leading-relaxed">
            The address cannot be changed later.
          </p>
        </div>
      </div>
    );
  }

  // ── Free — inline upgrade CTA ──
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] px-6">
      <div className="w-full max-w-md space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <Mail className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-[17px] font-semibold tracking-tight text-black dark:text-white">
            Give your agent its own email
          </h2>
          <p className="text-[12px] text-black/50 dark:text-white/50 leading-relaxed">
            A real <span className="font-medium text-black/70 dark:text-white/60">@agents.construct.computer</span>{' '}
            inbox your agent can send and receive mail from. Available on any paid plan.
          </p>
        </div>

        {/* Plan buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleUpgrade('starter')}
            disabled={!!upgrading}
            className="group flex flex-col items-start gap-1 rounded-xl border border-black/10 dark:border-white/10
              bg-white/60 dark:bg-black/30 hover:bg-white/80 dark:hover:bg-black/40
              px-4 py-3 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[12px] font-semibold text-black dark:text-white">Starter</span>
              {upgrading === 'starter'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-black/50 dark:text-white/50" />
                : <ArrowRight className="w-3.5 h-3.5 text-black/30 dark:text-white/30 group-hover:translate-x-0.5 transition-transform" />
              }
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[18px] font-bold text-black dark:text-white tracking-tight">$59</span>
              <span className="text-[10.5px] text-black/40 dark:text-white/40">/mo</span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400/80 font-medium">1-day free trial</span>
          </button>

          <button
            type="button"
            onClick={() => handleUpgrade('pro')}
            disabled={!!upgrading}
            className="group relative flex flex-col items-start gap-1 rounded-xl border border-emerald-500/30
              bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14]
              px-4 py-3 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[12px] font-semibold text-black dark:text-white flex items-center gap-1">
                Pro
                <Sparkles className="w-2.5 h-2.5 text-emerald-500 dark:text-emerald-400" />
              </span>
              {upgrading === 'pro'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                : <ArrowRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
              }
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[18px] font-bold text-black dark:text-white tracking-tight">$299</span>
              <span className="text-[10.5px] text-black/40 dark:text-white/40">/mo</span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400/80 font-medium">3-day free trial</span>
          </button>
        </div>

        <p className="text-[10.5px] text-center text-black/40 dark:text-white/40 leading-relaxed">
          Already upgraded? This will update automatically.
        </p>
      </div>
    </div>
  );
}
