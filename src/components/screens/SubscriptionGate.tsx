/**
 * SubscriptionGate — Full-screen overlay shown to authenticated but unsubscribed users.
 * Blocks access to the desktop until they subscribe.
 *
 * Opens DodoPayments checkout in a new tab. Polls for subscription
 * activation after the user completes payment and returns.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, LogOut, Monitor, Bot, Globe, Mail, Code, ArrowRight, Tag } from 'lucide-react';
import { useSettingsStore, getWallpaperSrc } from '@/stores/settingsStore';
import { useBillingStore } from '@/stores/billingStore';
import constructLogo from '@/assets/construct-logo.png';

interface SubscriptionGateProps {
  onSubscribed: () => void;
  onLogout: () => void;
}

const CAPABILITIES = [
  { icon: Bot, text: 'AI agent that works autonomously' },
  { icon: Globe, text: 'Browses the web for you' },
  { icon: Mail, text: 'Reads and sends emails' },
  { icon: Code, text: 'Writes and runs code' },
  { icon: Monitor, text: 'Your own persistent cloud desktop' },
];

export function SubscriptionGate({ onSubscribed, onLogout }: SubscriptionGateProps) {
  const wallpaperId = useSettingsStore((s) => s.wallpaperId);
  const wallpaperSrc = getWallpaperSrc(wallpaperId);

  const { fetchSubscription, startCheckout } = useBillingStore();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [showCoupon, setShowCoupon] = useState(false);

  // Check subscription on mount (handles returning from checkout via return_url)
  useEffect(() => {
    const check = async () => {
      await fetchSubscription();
      const sub = useBillingStore.getState().subscription;
      if (sub?.plan === 'pro') {
        onSubscribed();
      }
    };
    check();
  }, [fetchSubscription, onSubscribed]);

  const handleSubscribe = useCallback(async () => {
    setCheckoutLoading(true);
    const trimmed = coupon.trim() || undefined;
    const url = await startCheckout(trimmed);
    setCheckoutLoading(false);

    if (url) {
      window.location.href = url;
    }
  }, [startCheckout, coupon]);

  return (
    <div className="relative h-screen flex items-center justify-center overflow-hidden">
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
      <div className="relative z-10 flex flex-col items-center max-w-md w-full mx-4">
        <img
          src={constructLogo}
          alt="construct.computer"
          className="w-20 h-20 mb-4 invert dark:invert-0 drop-shadow-md"
          draggable={false}
        />

        {paymentSucceeded ? (
          /* Payment succeeded — waiting for webhook */
          <div className="w-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6 shadow-2xl">
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
            {/* Headline */}
            <h1 className="text-[28px] text-white font-semibold tracking-tight mb-2 text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
              Your personal AI that gets things done
            </h1>
            <p className="text-[15px] text-white/50 mb-8 text-center max-w-sm drop-shadow-sm leading-relaxed">
              A computer in the cloud with an AI agent that can work for you — even while you're away.
            </p>

            {/* Card */}
            <div className="w-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6 shadow-2xl">
              {/* Card title */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] text-white font-semibold">Early Beta Access</h2>
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                  Beta
                </span>
              </div>

              <div className="space-y-3 mb-5">
                {CAPABILITIES.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-white/70" />
                    </div>
                    <span className="text-[14px] text-white/80">{text}</span>
                  </div>
                ))}
              </div>

              {/* Pricing */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[28px] text-white font-bold">$0</span>
                <span className="text-white/40 text-sm">for 3 days</span>
              </div>
              <div className="flex items-center gap-2 mb-5">
                <span className="text-[18px] text-white/40 font-semibold line-through decoration-red-400/70 decoration-2">$250/mo</span>
                <span className="text-[12px] text-emerald-400 font-medium">FREE for 3 days</span>
              </div>
              <p className="text-[12px] text-white/35 mb-5">
                Then $250/mo after trial. Cancel anytime.
              </p>

              {/* Coupon toggle */}
              {!showCoupon ? (
                <button
                  onClick={() => setShowCoupon(true)}
                  className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/60 transition-colors mb-4"
                >
                  <Tag className="w-3 h-3" />
                  Have a coupon code?
                </button>
              ) : (
                <div className="mb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      className="flex-1 px-3 py-2 rounded-lg bg-white/[0.07] border border-white/10 text-white text-sm
                        placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
                      autoFocus
                    />
                    <button
                      onClick={() => { setShowCoupon(false); setCoupon(''); }}
                      className="px-3 py-2 rounded-lg text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Subscribe button */}
              <button
                onClick={handleSubscribe}
                disabled={checkoutLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-white text-black font-semibold text-[15px]
                  hover:bg-white/90 active:scale-[0.98] transition-all duration-150
                  disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2 shadow-lg"
              >
                {checkoutLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Get started
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* Logout link */}
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
