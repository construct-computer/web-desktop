/**
 * SubscriptionOverlay — permanent overlay for unsubscribed users.
 *
 * Same pattern as SetupModal: fixed overlay, centered card, no close button.
 * Cannot be dismissed until user subscribes. Shown on the desktop behind
 * the setup wizard but above all windows.
 */

import { useState, useCallback } from 'react';
import {
  Loader2, ArrowRight, Check, Sparkles,
  Globe, Terminal, Mail, Calendar, HardDrive,
  Bot, Search, Code, Cpu, Shield,
} from 'lucide-react';
import { useBillingStore } from '@/stores/billingStore';
import constructLogo from '@/assets/logo.png';

const STARTER_FEATURES = [
  { icon: Bot, text: 'AI agent with free models' },
  { icon: Code, text: 'Bring your own OpenRouter API key' },
  { icon: Search, text: 'Web search (50/day)' },
  { icon: Terminal, text: 'Terminal & code execution' },
  { icon: Calendar, text: 'Calendar & reminders' },
  { icon: Cpu, text: 'Memory & context' },
  { icon: HardDrive, text: '500 MB cloud storage' },
];

const PRO_FEATURES = [
  { icon: Sparkles, text: 'Premium AI models included', highlight: true },
  { icon: Globe, text: 'Unlimited web search & browser', highlight: true },
  { icon: Terminal, text: 'Unlimited terminal & code' },
  { icon: Mail, text: 'Agent email (@agents.construct.computer)', highlight: true },
  { icon: Calendar, text: 'Unlimited calendar & memory' },
  { icon: HardDrive, text: '2 GB cloud storage' },
  { icon: Bot, text: 'Background agents & tasks', highlight: true },
  { icon: Shield, text: 'Priority support' },
];

export function SubscriptionOverlay() {
  const { startCheckout } = useBillingStore();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleSubscribe = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(plan);
    const url = await startCheckout(undefined, plan);
    setCheckoutLoading(null);
    if (url) window.location.href = url;
  }, [startCheckout]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none">
      <div className="w-full max-w-[720px] bg-white/50 dark:bg-black/50 backdrop-blur-2xl saturate-150 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/40 border border-black/10 dark:border-white/15 overflow-hidden animate-in fade-in zoom-in-95 duration-300 pointer-events-auto">

        {/* Header */}
        <div className="text-center px-8 pt-7 pb-4">
          <img src={constructLogo} alt="" className="w-14 h-14 mx-auto mb-3" draggable={false} />
          <h1 className="text-[22px] text-gray-900 dark:text-white font-bold tracking-tight mb-1">
            Your personal AI computer
          </h1>
          <p className="text-[13px] text-gray-500 dark:text-white/40 max-w-md mx-auto leading-relaxed">
            An AI agent with its own desktop, browser, terminal, email, and calendar.
            Choose a plan to get started.
          </p>
        </div>

        {/* Plan cards — side by side */}
        <div className="px-6 pb-4 grid grid-cols-2 gap-4">
          {/* Starter */}
          <div className="rounded-xl border border-black/5 dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] p-5 flex flex-col">
            <div className="mb-3">
              <h2 className="text-[15px] text-gray-900 dark:text-white font-semibold mb-0.5">Starter</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] text-gray-900 dark:text-white font-bold tracking-tight">$9</span>
                <span className="text-gray-400 dark:text-white/30 text-sm">/mo</span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400/80 mt-1">1 day free trial</p>
            </div>

            <div className="space-y-2 mb-4 flex-1">
              {STARTER_FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-2.5">
                  <Icon className="w-3.5 h-3.5 text-blue-500/70 dark:text-blue-400/70 mt-[3px] flex-shrink-0" />
                  <span className="text-[12px] text-gray-500 dark:text-white/50 leading-snug">{text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSubscribe('starter')}
              disabled={!!checkoutLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-black/[0.06] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1]
                text-gray-900 dark:text-white font-semibold text-[13px]
                hover:bg-black/[0.1] dark:hover:bg-white/[0.14] active:scale-[0.98] transition-all duration-150
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
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.03] p-5 flex flex-col relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                Popular
              </span>
            </div>

            <div className="mb-3">
              <h2 className="text-[15px] text-gray-900 dark:text-white font-semibold mb-0.5">Pro</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] text-gray-900 dark:text-white font-bold tracking-tight">$250</span>
                <span className="text-gray-400 dark:text-white/30 text-sm">/mo</span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400/80 mt-1">3 days free trial</p>
            </div>

            <div className="space-y-2 mb-4 flex-1">
              {PRO_FEATURES.map(({ icon: Icon, text, highlight }) => (
                <div key={text} className="flex items-start gap-2.5">
                  <Icon className={`w-3.5 h-3.5 mt-[3px] flex-shrink-0 ${highlight ? 'text-emerald-500 dark:text-emerald-400' : 'text-emerald-500/60 dark:text-emerald-400/60'}`} />
                  <span className={`text-[12px] leading-snug ${highlight ? 'text-gray-700 dark:text-white/70 font-medium' : 'text-gray-500 dark:text-white/50'}`}>{text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSubscribe('pro')}
              disabled={!!checkoutLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black font-semibold text-[13px]
                hover:bg-gray-800 dark:hover:bg-white/90 active:scale-[0.98] transition-all duration-150
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

        {/* Footer */}
        <div className="px-8 pb-5 text-center">
          <p className="text-[11px] text-gray-400 dark:text-white/20">
            Cancel anytime. You keep access until the end of your billing period.
          </p>
        </div>
      </div>
    </div>
  );
}
