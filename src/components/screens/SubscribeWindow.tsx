import { useState, useCallback, useEffect } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { useBillingStore } from '@/stores/billingStore';
import constructLogo from '@/assets/logo.png';
import { LITE_FEATURES, STARTER_FEATURES, PRO_FEATURES } from './subscribePlanCopy';

type PlanId = 'lite' | 'starter' | 'pro';

function PlanCard({
  title,
  price,
  features,
  tone,
  cta,
  loading,
  onClick,
}: {
  title: string;
  price: string;
  features: typeof LITE_FEATURES;
  tone: 'lite' | 'starter' | 'pro';
  cta: string;
  loading?: boolean;
  onClick: () => void;
}) {
  const cardClass = tone === 'pro'
    ? 'border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.03]'
    : tone === 'lite'
      ? 'border-black/5 dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03]'
      : 'border-black/5 dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.025]';

  return (
    <div className={`rounded-xl border p-5 flex flex-col relative overflow-hidden ${cardClass}`}>
      {tone === 'pro' && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
            Popular
          </span>
        </div>
      )}

      <div className="mb-3">
        <h2 className="text-[15px] text-gray-900 dark:text-white font-semibold mb-0.5">{title}</h2>
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] text-gray-900 dark:text-white font-bold tracking-tight">{price}</span>
          <span className="text-gray-400 dark:text-white/30 text-sm">/mo</span>
        </div>
      </div>

      <div className="space-y-2 mb-4 flex-1">
        {features.map(({ icon: Icon, text, highlight }) => (
          <div key={text} className="flex items-start gap-2.5">
            <Icon className={`w-3.5 h-3.5 mt-[3px] flex-shrink-0 ${highlight ? 'text-emerald-500 dark:text-emerald-400' : tone === 'lite' ? 'text-blue-500/70 dark:text-blue-400/70' : 'text-emerald-500/60 dark:text-emerald-400/60'}`} />
            <span className={`text-[12px] leading-snug ${highlight ? 'text-gray-700 dark:text-white/70 font-medium' : 'text-gray-500 dark:text-white/50'}`}>{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onClick}
        disabled={!!loading}
        className={`w-full py-2.5 px-4 rounded-xl border font-semibold text-[13px] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${tone === 'pro' ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent hover:bg-gray-800 dark:hover:bg-white/90 shadow-lg' : 'bg-black/[0.06] text-gray-900 dark:bg-white/[0.08] dark:text-white border-black/[0.08] dark:border-white/[0.1] hover:bg-black/[0.1] dark:hover:bg-white/[0.14]'}`}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{cta} <ArrowRight className="w-3.5 h-3.5" /></>}
      </button>
    </div>
  );
}

export function SubscribeWindow() {
  const { startCheckout, switchPlan, subscription, fetchSubscription } = useBillingStore();
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);

  useEffect(() => {
    if (!subscription) void fetchSubscription();
  }, [subscription, fetchSubscription]);

  const isNonProd = subscription?.environment === 'staging' || subscription?.environment === 'local';

  const handleSubscribe = useCallback(async (plan: PlanId) => {
    setCheckoutLoading(plan);
    if (isNonProd) {
      const result = await switchPlan(plan);
      setCheckoutLoading(null);
      if (result === true) window.location.reload();
      return;
    }

    const url = await startCheckout(plan);
    setCheckoutLoading(null);
    if (url) window.location.href = url;
  }, [isNonProd, startCheckout, switchPlan]);

  return (
    <div className="w-full bg-[var(--color-surface)]">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col px-6 py-6">
        <div className="text-center px-2 pt-3 pb-5">
          <img src={constructLogo} alt="" className="w-14 h-14 mx-auto mb-3" draggable={false} />
          <h1 className="text-[22px] text-gray-900 dark:text-white font-bold tracking-tight mb-1">
            Your personal AI computer
          </h1>
          <p className="text-[13px] text-gray-500 dark:text-white/40 max-w-md mx-auto leading-relaxed">
            Construct has its own desktop, browser, Terminal, email, and calendar.
            Choose a plan to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <PlanCard
            title="Lite"
            price="$9"
            tone="lite"
            cta="Get Lite"
            features={LITE_FEATURES}
            loading={checkoutLoading === 'lite'}
            onClick={() => void handleSubscribe('lite')}
          />

          <PlanCard
            title="Starter"
            price="$59"
            tone="starter"
            cta="Get Starter"
            features={STARTER_FEATURES}
            loading={checkoutLoading === 'starter'}
            onClick={() => void handleSubscribe('starter')}
          />

          <PlanCard
            title="Pro"
            price="$299"
            tone="pro"
            cta="Get Pro"
            features={PRO_FEATURES}
            loading={checkoutLoading === 'pro'}
            onClick={() => void handleSubscribe('pro')}
          />
        </div>

        <div className="pt-5 text-center">
          <p className="text-[11px] text-gray-400 dark:text-white/20">
            Pick a plan now. You can manage billing later in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
