/**
 * SubscribeWindow — Professional subscription page rendered as a desktop app.
 *
 * Auto-opens for unsubscribed users. Cannot be closed without a plan.
 * Two-column layout with detailed feature comparison.
 */

import { useState, useCallback } from 'react';
import {
  Loader2, ArrowRight, Check, Sparkles,
  Globe, Terminal, Mail, Calendar, HardDrive,
  Bot, Search, Code, Cpu, Shield,
} from 'lucide-react';
import { useBillingStore } from '@/stores/billingStore';
import { useAuthStore } from '@/stores/authStore';
import { useWindowStore } from '@/stores/windowStore';
import type { WindowConfig } from '@/types';
import constructIcon from '@/icons/construct-drive.png';

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
  { icon: Mail, text: 'Agent email (@construct.computer)', highlight: true },
  { icon: Calendar, text: 'Unlimited calendar & memory' },
  { icon: HardDrive, text: '2 GB cloud storage' },
  { icon: Bot, text: 'Background agents & tasks', highlight: true },
  { icon: Shield, text: 'Priority support' },
];

export function SubscribeWindow({ config }: { config: WindowConfig }) {
  const { startCheckout } = useBillingStore();
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const isSubscribed = user?.plan === 'pro' || user?.plan === 'starter';

  const handleSubscribe = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(plan);
    const url = await startCheckout(undefined, plan);
    setCheckoutLoading(null);
    if (url) window.location.href = url;
  }, [startCheckout]);

  if (isSubscribed) {
    setTimeout(() => closeWindow(config.id), 100);
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#080808]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-white font-semibold text-lg">You're subscribed!</p>
          <p className="text-white/40 text-sm">Setting up your computer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#080808] overflow-auto">
      {/* Header */}
      <div className="px-8 pt-7 pb-5 text-center">
        <img src={constructIcon} alt="" className="w-14 h-14 mx-auto mb-3" draggable={false} />
        <h1 className="text-[22px] text-white font-bold tracking-tight mb-1">
          Your personal AI computer
        </h1>
        <p className="text-[13px] text-white/40 max-w-md mx-auto leading-relaxed">
          An AI agent with its own desktop, browser, terminal, email, and calendar.
          Subscribe to get started.
        </p>
      </div>

      {/* Plan cards — side by side */}
      <div className="px-6 pb-6 grid grid-cols-2 gap-4">
        {/* Starter Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex flex-col">
          <div className="mb-4">
            <h2 className="text-[15px] text-white font-semibold mb-0.5">Starter</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] text-white font-bold tracking-tight">$9</span>
              <span className="text-white/30 text-sm">/mo</span>
            </div>
            <p className="text-[11px] text-emerald-400/80 mt-1">1 day free trial</p>
          </div>

          <div className="space-y-2.5 mb-5 flex-1">
            {STARTER_FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-2.5">
                <Icon className="w-3.5 h-3.5 text-blue-400/70 mt-[3px] flex-shrink-0" />
                <span className="text-[12px] text-white/50 leading-snug">{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => handleSubscribe('starter')}
            disabled={!!checkoutLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-white/[0.08] border border-white/[0.1] text-white font-semibold text-[13px]
              hover:bg-white/[0.14] active:scale-[0.98] transition-all duration-150
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

        {/* Pro Card */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5 flex flex-col relative overflow-hidden">
          {/* Popular badge */}
          <div className="absolute top-3 right-3">
            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 uppercase tracking-widest">
              Popular
            </span>
          </div>

          <div className="mb-4">
            <h2 className="text-[15px] text-white font-semibold mb-0.5">Pro</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] text-white font-bold tracking-tight">$250</span>
              <span className="text-white/30 text-sm">/mo</span>
            </div>
            <p className="text-[11px] text-emerald-400/80 mt-1">3 days free trial</p>
          </div>

          <div className="space-y-2.5 mb-5 flex-1">
            {PRO_FEATURES.map(({ icon: Icon, text, highlight }) => (
              <div key={text} className="flex items-start gap-2.5">
                <Icon className={`w-3.5 h-3.5 mt-[3px] flex-shrink-0 ${highlight ? 'text-emerald-400' : 'text-emerald-400/60'}`} />
                <span className={`text-[12px] leading-snug ${highlight ? 'text-white/70 font-medium' : 'text-white/50'}`}>{text}</span>
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
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : (
              <>Get Pro <ArrowRight className="w-3.5 h-3.5" /></>
            )}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 pb-6 text-center">
        <p className="text-[11px] text-white/20">
          Cancel anytime. You keep access until the end of your billing period.
        </p>
      </div>
    </div>
  );
}
