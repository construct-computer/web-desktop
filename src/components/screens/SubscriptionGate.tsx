/**
 * SubscriptionGate — Full-screen overlay shown to authenticated but unsubscribed users.
 * Blocks access to the desktop until they subscribe.
 *
 * Opens DodoPayments checkout in a new tab. Polls for subscription
 * activation after the user completes payment and returns.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, LogOut, Monitor, Bot, Globe, Mail, Code, ArrowRight, Tag, Key, Zap, Check } from 'lucide-react';
import { useSettingsStore, getWallpaperSrc } from '@/stores/settingsStore';
import { useBillingStore } from '@/stores/billingStore';
import constructLogo from '@/assets/logo.png';

interface SubscriptionGateProps {
  onSubscribed: () => void;
  onLogout: () => void;
}

const STARTER_FEATURES = [
  'Fast AI model (Workers AI)',
  'Web search & browser',
  'Terminal & code execution',
  'Calendar & memory',
  '1 GB cloud storage',
  'Bring your own API key',
];

const PRO_FEATURES = [
  'Premium AI (Gemini 2.5 Pro)',
  'Web search & browser',
  'Terminal & code execution',
  'Agent email inbox',
  'Calendar & memory',
  '2 GB storage, background agents',
];

export function SubscriptionGate({ onSubscribed, onLogout }: SubscriptionGateProps) {
  const wallpaperId = useSettingsStore((s) => s.wallpaperId);
  const wallpaperSrc = getWallpaperSrc(wallpaperId);

  const { fetchSubscription, startCheckout } = useBillingStore();

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);

  // Check subscription on mount (handles returning from checkout via return_url)
  useEffect(() => {
    const check = async () => {
      await fetchSubscription();
      const sub = useBillingStore.getState().subscription;
      if (sub?.plan === 'pro' || sub?.plan === 'starter' || sub?.plan === 'free') {
        onSubscribed();
      }
    };
    check();
  }, [fetchSubscription, onSubscribed]);

  const handleSubscribe = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(plan);
    const url = await startCheckout(plan);
    setCheckoutLoading(null);

    if (url) {
      window.location.href = url;
    }
  }, [startCheckout]);

  return (
    <div className="relative h-[100dvh] flex items-center justify-center overflow-hidden">
      {/* Blurred wallpaper background */}
      <div
        className="fixed inset-0"
        style={{
          backgroundImage: `url(${wallpaperSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(24px) saturate(1.5)',
          transform: 'scale(1.03)',
        }}
      />

      {/* Dark overlay */}
      <div className="fixed inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full mx-4">
        <img
          src={constructLogo}
          alt="construct.computer"
          className="w-16 h-16 mb-3 invert dark:invert-0 drop-shadow-md"
          draggable={false}
        />

        {paymentSucceeded ? (
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6 shadow-2xl">
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium mb-1">Payment received!</p>
                <p className="text-white/50 text-sm">Setting up your computer...</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-[26px] text-white font-semibold tracking-tight mb-1.5 text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
              Your personal AI computer
            </h1>
            <p className="text-[14px] text-white/50 mb-6 text-center max-w-md drop-shadow-sm leading-relaxed">
              An AI agent with its own desktop, browser, terminal, email, and more.
            </p>

            {/* Two plan cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {/* Starter */}
              <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5 shadow-2xl flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <Key className="w-4 h-4 text-blue-400" />
                  <h2 className="text-[14px] text-white font-semibold">Starter</h2>
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-[24px] text-white font-bold">$59</span>
                  <span className="text-white/40 text-sm">/month</span>
                </div>
                <p className="text-[11px] text-white/40 mb-1">Managed free AI via Cloudflare AI Gateway</p>
                <p className="text-[11px] text-emerald-400/80 mb-4">1 day free trial</p>

                <div className="space-y-2 mb-5 flex-1">
                  {STARTER_FEATURES.map((text) => (
                    <div key={text} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span className="text-[12px] text-white/70 leading-snug">{text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleSubscribe('starter')}
                  disabled={!!checkoutLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/10 border border-white/15 text-white font-semibold text-[13px]
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
              <div className="rounded-2xl border border-emerald-500/30 bg-black/40 backdrop-blur-xl p-5 shadow-2xl flex flex-col ring-1 ring-emerald-500/10">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-[14px] text-white font-semibold">Pro</h2>
                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">Popular</span>
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-[24px] text-white font-bold">$299</span>
                  <span className="text-white/40 text-sm">/month</span>
                </div>
                <p className="text-[11px] text-white/40 mb-1">Everything included, unlimited</p>
                <p className="text-[11px] text-emerald-400/80 mb-4">3 days free trial</p>

                <div className="space-y-2 mb-5 flex-1">
                  {PRO_FEATURES.map((text) => (
                    <div key={text} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span className="text-[12px] text-white/70 leading-snug">{text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleSubscribe('pro')}
                  disabled={!!checkoutLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-white text-black font-semibold text-[13px]
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

            <button
              onClick={onLogout}
              className="mt-5 flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
