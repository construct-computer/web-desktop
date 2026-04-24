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
  getByokSettings,
  saveByokKey,
  deleteByokKey,
  updateByokSettings,
  listByokModels,
  type SubscriptionInfo,
  type WindowUsage,
  type UsageHistorySummary,
  type ByokSettings,
  type ByokMode,
  type ByokModel,
} from '@/services/api';

const BYOK_MODELS_CACHE_MS = 5 * 60 * 1000;

export type EffectiveProvider =
  | { kind: 'platform'; model?: string }
  | { kind: 'byok-exclusive'; model?: string }
  | { kind: 'byok-fallback'; model?: string; weeklyResetsAt?: string }
  | { kind: 'blocked-no-key'; weeklyResetsAt?: string }
  | { kind: 'blocked-byok-cap'; weeklyResetsAt?: string };

export interface ProviderBlock {
  kind: 'no-key' | 'byok-cap';
  weeklyResetsAt?: string;
}

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

  // BYOK
  byok: ByokSettings | null;
  byokLoading: boolean;
  byokError: string | null;
  byokModels: { recommended: ByokModel[]; models: ByokModel[] } | null;
  byokModelsFetchedAt: number | null;
  byokModelsLoading: boolean;

  // Provider state driven by SSE events (trumps polled usage until cleared)
  lastBlock: ProviderBlock | null;
  /** Model reported by the worker's most recent provider_state event. */
  liveModel: string | null;
  /** True if the worker's last provider_state was byok-fallback or byok-exclusive. */
  liveByokActive: boolean;

  // Actions
  fetchSubscription: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  fetchHistory: (days?: number) => Promise<void>;
  startCheckout: (plan?: 'starter' | 'pro', coupon?: string) => Promise<string | null>;
  switchPlan: (plan: 'free' | 'starter' | 'pro') => Promise<boolean | { redirectToCheckout: boolean; targetPlan: string }>;
  openPortal: () => Promise<string | null>;
  buyTopup: (amount: number) => Promise<string | null>;

  // BYOK actions
  fetchByok: () => Promise<void>;
  saveByokKey: (apiKey: string) => Promise<{ ok: boolean; error?: string }>;
  deleteByokKey: () => Promise<void>;
  setByokMode: (mode: ByokMode) => Promise<{ ok: boolean; error?: string }>;
  setByokModel: (model: string | null) => Promise<{ ok: boolean; error?: string }>;
  setByokWeeklyLimit: (weeklyLimitUsd: number | null) => Promise<{ ok: boolean; error?: string }>;
  fetchByokModels: (force?: boolean) => Promise<void>;

  // Provider-state actions
  setProviderBlock: (block: ProviderBlock | null) => void;
  setLiveProvider: (state: {
    active: boolean;
    model?: string;
  }) => void;
  getEffectiveProvider: () => EffectiveProvider;
}

export const useBillingStore = create<BillingState>((set, get) => ({
  subscription: null,
  subscriptionLoading: false,
  subscriptionError: null,
  usage: null,
  usageLoading: false,
  history: null,
  byok: null,
  byokLoading: false,
  byokError: null,
  byokModels: null,
  byokModelsFetchedAt: null,
  byokModelsLoading: false,
  lastBlock: null,
  liveModel: null,
  liveByokActive: false,

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
      // A fresh poll after a weekly reset should clear any stale block marker
      // left by a previous blocked-no-key / blocked-byok-cap SSE event.
      const { lastBlock } = get();
      const clearBlock =
        lastBlock && result.data.weeklyPercentUsed !== undefined && result.data.weeklyPercentUsed < 100;
      set({
        usage: result.data,
        usageLoading: false,
        ...(clearBlock ? { lastBlock: null } : {}),
      });
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

  // ── BYOK ───────────────────────────────────────────────────────────────

  fetchByok: async () => {
    set({ byokLoading: true, byokError: null });
    const res = await getByokSettings();
    if (res.success) {
      set({ byok: res.data, byokLoading: false });
    } else {
      set({ byokError: res.error, byokLoading: false });
    }
  },

  saveByokKey: async (apiKey: string) => {
    const res = await saveByokKey(apiKey);
    if (res.success) {
      set({ byok: res.data });
      return { ok: true };
    }
    return { ok: false, error: res.error };
  },

  deleteByokKey: async () => {
    await deleteByokKey();
    // Re-fetch to get server-canonical state (mode reset to 'off', keyPreview null, etc).
    await get().fetchByok();
  },

  setByokMode: async (mode: ByokMode) => {
    const res = await updateByokSettings({ mode });
    if (res.success) {
      set({ byok: res.data });
      return { ok: true };
    }
    return { ok: false, error: res.error };
  },

  setByokModel: async (model: string | null) => {
    const res = await updateByokSettings({ model });
    if (res.success) {
      set({ byok: res.data });
      return { ok: true };
    }
    return { ok: false, error: res.error };
  },

  setByokWeeklyLimit: async (weeklyLimitUsd: number | null) => {
    const res = await updateByokSettings({ weeklyLimitUsd });
    if (res.success) {
      set({ byok: res.data });
      return { ok: true };
    }
    return { ok: false, error: res.error };
  },

  fetchByokModels: async (force = false) => {
    const { byokModels, byokModelsFetchedAt } = get();
    if (!force && byokModels && byokModelsFetchedAt && Date.now() - byokModelsFetchedAt < BYOK_MODELS_CACHE_MS) {
      return;
    }
    set({ byokModelsLoading: true });
    const res = await listByokModels();
    if (res.success) {
      set({
        byokModels: res.data,
        byokModelsFetchedAt: Date.now(),
        byokModelsLoading: false,
      });
    } else {
      set({ byokModelsLoading: false });
    }
  },

  setProviderBlock: (block) => {
    set({ lastBlock: block });
  },

  setLiveProvider: ({ active, model }) => {
    set({
      liveByokActive: active,
      liveModel: model ?? null,
      // Any successful provider_state event means the user isn't blocked right now.
      lastBlock: null,
    });
  },

  getEffectiveProvider: (): EffectiveProvider => {
    const { usage, byok, lastBlock, liveByokActive, liveModel } = get();

    if (lastBlock?.kind === 'no-key') {
      return { kind: 'blocked-no-key', weeklyResetsAt: lastBlock.weeklyResetsAt };
    }
    if (lastBlock?.kind === 'byok-cap') {
      return { kind: 'blocked-byok-cap', weeklyResetsAt: lastBlock.weeklyResetsAt };
    }

    // Prefer live SSE signal; fall back to polled flags.
    const model = liveModel ?? byok?.model ?? undefined;
    const byokActive = liveByokActive || !!usage?.byokActive;
    const byokFallback = !!usage?.byokFallback;

    if (byokFallback) {
      return { kind: 'byok-fallback', model, weeklyResetsAt: usage?.weeklyResetsAt };
    }
    if (byokActive || byok?.mode === 'exclusive') {
      return { kind: 'byok-exclusive', model };
    }
    return { kind: 'platform', model };
  },
}));
