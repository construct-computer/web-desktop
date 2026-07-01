/**
 * PlanPanel — subscription plan management.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';
import { useBillingConfirmStore } from '@/stores/billingConfirmStore';
import { getBillingPlans, type BillingPlanId, type BillingPlanInfo, type SubscriptionInfo } from '@/services/api';
import { BILLING_PLAN_ORDER } from '@/lib/billingPlans';
import { LITE_FEATURES, STARTER_FEATURES, PRO_FEATURES, type PlanFeature } from '../../../screens/subscribePlanCopy';
import {
  buildConfirmCopy,
  formatBillingDate,
  formatMoneyFromMinor,
  formatPlanName,
  getBillingNotice,
  isUpgradePlan,
  planSummaryLine,
  type BillingNotice,
} from './billingCopy';

const PLAN_FEATURES: Record<BillingPlanId, PlanFeature[]> = {
  lite: LITE_FEATURES,
  starter: STARTER_FEATURES,
  pro: PRO_FEATURES,
};

function isPaidPlan(plan: string | null | undefined): plan is BillingPlanId {
  return plan === 'lite' || plan === 'starter' || plan === 'pro';
}

function isInactiveSubscriptionStatus(status: string | null | undefined): boolean {
  const normalized = (status || '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'canceled' || normalized === 'expired' || normalized === 'failed';
}

function getDisplayPlan(subscription: SubscriptionInfo | null): BillingPlanId | 'unsubscribed' {
  if (!subscription) return 'unsubscribed';
  if (isInactiveSubscriptionStatus(subscription.status)) return 'unsubscribed';
  const plan = subscription.plan || subscription.storedPlan || 'unsubscribed';
  return isPaidPlan(plan) ? plan : 'unsubscribed';
}

function isLiteTrialActive(subscription: SubscriptionInfo | null): boolean {
  if (!subscription?.trialEndsAt || subscription.trialEndsAt <= Date.now()) return false;
  if (isInactiveSubscriptionStatus(subscription.status)) return false;
  const plan = subscription.storedPlan || subscription.plan;
  return plan === 'lite';
}

function BillingStatusBanner({ notice }: { notice: BillingNotice }) {
  const borderClass = notice.tone === 'danger'
    ? 'border-red-500/20 bg-red-500/10'
    : notice.tone === 'warning'
      ? 'border-amber-500/20 bg-amber-500/10'
      : 'border-cyan-500/20 bg-cyan-500/[0.06]';

  const iconClass = notice.tone === 'danger'
    ? 'text-red-500'
    : notice.tone === 'warning'
      ? 'text-amber-500'
      : 'text-cyan-600 dark:text-cyan-400';

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[12px] text-[var(--color-text)] ${borderClass}`}>
      <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{notice.title}</div>
        <p className="mt-0.5 leading-relaxed text-[var(--color-text-muted)]">{notice.body}</p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  features,
  currentPlan,
  actionLabel,
  badge,
  loading,
  onClick,
}: {
  plan: BillingPlanInfo;
  features: PlanFeature[];
  currentPlan: BillingPlanId | 'unsubscribed';
  actionLabel: string;
  badge?: string | null;
  loading?: boolean;
  onClick: () => void;
}) {
  const isCurrent = plan.id === currentPlan;
  const isPro = plan.id === 'pro';

  const cardClass = isPro
    ? 'border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.03]'
    : plan.id === 'lite'
      ? 'border-black/5 dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]'
      : 'border-black/5 dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.025]';

  return (
    <div className={`rounded-2xl border p-5 flex flex-col relative overflow-hidden ${cardClass} ${isCurrent ? 'ring-1 ring-[var(--color-accent)]/20' : ''}`}>
      {isPro && !isCurrent && !badge && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
            Popular
          </span>
        </div>
      )}
      {isCurrent && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] uppercase tracking-widest">
            Current
          </span>
        </div>
      )}
      {badge && !isCurrent && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 uppercase tracking-widest">
            {badge}
          </span>
        </div>
      )}

      <div className="mb-3">
        <h2 className="text-[15px] text-gray-900 dark:text-white font-semibold mb-0.5">{plan.name}</h2>
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] text-gray-900 dark:text-white font-bold tracking-tight">{plan.priceLabel}</span>
          {plan.period && <span className="text-gray-400 dark:text-white/30 text-sm">{plan.period}</span>}
        </div>
      </div>

      <div className="space-y-2 mb-4 flex-1">
        {features.map(({ icon: Icon, text, highlight }) => (
          <div key={text} className="flex items-start gap-2.5">
            <Icon className={`w-3.5 h-3.5 mt-[3px] flex-shrink-0 ${highlight ? 'text-emerald-500 dark:text-emerald-400' : plan.id === 'lite' ? 'text-blue-500/70 dark:text-blue-400/70' : 'text-emerald-500/60 dark:text-emerald-400/60'}`} />
            <span className={`text-[12px] leading-snug ${highlight ? 'text-gray-700 dark:text-white/70 font-medium' : 'text-gray-500 dark:text-white/50'}`}>{text}</span>
          </div>
        ))}
      </div>

      <Button
        onClick={onClick}
        disabled={!!loading || isCurrent}
        className="w-full"
        variant={isPro ? 'primary' : 'default'}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : actionLabel}
      </Button>
    </div>
  );
}

export function PlanPanel() {
  const {
    subscription,
    subscriptionLoading,
    fetchSubscription,
    openPortal,
    startCheckout,
    previewPlanChange,
    switchPlan,
    upgradeFromTrial,
    cancelSubscription,
    resumeSubscription,
    updatePaymentMethod,
  } = useBillingStore();

  const setBillingConfirm = useBillingConfirmStore((s) => s.setConfirm);

  const [checkoutLoading, setCheckoutLoading] = useState<BillingPlanId | null>(null);
  const [secondaryLoading, setSecondaryLoading] = useState<string | null>(null);
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

  const handleCheckout = useCallback(async (plan: BillingPlanId) => {
    setCheckoutLoading(plan);
    const url = await startCheckout(plan);
    if (url) window.location.href = url;
    setCheckoutLoading(null);
  }, [startCheckout]);

  const handleSwitchPlan = useCallback(async (plan: BillingPlanId) => {
    setCheckoutLoading(plan);
    const result = await switchPlan(plan);
    if (result === true) {
      setCheckoutLoading(null);
      return;
    }
    if (typeof result === 'object' && result.redirectToCheckout) {
      await handleCheckout(result.targetPlan as BillingPlanId);
      return;
    }
    setCheckoutLoading(null);
  }, [switchPlan, handleCheckout]);

  const handlePlanAction = useCallback(async (plan: BillingPlanId) => {
    if (subscription?.environment === 'staging' || subscription?.environment === 'local') {
      await handleSwitchPlan(plan);
      return;
    }

    const billingPlan = getDisplayPlan(subscription);
    if (!subscription?.dodoSubscriptionId || billingPlan === 'unsubscribed') {
      const copy = buildConfirmCopy({ kind: 'checkout', targetPlan: plan });
      setBillingConfirm({
        ...copy,
        onConfirm: () => void handleCheckout(plan),
      });
      return;
    }

    if (plan === billingPlan) return;

    if (isLiteTrialActive(subscription) && isUpgradePlan(billingPlan, plan)) {
      if (subscription?.environment === 'staging' || subscription?.environment === 'local') {
        await handleSwitchPlan(plan);
        return;
      }
      if (plan !== 'starter' && plan !== 'pro') return;
      const trialTarget = plan;
      const copy = buildConfirmCopy({
        kind: 'trial-upgrade',
        targetPlan: trialTarget,
        currentPlan: billingPlan,
      });
      setBillingConfirm({
        ...copy,
        onConfirm: async () => {
          setCheckoutLoading(trialTarget);
          const url = await upgradeFromTrial(trialTarget);
          if (url) window.location.href = url;
          setCheckoutLoading(null);
        },
      });
      return;
    }

    setCheckoutLoading(plan);
    const preview = await previewPlanChange(plan);
    setCheckoutLoading(null);
    if (preview === null) return;

    const previewCharge = preview?.immediate_charge?.summary;
    const previewAmount = formatMoneyFromMinor(previewCharge?.total_amount, previewCharge?.currency);
    const isDowngrade = BILLING_PLAN_ORDER.indexOf(plan) < BILLING_PLAN_ORDER.indexOf(billingPlan as BillingPlanId);
    const periodEndDate = formatBillingDate(subscription?.currentPeriodEnd ?? null);

    const copy = buildConfirmCopy({
      kind: isDowngrade ? 'downgrade' : 'upgrade',
      targetPlan: plan,
      currentPlan: billingPlan,
      previewAmount,
      periodEndDate,
    });

    setBillingConfirm({
      ...copy,
      onConfirm: () => void handleSwitchPlan(plan),
    });
  }, [
    handleCheckout,
    handleSwitchPlan,
    previewPlanChange,
    setBillingConfirm,
    subscription,
    upgradeFromTrial,
  ]);

  const handleOpenPortal = useCallback(async () => {
    setSecondaryLoading('portal');
    const result = await openPortal();
    setSecondaryLoading(null);
    if ('url' in result) window.location.href = result.url;
  }, [openPortal]);

  const handleCancel = useCallback(() => {
    const onTrial = isLiteTrialActive(subscription);
    const copy = buildConfirmCopy({
      kind: onTrial ? 'cancel-trial' : 'cancel-period-end',
      periodEndDate: formatBillingDate(subscription?.currentPeriodEnd ?? null),
    });
    setBillingConfirm({
      ...copy,
      onConfirm: async () => {
        setSecondaryLoading('cancel');
        await cancelSubscription();
        setSecondaryLoading(null);
      },
    });
  }, [cancelSubscription, setBillingConfirm, subscription]);

  const handleResume = useCallback(() => {
    const currentPlan = getDisplayPlan(subscription);
    const copy = buildConfirmCopy({
      kind: 'resume',
      currentPlan,
    });
    setBillingConfirm({
      ...copy,
      onConfirm: async () => {
        setSecondaryLoading('resume');
        await resumeSubscription();
        setSecondaryLoading(null);
      },
    });
  }, [resumeSubscription, setBillingConfirm, subscription]);

  const handlePaymentMethod = useCallback(async () => {
    setSecondaryLoading('payment');
    const result = await updatePaymentMethod();
    setSecondaryLoading(null);
    if ('url' in result) window.location.href = result.url;
  }, [updatePaymentMethod]);

  const currentPlan = getDisplayPlan(subscription);
  const currentPlanLabel = formatPlanName(currentPlan);
  const isNonProd = subscription?.environment === 'staging' || subscription?.environment === 'local';
  const billingNotice = getBillingNotice(subscription);
  const canManageBilling = !isNonProd && !!subscription?.dodoCustomerId && subscription.dodoCustomerId !== 'admin_grant';
  const billingStatus = (subscription?.status || '').toLowerCase();
  const hasPaymentIssue = billingStatus === 'on_hold' || billingStatus === 'past_due';
  const liteTrialActive = isLiteTrialActive(subscription);
  const canCancel = canManageBilling && isPaidPlan(currentPlan) && !subscription?.cancelAtPeriodEnd && billingStatus === 'active';
  const canResume = canManageBilling && (!!subscription?.cancelAtPeriodEnd || !!subscription?.scheduledPlan);
  const summary = planSummaryLine({ currentPlan, canManageBilling, isNonProd });

  const orderedPlans = BILLING_PLAN_ORDER
    .map((id) => plans.find((plan) => plan.id === id))
    .filter((plan): plan is BillingPlanInfo => !!plan);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.04] p-4 space-y-4">
        {subscriptionLoading && !subscription ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading subscription...
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-text">
                  Current plan: {currentPlanLabel}
                </div>
                <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
                  {summary}
                </p>
              </div>

              <Button
                size="md"
                variant="default"
                disabled={!canManageBilling || subscriptionLoading || secondaryLoading === 'portal'}
                onClick={canManageBilling ? handleOpenPortal : undefined}
                className="shrink-0 gap-1.5"
              >
                {secondaryLoading === 'portal' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : canManageBilling ? <ExternalLink className="w-3.5 h-3.5" /> : null}
                Manage Subscription
              </Button>
            </div>

            {billingNotice && <BillingStatusBanner notice={billingNotice} />}

            {(hasPaymentIssue || canCancel || canResume) && (
              <div className="flex flex-wrap gap-2">
                {hasPaymentIssue && (
                  <Button size="sm" variant="primary" disabled={secondaryLoading === 'payment'} onClick={handlePaymentMethod}>
                    {secondaryLoading === 'payment' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Update payment method
                  </Button>
                )}
                {canResume && (
                  <Button size="sm" variant="default" disabled={secondaryLoading === 'resume'} onClick={handleResume}>
                    {secondaryLoading === 'resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Undo scheduled change
                  </Button>
                )}
                {canCancel && (
                  <Button size="sm" variant="default" disabled={secondaryLoading === 'cancel'} onClick={handleCancel}>
                    {secondaryLoading === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {liteTrialActive ? 'End trial' : 'Cancel at period end'}
                  </Button>
                )}
              </div>
            )}

            {plansLoading && orderedPlans.length === 0 ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading plan details...
              </div>
            ) : orderedPlans.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {orderedPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    features={PLAN_FEATURES[plan.id]}
                    currentPlan={currentPlan as BillingPlanId | 'unsubscribed'}
                    actionLabel={(() => {
                      if (plan.id === currentPlan) return 'Current plan';
                      if (subscription?.scheduledPlan === plan.id) return 'Scheduled';
                      if (!isPaidPlan(currentPlan)) return `Get ${plan.name}`;
                      return isUpgradePlan(currentPlan, plan.id)
                        ? `Upgrade to ${plan.name}`
                        : `Downgrade to ${plan.name}`;
                    })()}
                    badge={subscription?.scheduledPlan === plan.id ? 'Scheduled' : null}
                    loading={checkoutLoading === plan.id}
                    onClick={() => void handlePlanAction(plan.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-[var(--color-text-muted)] py-4">
                Plan details are not available right now.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
