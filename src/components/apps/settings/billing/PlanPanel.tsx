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
import { getBillingPlans, type BillingPlanId, type BillingPlanInfo, type SubscriptionInfo } from '@/services/api';
import { BILLING_PLAN_ORDER } from '@/lib/billingPlans';
import { LITE_FEATURES, STARTER_FEATURES, PRO_FEATURES, type PlanFeature } from '../../../screens/subscribePlanCopy';

type BillingNotice = {
  tone: 'warning' | 'danger' | 'info';
  title: string;
  body: string;
};

const PLAN_FEATURES: Record<BillingPlanId, PlanFeature[]> = {
  lite: LITE_FEATURES,
  starter: STARTER_FEATURES,
  pro: PRO_FEATURES,
};

function formatBillingDate(timestamp: number | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPlanName(plan: string): string {
  if (!plan || plan === 'unsubscribed') return 'Unsubscribed';
  if (plan === 'free') return 'Unsubscribed';
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
    };
  }

  if (status === 'failed') {
    return {
      tone: 'danger',
      title: 'Subscription payment failed',
      body: 'Your paid subscription is inactive. Update billing to restore paid features and limits.',
    };
  }

  if (status === 'expired' || status === 'cancelled' || status === 'canceled') {
    return {
      tone: 'danger',
      title: 'Subscription inactive',
      body: 'Your paid subscription is no longer active, so this workspace is unsubscribed.',
    };
  }

  if (subscription.cancelAtPeriodEnd) {
    const endDate = formatBillingDate(subscription.currentPeriodEnd);
    return {
      tone: 'warning',
      title: 'Cancellation scheduled',
      body: endDate
        ? `Your paid access remains active until ${endDate}. After that, your workspace will be unsubscribed.`
        : 'Your paid access remains active until the current billing period ends.',
    };
  }

  return null;
}

function BillingStatusBanner({ notice }: { notice: BillingNotice }) {
  const toneClass = notice.tone === 'danger'
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : notice.tone === 'warning'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[12px] ${toneClass}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{notice.title}</div>
        <p className="mt-0.5 leading-relaxed">{notice.body}</p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  features,
  currentPlan,
  loading,
  onClick,
}: {
  plan: BillingPlanInfo;
  features: PlanFeature[];
  currentPlan: BillingPlanId | 'unsubscribed';
  loading?: boolean;
  onClick: () => void;
}) {
  const currentIndex = BILLING_PLAN_ORDER.indexOf(currentPlan as BillingPlanId);
  const targetIndex = BILLING_PLAN_ORDER.indexOf(plan.id);
  const isCurrent = plan.id === currentPlan;
  const isPro = plan.id === 'pro';

  const cardClass = isPro
    ? 'border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.03]'
    : plan.id === 'lite'
      ? 'border-black/5 dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]'
      : 'border-black/5 dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.025]';

  const buttonLabel = isCurrent
    ? 'Current plan'
    : currentIndex < 0
      ? `Get ${plan.name}`
      : targetIndex > currentIndex
        ? `Upgrade to ${plan.name}`
        : 'Manage plan';

  return (
    <div className={`rounded-2xl border p-5 flex flex-col relative overflow-hidden ${cardClass} ${isCurrent ? 'ring-1 ring-[var(--color-accent)]/20' : ''}`}>
      {isPro && !isCurrent && (
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
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : buttonLabel}
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
    switchPlan,
  } = useBillingStore();

  const [checkoutLoading, setCheckoutLoading] = useState<BillingPlanId | null>(null);
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
      window.location.reload();
      return;
    }
    if (typeof result === 'object' && result.redirectToCheckout) {
      await handleCheckout(result.targetPlan as BillingPlanId);
      return;
    }
    setCheckoutLoading(null);
  }, [switchPlan, handleCheckout]);

  const currentPlan = subscription?.plan || 'unsubscribed';
  const currentPlanLabel = formatPlanName(currentPlan);
  const isNonProd = subscription?.environment === 'staging' || subscription?.environment === 'local';
  const billingNotice = getBillingNotice(subscription);
  const canManageBilling = currentPlan !== 'unsubscribed' && !isNonProd && !!subscription?.dodoCustomerId;
  const summary = currentPlan === 'unsubscribed'
    ? 'Plan details are shown below. Paid plan management is available after you subscribe.'
    : canManageBilling
      ? 'Manage your subscription, invoices, payment details, and cancellation in the Dodo Payments portal.'
      : isNonProd
        ? 'Plan changes are disabled in this environment.'
        : 'Billing portal becomes available after checkout.';

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
                disabled={!canManageBilling || subscriptionLoading}
                onClick={canManageBilling ? async () => {
                  const result = await openPortal();
                  if ('url' in result) window.location.href = result.url;
                } : undefined}
                className="shrink-0 gap-1.5"
              >
                {canManageBilling ? <ExternalLink className="w-3.5 h-3.5" /> : null}
                Manage plan
              </Button>
            </div>

            {billingNotice && <BillingStatusBanner notice={billingNotice} />}

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
                    loading={checkoutLoading === plan.id}
                    onClick={() => void handleSwitchPlan(plan.id)}
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
