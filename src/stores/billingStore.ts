/**
 * Billing & usage store — manages subscription state and current usage window.
 * Refreshes usage periodically when the billing UI is visible.
 */

import { create } from 'zustand';
import {
  getSubscription,
  getCurrentUsage,
  getUsageHistory,
  createCheckout,
  switchPlan as switchPlanApi,
  createPortalSession,
  createTopupCheckout,
  type SubscriptionInfo,
  type WindowUsage,
  type UsageHistorySummary,
} from '@/services/api';

interface BillingState {
  // Subscription
  subscription: SubscriptionInfo | null;
  subscriptionLoading: boolean;
  subscriptionError: string | null;

  // Current 6h usage window
  usage: WindowUsage | null;
  usageLoading: boolean;

  // Usage history
  history: UsageHistorySummary | null;

  // Actions
  fetchSubscription: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  fetchHistory: (days?: number) => Promise<void>;
  startCheckout: (plan?: 'starter' | 'pro', coupon?: string) => Promise<string | null>;
  switchPlan: (plan: 'free' | 'starter' | 'pro') => Promise<boolean | { redirectToCheckout: boolean; targetPlan: string }>;
  openPortal: () => Promise<string | null>;
  buyTopup: (amount: number) => Promise<string | null>;
}

export const useBillingStore = create<BillingState>((set) => ({
  subscription: null,
  subscriptionLoading: false,
  subscriptionError: null,
  usage: null,
  usageLoading: false,
  history: null,

  fetchSubscription: async () => {
    set({ subscriptionLoading: true, subscriptionError: null });
    const result = await getSubscription();
    if (result.success) {
      set({ subscription: result.data, subscriptionLoading: false });
    } else {
      set({ subscriptionError: result.error, subscriptionLoading: false });
    }
  },

  fetchUsage: async () => {
    set({ usageLoading: true });
    const result = await getCurrentUsage();
    if (result.success) {
      set({ usage: result.data, usageLoading: false });
    } else {
      set({ usageLoading: false });
    }
  },

  fetchHistory: async (days = 7) => {
    const result = await getUsageHistory(days);
    if (result.success) {
      set({ history: result.data });
    }
  },

  startCheckout: async (plan: 'starter' | 'pro' = 'pro', coupon?: string) => {
    let finalCoupon = coupon;
    // Auto-attach a stored promo only for Pro checkout. Promos currently in
    // circulation (e.g. YCSUS) are scoped to the Pro product on Dodo's side,
    // so applying them to a Starter checkout would 422 the whole request.
    if (!finalCoupon && plan === 'pro') {
      try {
        const stored = localStorage.getItem('construct:promo_code');
        if (stored) finalCoupon = stored;
      } catch { /* ignore */ }
    }
    console.log('[billingStore] startCheckout called with plan:', plan, 'coupon:', finalCoupon);
    const result = await createCheckout(plan, finalCoupon);
    console.log('[billingStore] createCheckout result:', result);
    if (result.success) {
      return result.data.checkoutUrl;
    }
    return null;
  },

  switchPlan: async (plan: 'free' | 'starter' | 'pro') => {
    const result = await switchPlanApi(plan);
    if (result.success) {
      // If portal URL is returned (for downgrades in production), redirect to portal
      if (result.data.portalUrl) {
        window.location.href = result.data.portalUrl;
        return true;
      }
      // Refresh subscription data after switching
      const sub = await getSubscription();
      if (sub.success) {
        set({ subscription: sub.data });
      }
      return true;
    }
    // If upgrade is required, return the error info so UI can redirect to checkout
    if (!result.success && result.data?.redirectToCheckout) {
      return { redirectToCheckout: true, targetPlan: result.data.targetPlan as string };
    }
    return false;
  },

  openPortal: async () => {
    const result = await createPortalSession();
    if (result.success) {
      return result.data.portalUrl;
    }
    return null;
  },

  buyTopup: async (amount: number) => {
    const result = await createTopupCheckout(amount);
    if (result.success) {
      return result.data.checkoutUrl;
    }
    return null;
  },
}));
