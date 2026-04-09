/**
 * SubscribeWindow — Plan selection and checkout, rendered as a desktop app window.
 *
 * Shown to unsubscribed users on desktop boot. Contains the same
 * Starter/Pro cards as the old SubscriptionGate but in a windowed context.
 */

import { useState, useCallback } from 'react';
import { Loader2, Key, Zap, ArrowRight, Check } from 'lucide-react';
import { useBillingStore } from '@/stores/billingStore';
import { useAuthStore } from '@/stores/authStore';
import { useWindowStore } from '@/stores/windowStore';
import type { WindowConfig } from '@/types';

const STARTER_FEATURES = [
  'Free AI models (or bring your own key)',
  'Web search (50/day)',
  'Terminal & code execution',
  'Calendar & memory',
  '500MB cloud storage',
];

const PRO_FEATURES = [
  'Premium AI included',
  'Unlimited web search & browser',
  'Unlimited terminal & code',
  'Agent email (@construct.computer)',
  'Unlimited calendar & memory',
  '2GB storage, background agents',
];

export function SubscribeWindow({ config }: { config: WindowConfig }) {
  const { startCheckout } = useBillingStore();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleSubscribe = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(plan);
    const url = await startCheckout(undefined, plan);
    setCheckoutLoading(null);

    if (url) {
      window.location.href = url;
    }
  }, [startCheckout]);

  // Check if user is now subscribed (after returning from checkout)
  const user = useAuthStore((s) => s.user);
  const isSubscribed = user?.plan === 'pro' || user?.plan === 'starter';

  if (isSubscribed) {
    // Auto-close the subscribe window once subscribed
    setTimeout(() => closeWindow(config.id), 100);
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-white font-medium">You're subscribed!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#0a0a0a] overflow-auto p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-[20px] text-white font-semibold tracking-tight mb-1 text-center">
          Choose your plan
        </h1>
        <p className="text-[13px] text-white/40 mb-6 text-center">
          Subscribe to unlock your AI computer
        </p>

        <div className="grid grid-cols-1 gap-4">
          {/* Starter */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-blue-400" />
              <h2 className="text-[14px] text-white font-semibold">Starter</h2>
            </div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-[22px] text-white font-bold">$9</span>
              <span className="text-white/40 text-sm">/month</span>
            </div>
            <p className="text-[11px] text-white/40 mb-1">Bring your own OpenRouter key</p>
            <p className="text-[11px] text-emerald-400/80 mb-3">1 day free trial</p>

            <div className="space-y-1.5 mb-4">
              {STARTER_FEATURES.map((text) => (
                <div key={text} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[12px] text-white/60 leading-snug">{text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSubscribe('starter')}
              disabled={!!checkoutLoading}
              className="w-full py-2 px-4 rounded-lg bg-white/10 border border-white/15 text-white font-semibold text-[13px]
                hover:bg-white/20 active:scale-[0.98] transition-all duration-150
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {checkoutLoading === 'starter' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Get Starter <ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>

          {/* Pro */}
          <div className="rounded-xl border border-emerald-500/30 bg-white/[0.03] p-5 flex flex-col ring-1 ring-emerald-500/10">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <h2 className="text-[14px] text-white font-semibold">Pro</h2>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">Popular</span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-[22px] text-white font-bold">$250</span>
              <span className="text-white/40 text-sm">/month</span>
            </div>
            <p className="text-[11px] text-white/40 mb-1">Everything included, unlimited</p>
            <p className="text-[11px] text-emerald-400/80 mb-3">3 days free trial</p>

            <div className="space-y-1.5 mb-4">
              {PRO_FEATURES.map((text) => (
                <div key={text} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[12px] text-white/60 leading-snug">{text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSubscribe('pro')}
              disabled={!!checkoutLoading}
              className="w-full py-2 px-4 rounded-lg bg-white text-black font-semibold text-[13px]
                hover:bg-white/90 active:scale-[0.98] transition-all duration-150
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2 shadow-lg"
            >
              {checkoutLoading === 'pro' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Get Pro <ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
