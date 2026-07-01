/**
 * Single source of truth for user-facing billing copy.
 */

import type { BillingPlanId, SubscriptionInfo } from '@/services/api';
import { BILLING_PLAN_ORDER } from '@/lib/billingPlans';

export type BillingNotice = {
  tone: 'warning' | 'danger' | 'info';
  title: string;
  body: string;
};

export function formatBillingDate(timestamp: number | null | undefined): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatPlanName(plan: string): string {
  if (!plan || plan === 'unsubscribed' || plan === 'free') return 'Unsubscribed';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function formatMoneyFromMinor(amount: number | undefined, currency: string | undefined): string | null {
  if (amount == null || !currency) return null;
  try {
    return new Intl.NumberFormat([], { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

function normalizedSubscriptionStatus(subscription: SubscriptionInfo): string {
  if (subscription.cancelAtPeriodEnd && subscription.status === 'active') return 'cancel_at_period_end';
  return (subscription.status || '').toLowerCase();
}

export function getBillingNotice(subscription: SubscriptionInfo | null): BillingNotice | null {
  if (!subscription) return null;

  const status = normalizedSubscriptionStatus(subscription);

  if (status === 'past_due' || status === 'on_hold') {
    return {
      tone: 'danger',
      title: 'Payment overdue',
      body: 'Your last payment failed. Update your payment method to restore full access.',
    };
  }

  if (status === 'failed') {
    return {
      tone: 'danger',
      title: 'Subscription payment failed',
      body: 'Your paid subscription is inactive. Update billing to restore access.',
    };
  }

  if (status === 'expired' || status === 'cancelled' || status === 'canceled') {
    return {
      tone: 'danger',
      title: 'Subscription inactive',
      body: 'Your paid subscription is no longer active. This workspace is unsubscribed.',
    };
  }

  if (status === 'cancel_at_period_end') {
    const endDate = formatBillingDate(subscription.currentPeriodEnd);
    return {
      tone: 'warning',
      title: 'Cancellation scheduled',
      body: endDate
        ? `You keep access until ${endDate}. You won't be charged again unless you resubscribe.`
        : "You keep access until the end of your billing period. You won't be charged again unless you resubscribe.",
    };
  }

  if (subscription.scheduledPlan) {
    const date = formatBillingDate(subscription.scheduledEffectiveAt || null);
    const scheduledName = formatPlanName(subscription.scheduledPlan);
    return {
      tone: 'info',
      title: `${scheduledName} scheduled`,
      body: date
        ? `Your plan switches to ${scheduledName} on ${date}.`
        : `Your plan change to ${scheduledName} is scheduled.`,
    };
  }

  if (subscription.trialEndsAt && subscription.trialEndsAt > Date.now()) {
    const date = formatBillingDate(subscription.trialEndsAt);
    return {
      tone: 'info',
      title: 'Lite trial active',
      body: date
        ? `Trial ends ${date}. You can upgrade anytime — that ends the trial and starts a paid plan. Ending the trial now removes access immediately.`
        : 'Your Lite trial is active. You can upgrade anytime — that ends the trial and starts a paid plan. Ending the trial now removes access immediately.',
    };
  }

  return null;
}

export function billingStatusToast(subscription: SubscriptionInfo): { title: string; body: string; variant: 'info' | 'error' } | null {
  const notice = getBillingNotice(subscription);
  if (!notice) return null;
  return {
    title: notice.title,
    body: notice.body,
    variant: notice.tone === 'danger' ? 'error' : 'info',
  };
}

export function planSummaryLine(opts: {
  currentPlan: BillingPlanId | 'unsubscribed';
  canManageBilling: boolean;
  isNonProd: boolean;
}): string {
  const { currentPlan, canManageBilling, isNonProd } = opts;
  if (currentPlan === 'unsubscribed') {
    return 'Choose a plan below. Paid plan management is available after you subscribe.';
  }
  if (canManageBilling) {
    return 'Manage your plan here. Use Manage Subscription for invoices and payment details.';
  }
  if (isNonProd) {
    return 'Plan changes are disabled in this environment.';
  }
  return 'Billing management becomes available after checkout.';
}

export const BILLING_ERROR_FALLBACK = 'Try again or open Manage Subscription.';

export function planSwitchSuccessToast(opts: {
  scheduled: boolean;
  plan: string;
  currentPeriodEnd?: number | null;
}): { title: string; body: string } {
  const planName = formatPlanName(opts.plan);
  if (opts.scheduled) {
    const date = formatBillingDate(opts.currentPeriodEnd ?? null);
    return {
      title: 'Plan change scheduled',
      body: date
        ? `Your ${planName} plan stays active until ${date}.`
        : `Your current plan stays active until the next billing date.`,
    };
  }
  return {
    title: 'Plan updated',
    body: `You're now on ${planName}.`,
  };
}

export function buildConfirmCopy(opts: {
  kind: 'upgrade' | 'downgrade' | 'trial-upgrade' | 'cancel-period-end' | 'cancel-trial' | 'resume' | 'checkout';
  targetPlan?: BillingPlanId;
  currentPlan?: BillingPlanId | 'unsubscribed';
  previewAmount?: string | null;
  periodEndDate?: string | null;
}): { title: string; message: string; confirmLabel: string; destructive: boolean } {
  const targetName = opts.targetPlan ? formatPlanName(opts.targetPlan) : '';
  const currentName = opts.currentPlan ? formatPlanName(opts.currentPlan) : '';

  switch (opts.kind) {
    case 'upgrade':
      return {
        title: `Upgrade to ${targetName}?`,
        message: opts.previewAmount
          ? `Your payment method on file will be charged ${opts.previewAmount} now. Your plan changes only if the charge succeeds.`
          : 'Your payment method on file will be charged now. Your plan changes only if the charge succeeds.',
        confirmLabel: 'Charge and upgrade',
        destructive: false,
      };
    case 'downgrade':
      return {
        title: `Downgrade to ${targetName}?`,
        message: opts.periodEndDate
          ? `Your plan switches to ${targetName} on ${opts.periodEndDate}. You keep ${currentName} until then. No refund for the current billing period.`
          : `Your plan switches to ${targetName} at the end of your billing period. You keep ${currentName} until then.`,
        confirmLabel: 'Schedule downgrade',
        destructive: false,
      };
    case 'trial-upgrade':
      return {
        title: 'Upgrade from Lite trial?',
        message: `Your trial ends now. You'll complete checkout for ${targetName} and your payment method will be charged.`,
        confirmLabel: 'Continue to checkout',
        destructive: false,
      };
    case 'cancel-period-end':
      return {
        title: 'Cancel subscription?',
        message: opts.periodEndDate
          ? `You keep access until ${opts.periodEndDate}. You won't be charged again unless you resubscribe.`
          : "You keep access until the end of your billing period. You won't be charged again unless you resubscribe.",
        confirmLabel: 'Cancel at period end',
        destructive: true,
      };
    case 'cancel-trial':
      return {
        title: 'End Lite trial?',
        message: "Your trial ends now and workspace access is removed. You won't be charged.",
        confirmLabel: 'End trial now',
        destructive: true,
      };
    case 'resume':
      return {
        title: 'Keep your current plan?',
        message: `This removes your scheduled cancellation or downgrade. You'll stay on ${currentName}.`,
        confirmLabel: 'Keep current plan',
        destructive: false,
      };
    case 'checkout':
      return {
        title: `Subscribe to ${targetName}?`,
        message: "You'll be taken to checkout to add a payment method and start your subscription.",
        confirmLabel: 'Continue to checkout',
        destructive: false,
      };
  }
}

export function isUpgradePlan(currentPlan: BillingPlanId | 'unsubscribed', targetPlan: BillingPlanId): boolean {
  if (currentPlan === 'unsubscribed') return true;
  return BILLING_PLAN_ORDER.indexOf(targetPlan) > BILLING_PLAN_ORDER.indexOf(currentPlan);
}
