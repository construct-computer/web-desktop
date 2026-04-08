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
  startCheckout: (coupon?: string, plan?: 'starter' | 'pro') => Promise<string | null>;
  switchPlan: (plan: 'starter' | 'pro') => Promise<boolean>;
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

  startCheckout: async (coupon?: string, plan: 'starter' | 'pro' = 'pro') => {
    const result = await createCheckout(plan, coupon);
    if (result.success) {
      return result.data.checkoutUrl;
    }
    return null;
  },

  switchPlan: async (plan: 'starter' | 'pro') => {
    const result = await switchPlanApi(plan);
    if (result.success) {
      // Refresh subscription data after switching
      const sub = await getSubscription();
      if (sub.success) {
        set({ subscription: sub.data });
      }
      return true;
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
