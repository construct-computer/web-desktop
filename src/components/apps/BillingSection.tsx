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
import { Button, InfoHint } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';
import { getBillingPlans, type BillingPlanInfo, type SubscriptionInfo } from '@/services/api';
import { AGENT_EMAIL_DOMAIN } from '@/lib/config';
import { BILLING_PLAN_ORDER, buildBillingFeatureRows } from '@/lib/billingPlans';

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
      action: subscription.dodoCustomerId ? 'Manage subscription' : undefined,
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
      action: subscription.dodoCustomerId ? 'Manage subscription' : undefined,
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
  const [plans, setPlans] = useState<BillingPlanInfo[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const result = await getBillingPlans();
      if (result.success) setPlans(result.data.plans);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchSubscription();
    fetchPlans();
    const refreshWhenVisible = () => {
      if (!document.hidden) {
        fetchSubscription();
        fetchPlans();
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('online', fetchSubscription);
    window.addEventListener('online', fetchPlans);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('online', fetchSubscription);
      window.removeEventListener('online', fetchPlans);
    };
  }, [fetchPlans, fetchSubscription]);

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
  const canManageBilling = !isNonProd && !!subscription?.dodoCustomerId;

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
                    ? 'Manage your subscription, invoices, payment details, and cancellation in the Dodo Payments portal.'
                    : isNonProd
                      ? 'Plan changes are handled directly in this environment.'
                      : 'Billing portal becomes available after checkout.'}
                </p>
              </div>
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
              plans={plans}
              plansLoading={plansLoading}
              isDevMode={isDevMode}
              canManageBilling={canManageBilling}
              portalLoading={portalLoading}
              checkoutLoading={checkoutLoading}
              onSwitchPlan={handleSwitchPlan}
              onCheckout={handleCheckout}
              onManage={handleManage}
            />
          </div>
        )}
      </InfoCard>
    </div>
  );
}

// ── Plan Selector (plan cards + feature comparison in one) ──

type PlanId = 'free' | 'starter' | 'pro';

function PlanSelector({
  currentPlan,
  plans,
  plansLoading,
  isDevMode,
  canManageBilling,
  portalLoading,
  checkoutLoading,
  onSwitchPlan,
  onCheckout,
  onManage,
}: {
  currentPlan: string;
  plans: BillingPlanInfo[];
  plansLoading: boolean;
  isDevMode: boolean;
  canManageBilling: boolean;
  portalLoading: boolean;
  checkoutLoading: boolean;
  onSwitchPlan: (plan: 'free' | 'starter' | 'pro') => void;
  onCheckout: (plan: 'starter' | 'pro') => void;
  onManage: () => void;
}) {
  const effective = BILLING_PLAN_ORDER.includes(currentPlan as PlanId) ? currentPlan as PlanId : 'free';
  const currentIndex = BILLING_PLAN_ORDER.indexOf(effective);
  const orderedPlans = BILLING_PLAN_ORDER
    .map((id) => plans.find((plan) => plan.id === id))
    .filter((plan): plan is BillingPlanInfo => !!plan);
  const upgradePlans = orderedPlans.filter((plan) => BILLING_PLAN_ORDER.indexOf(plan.id) > currentIndex);
  const features = buildBillingFeatureRows(plans, effective, AGENT_EMAIL_DOMAIN);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-text">Upgrade options</div>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {upgradePlans.length > 0
              ? 'Only higher plans are shown here.'
              : 'You are on the highest available plan.'}
          </p>
        </div>
        {canManageBilling && (
          <Button
            size="sm"
            variant="default"
            onClick={onManage}
            disabled={portalLoading}
            className="shrink-0"
          >
            {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            Manage subscription
          </Button>
        )}
      </div>

      <div className={`settings-plan-grid grid gap-2 ${upgradePlans.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {upgradePlans.map((p) => {
          const targetIndex = BILLING_PLAN_ORDER.indexOf(p.id);
          const isUpgrade = targetIndex > currentIndex;
          return (
            <div
              key={p.id}
              className="p-3 rounded-lg border border-black/[0.06] dark:border-white/[0.06] text-center"
            >
              <span className="text-[13px] font-semibold">{p.name}</span>
              <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                <span className="text-[18px] font-bold">{p.priceLabel}</span>
                {p.period && <span className="text-[11px] text-[var(--color-text-muted)]">{p.period}</span>}
              </div>
              <Button
                size="sm"
                variant={isUpgrade ? 'primary' : 'default'}
                onClick={() => {
                  if (isDevMode) onSwitchPlan(p.id);
                  else onCheckout(p.id as 'starter' | 'pro');
                }}
                disabled={checkoutLoading}
                className="w-full mt-2"
              >
                {checkoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Upgrade'}
              </Button>
            </div>
          );
        })}
        {plansLoading && upgradePlans.length === 0 && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.06] px-3 py-6 text-[12px] text-[var(--color-text-muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading plan details...
          </div>
        )}
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
        {features.length === 0 && plansLoading ? (
          <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-[var(--color-text-muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading plan details...
          </div>
        ) : features.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-[var(--color-text-muted)]">
            Plan details are not available right now.
          </div>
        ) : features.map((f, i) => (
          <div
            key={f.label}
            className={`grid grid-cols-[1fr_84px_84px_84px] items-center px-3 py-2 text-[11px] ${
              i % 2 === 0 ? '' : 'bg-black/[0.015] dark:bg-white/[0.015]'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-text-muted)] select-none transition-colors">
                {f.label}
              </span>
              <InfoHint side="top">{f.tooltip}</InfoHint>
            </div>
            {(['free', 'starter', 'pro'] as const).map((tier) => {
              const currentCell = f.cells[tier];
              const has = currentCell.enabled;
              const val = currentCell.value;
              const color = currentCell.color;
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

      <p className="text-[11px] text-[var(--color-text-muted)]">
        BYOK is available on every plan.
      </p>
    </div>
  );
}
