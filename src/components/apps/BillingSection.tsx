/**
 * BillingSection — Subscription management and usage dashboard.
 * Rendered inside SettingsWindow as a section.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  ExternalLink,
  Loader2,
  Check,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import { Button, Tooltip } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';
import type { SubscriptionInfo } from '@/services/api';

/* ── Reusable card wrapper ── */

function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.04] ${className}`}>
      {children}
    </div>
  );
}

type BillingNotice = {
  tone: 'warning' | 'danger' | 'info';
  title: string;
  body: string;
  action?: string;
};

function formatBillingDate(timestamp: number | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPlanName(plan: string): string {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function getBillingNotice(subscription: SubscriptionInfo | null): BillingNotice | null {
  if (!subscription) return null;

  const status = (subscription.status || '').toLowerCase();
  if (status === 'past_due' || status === 'on_hold') {
    return {
      tone: 'danger',
      title: 'Payment overdue',
      body: 'Your subscription payment failed. Paid features and usage limits have been downgraded until billing is fixed.',
      action: 'Update payment method',
    };
  }

  if (status === 'failed') {
    return {
      tone: 'danger',
      title: 'Subscription payment failed',
      body: 'Your paid subscription is inactive. Update billing to restore paid features and limits.',
      action: 'Manage billing',
    };
  }

  if (status === 'expired' || status === 'cancelled' || status === 'canceled') {
    return {
      tone: 'danger',
      title: 'Subscription inactive',
      body: 'Your paid subscription is no longer active, so this workspace is using the Free plan.',
      action: subscription.dodoSubscriptionId ? 'Manage billing' : undefined,
    };
  }

  if (subscription.cancelAtPeriodEnd) {
    const endDate = formatBillingDate(subscription.currentPeriodEnd);
    return {
      tone: 'warning',
      title: 'Cancellation scheduled',
      body: endDate
        ? `Your paid access remains active until ${endDate}. After that, your workspace will move to the Free plan.`
        : 'Your paid access remains active until the current billing period ends.',
      action: subscription.dodoSubscriptionId ? 'Manage billing' : undefined,
    };
  }

  return null;
}

function BillingStatusBanner({
  notice,
  canManage,
  portalLoading,
  onManage,
}: {
  notice: BillingNotice;
  canManage: boolean;
  portalLoading: boolean;
  onManage: () => void;
}) {
  const toneClass = notice.tone === 'danger'
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : notice.tone === 'warning'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] ${toneClass}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{notice.title}</div>
        <p className="mt-0.5 leading-relaxed">{notice.body}</p>
      </div>
      {notice.action && canManage && (
        <button
          type="button"
          onClick={onManage}
          disabled={portalLoading}
          className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold hover:bg-white/15 disabled:opacity-50"
        >
          {portalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
          {notice.action}
        </button>
      )}
    </div>
  );
}

export function BillingSection() {
  const {
    subscription,
    subscriptionLoading,
    fetchSubscription,
    startCheckout,
    switchPlan,
    openPortal,
  } = useBillingStore();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const handleCheckout = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(true);
    console.log('[BillingSection] handleCheckout called with plan:', plan);
    const url = await startCheckout(plan);
    if (url) window.location.href = url;
    setCheckoutLoading(false);
  }, [startCheckout]);

  const handleSwitchPlan = useCallback(async (plan: 'free' | 'starter' | 'pro') => {
    setCheckoutLoading(true);
    const result = await switchPlan(plan);
    setCheckoutLoading(false);
    if (result === true) {
      window.location.reload();
    } else if (typeof result === 'object' && result.redirectToCheckout) {
      // If upgrade required, redirect to checkout
      handleCheckout(result.targetPlan as 'starter' | 'pro');
    }
  }, [switchPlan, handleCheckout]);

  const handleManage = useCallback(async () => {
    setPortalLoading(true);
    try {
      const result = await openPortal();
      if ('url' in result) window.location.href = result.url;
    } finally {
      setPortalLoading(false);
    }
  }, [openPortal]);

  const currentPlan = subscription?.plan || 'free';
  const currentPlanLabel = formatPlanName(currentPlan);
  const isNonProd = subscription?.environment === 'staging' || subscription?.environment === 'local';
  const isDevMode = isNonProd || !subscription?.dodoSubscriptionId;
  const billingNotice = getBillingNotice(subscription);
  const canManageBilling = !isDevMode && !!subscription?.dodoSubscriptionId;

  return (
    <div className="space-y-4">
      {/* ── Plan Selection ── */}
      <InfoCard>
        {subscriptionLoading && !subscription ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] px-4 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading subscription...
          </div>
        ) : (
          <div className="px-4 pt-3.5 pb-4 space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-black/6 dark:border-white/6 bg-black/2 dark:bg-white/3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-text">
                  Current plan: {currentPlanLabel}
                </div>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {canManageBilling
                    ? 'Manage invoices, payment details, and cancellation in the billing portal.'
                    : isNonProd
                      ? 'Plan changes are handled directly in this environment.'
                      : 'Billing portal becomes available after checkout.'}
                </p>
              </div>
              {canManageBilling && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleManage}
                  disabled={portalLoading}
                  className="shrink-0 gap-1.5"
                >
                  {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  Manage billing
                </Button>
              )}
            </div>

            {billingNotice && (
              <BillingStatusBanner
                notice={billingNotice}
                canManage={canManageBilling && billingNotice.action !== 'Manage billing'}
                portalLoading={portalLoading}
                onManage={handleManage}
              />
            )}

            <PlanSelector
              currentPlan={currentPlan}
              isDevMode={isDevMode}
              checkoutLoading={checkoutLoading}
              onSwitchPlan={handleSwitchPlan}
              onCheckout={handleCheckout}
            />
          </div>
        )}
      </InfoCard>
    </div>
  );
}

// ── Plan Selector (plan cards + feature comparison in one) ──

type PlanId = 'free' | 'starter' | 'pro';
const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];

type FeatureRow = {
  label: string;
  tooltip: string;
  free: string;
  starter: string;
  pro: string;
  freeHas: boolean;
  starterHas: boolean;
  proHas: boolean;
  freeColor?: string;
  starterColor?: string;
  proColor?: string;
};

const PLAN_FEATURES: FeatureRow[] = [
  { label: 'Agent Reasoning Depth', tooltip: 'How deeply the agent thinks before giving up on a task. Higher steps allow it to solve much harder multi-step problems autonomously.', free: '15 steps/task',   starter: '50 steps/task', pro: '100 steps/task', freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Task Execution Timeout',tooltip: 'Maximum continuous time an agent is allowed to run a single task in the background sandbox.', free: '5 minutes',       starter: '1 hour',        pro: '3 hours',        freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Concurrent Subagents',  tooltip: 'How many separate tasks or workers the agent can parallelize at the exact same time to speed up bulk work.', free: '2 active',        starter: '6 active',      pro: 'Unlimited',      freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Scheduled Tasks',       tooltip: 'Routines and cron-jobs you can tell your agent to run repeatedly on a schedule (e.g. "Check my email every morning").', free: 'Up to 3',         starter: 'Up to 10',      pro: 'Unlimited',      freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Cloud Storage',         tooltip: 'Space for files, PDFs, images, and documents stored in your virtual workspace.', free: '100 MB',          starter: '1 GB',          pro: '3 GB',           freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Platform Integrations', tooltip: 'Connect external apps (Slack, Gmail, GitHub, Notion, etc.) for your agent to interact with.', free: 'Full Library',    starter: 'Full Library',  pro: 'Full Library',   freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Agent Email Address',   tooltip: 'Get a dedicated @agents.construct.computer email address that your agent can autonomously read and reply from.', free: '',                starter: '',              pro: '',               freeHas: false, starterHas: true,  proHas: true },
  { label: 'Background Execution',  tooltip: 'Allow agents to continue long-running tasks asynchronously even after you close the app or go offline.', free: '',                starter: '',              pro: '',               freeHas: false, starterHas: true,  proHas: true },
  { label: 'Bring Your Own Keys',   tooltip: 'Use your own LLM API keys (OpenAI, Anthropic, etc.) to completely bypass standard platform usage caps.', free: '',                starter: '',              pro: '',               freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Priority Support',      tooltip: 'Get 24/7 dedicated support with fast response times from our engineering team.', free: '',                starter: '',              pro: '',               freeHas: false, starterHas: true,  proHas: true },
];

/** Weekly usage caps in USD (mirror of worker/src/config/tiers.ts TIER_LIMITS). */
const WEEKLY_CAPS: Record<PlanId, number> = { free: 1, starter: 8, pro: 45 };

/** Format a cap ratio as a readable label, e.g. 8 → "8× more", 0.125 → "8× less". */
function formatMultiplier(ratio: number): string {
  if (Math.abs(ratio - 1) < 0.01) return '1×';
  if (ratio > 1) return `${Math.round(ratio)}× more`;
  return `${Math.round(1 / ratio)}× less`;
}

/** Green for upgrades, red for downgrades, empty (use default) for the current plan. */
function multiplierColor(ratio: number): string | undefined {
  if (Math.abs(ratio - 1) < 0.01) return undefined;
  return ratio > 1 ? 'text-emerald-400' : 'text-red-400';
}

function PlanSelector({ currentPlan, isDevMode, checkoutLoading, onSwitchPlan, onCheckout }: {
  currentPlan: string;
  isDevMode: boolean;
  checkoutLoading: boolean;
  onSwitchPlan: (plan: 'free' | 'starter' | 'pro') => void;
  onCheckout: (plan: 'starter' | 'pro') => void;
}) {
  const effective = (currentPlan || 'free') as PlanId;
  const currentIndex = PLAN_ORDER.indexOf(effective);

  const plans: { id: PlanId; name: string; price: string; period: string }[] = [
    { id: 'free', name: 'Free', price: '$0', period: '' },
    { id: 'starter', name: 'Starter', price: '$59', period: '/mo' },
    { id: 'pro', name: 'Pro', price: '$299', period: '/mo' },
  ];

  // Usage row is computed relative to the active plan so "1×" always marks
  // the user's current baseline and the other tiers show how much more (or
  // less) usage they'd get.
  const freeRatio    = WEEKLY_CAPS.free    / WEEKLY_CAPS[effective];
  const starterRatio = WEEKLY_CAPS.starter / WEEKLY_CAPS[effective];
  const proRatio     = WEEKLY_CAPS.pro     / WEEKLY_CAPS[effective];
  const usageRow: FeatureRow = {
    label: 'Usage',
    tooltip: 'Standard platform LLM usage included relative to your current plan. Heavy tasks burn through this budget. Bring Your Own Keys (BYOK) bypasses this.',
    free:    formatMultiplier(freeRatio),
    starter: formatMultiplier(starterRatio),
    pro:     formatMultiplier(proRatio),
    freeHas: true, starterHas: true, proHas: true,
    freeColor:    multiplierColor(freeRatio),
    starterColor: multiplierColor(starterRatio),
    proColor:     multiplierColor(proRatio),
  };
  const features: FeatureRow[] = [usageRow, ...PLAN_FEATURES];

  return (
    <div className="space-y-3">
      {/* Plan cards row */}
      <div className="grid grid-cols-3 gap-2">
        {plans.map((p) => {
          const isCurrent = p.id === effective;
          const targetIndex = PLAN_ORDER.indexOf(p.id);
          const isUpgrade = targetIndex > currentIndex;
          return (
            <div
              key={p.id}
              className={`p-3 rounded-lg border text-center ${
                isCurrent
                  ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent)]/[0.04]'
                  : 'border-black/[0.06] dark:border-white/[0.06]'
              }`}
            >
              <span className="text-[13px] font-semibold">{p.name}</span>
              <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                <span className="text-[18px] font-bold">{p.price}</span>
                {p.period && <span className="text-[11px] text-[var(--color-text-muted)]">{p.period}</span>}
              </div>
              {isCurrent ? (
                <div className="mt-2 text-[11px] font-medium text-[var(--color-accent)] py-1">Current</div>
              ) : (
                <Button
                  size="sm"
                  variant={isUpgrade ? 'primary' : 'default'}
                  onClick={() => {
                    if (p.id === 'free' || isDevMode) onSwitchPlan(p.id);
                    else onCheckout(p.id as 'starter' | 'pro');
                  }}
                  disabled={checkoutLoading}
                  className="w-full mt-2"
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isUpgrade ? (
                    'Upgrade'
                  ) : (
                    'Switch'
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature comparison table — scroll horizontally on narrow viewports */}
      <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.06] overflow-x-auto">
        <div className="min-w-[420px]">
        <div className="grid grid-cols-[1fr_84px_84px_84px] text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
          <span />
          <span className="text-center">Free</span>
          <span className="text-center">Starter</span>
          <span className="text-center">Pro</span>
        </div>
        {features.map((f, i) => (
          <div
            key={f.label}
            className={`grid grid-cols-[1fr_84px_84px_84px] items-center px-3 py-2 text-[11px] ${
              i % 2 === 0 ? '' : 'bg-black/[0.015] dark:bg-white/[0.015]'
            }`}
          >
            <div className="flex items-center">
              <Tooltip 
                content={f.tooltip} 
                followCursor
                delay={0}
              >
                <span className="text-[var(--color-text-muted)] select-none transition-colors">
                  {f.label}
                </span>
              </Tooltip>
            </div>
            {(['free', 'starter', 'pro'] as const).map((tier) => {
              const has = f[`${tier}Has`];
              const val = f[tier];
              const color = f[`${tier}Color`];
              const valClass = tier === effective
                ? 'text-[var(--color-text)] font-medium'
                : color || 'text-[var(--color-text-muted)]';
              return (
                <span key={tier} className="text-center">
                  {has ? (
                    val ? (
                      <span className={valClass}>{val}</span>
                    ) : (
                      <Check className="w-3 h-3 text-emerald-400 mx-auto" />
                    )
                  ) : (
                    <Minus className="w-3.5 h-3.5 text-[var(--color-text-muted)] opacity-40 mx-auto" />
                  )}
                </span>
              );
            })}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
