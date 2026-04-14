/**
 * BillingSection — Subscription management and usage dashboard.
 * Rendered inside SettingsWindow as a section.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  ExternalLink,
  Loader2,
  AlertTriangle,
  Twitter,
  Gift,
  Check,
  X,
} from 'lucide-react';
import * as api from '@/services/api';
import { Button } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';

/* ── Reusable card wrapper ── */

function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.04] ${className}`}>
      {children}
    </div>
  );
}

export function BillingSection() {
  const {
    subscription,
    subscriptionLoading,
    fetchSubscription,
    startCheckout,
    switchPlan,
    openPortal,
    buyTopup,
  } = useBillingStore();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Tweet credits state
  const [tweetStatus, setTweetStatus] = useState<api.TweetStatus | null>(null);
  const [tweetUrl, setTweetUrl] = useState('');
  const [tweetSubmitting, setTweetSubmitting] = useState(false);
  const [tweetMessage, setTweetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTweetStatus = useCallback(() => {
    api.getTweetStatus().then(r => { if (r.success && r.data) setTweetStatus(r.data); });
  }, []);

  const handleRedeemTweet = useCallback(async () => {
    if (!tweetUrl.trim()) return;
    setTweetSubmitting(true);
    setTweetMessage(null);
    const result = await api.redeemTweet(tweetUrl.trim());
    setTweetSubmitting(false);
    if (result.success && result.data) {
      setTweetMessage({ type: 'success', text: result.data.message });
      setTweetUrl('');
      fetchTweetStatus();
      fetchSubscription();
    } else {
      setTweetMessage({ type: 'error', text: ('error' in result ? result.error : null) || 'Failed to redeem tweet' });
    }
  }, [tweetUrl, fetchTweetStatus, fetchSubscription]);

  // Fetch data on mount
  useEffect(() => {
    fetchSubscription();
    fetchTweetStatus();
  }, [fetchSubscription, fetchTweetStatus]);

  const handleCheckout = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(true);
    console.log('[BillingSection] handleCheckout called with plan:', plan);
    const url = await startCheckout(plan);
    if (url) window.location.href = url;
    setCheckoutLoading(false);
  }, [startCheckout]);

  const handleSwitchPlan = useCallback(async (plan: 'free' | 'starter' | 'pro') => {
    setCheckoutLoading(true);
    const result = await switchPlan(plan);
    setCheckoutLoading(false);
    if (result === true) {
      window.location.reload();
    } else if (typeof result === 'object' && result.redirectToCheckout) {
      // If upgrade required, redirect to checkout
      handleCheckout(result.targetPlan as 'starter' | 'pro');
    }
  }, [switchPlan, handleCheckout]);

  const handleManage = useCallback(async () => {
    setPortalLoading(true);
    const url = await openPortal();
    if (url) window.location.href = url;
    setPortalLoading(false);
  }, [openPortal]);

  const handleTopup = useCallback(async (amount: number) => {
    const url = await buyTopup(amount);
    if (url) window.location.href = url;
  }, [buyTopup]);

  const currentPlan = subscription?.plan || 'free';
  const hasActivePlan = currentPlan === 'pro' || currentPlan === 'starter' || currentPlan === 'free';
  const isStaging = subscription?.environment === 'staging';
  const isDevMode = isStaging || !subscription?.dodoSubscriptionId;

  return (
    <div className="space-y-4">
      {/* ── Plan Selection ── */}
      <InfoCard>
        {subscriptionLoading && !subscription ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] px-4 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading subscription...
          </div>
        ) : (
          <div className="px-4 pt-3.5 pb-4 space-y-3">
            {/* Manage billing link */}
            {!isDevMode && subscription?.dodoSubscriptionId && (
              <div className="flex justify-end -mb-1">
                <button
                  onClick={handleManage}
                  disabled={portalLoading}
                  className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  {portalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                  Manage billing
                </button>
              </div>
            )}

            <PlanSelector
              currentPlan={currentPlan}
              isDevMode={isDevMode}
              checkoutLoading={checkoutLoading}
              onSwitchPlan={handleSwitchPlan}
              onCheckout={handleCheckout}
            />
          </div>
        )}
      </InfoCard>

      {/* ── Earn Bonus ── */}
      {hasActivePlan && tweetStatus && tweetStatus.tweetsRemaining > 0 && (
        <InfoCard>
          <div className="px-4 pt-3.5 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-[13px] font-medium">
                  {currentPlan === 'starter' ? 'Earn Bonus Messages' : 'Earn Bonus Credits'}
                </span>
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                {tweetStatus.tweetsRedeemed}/{tweetStatus.maxTweets} redeemed
              </span>
            </div>

            <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
              {currentPlan === 'starter'
                ? <>Tweet about Construct and earn <span className="font-semibold text-[var(--color-text)]">{tweetStatus.messagesPerTweet} bonus messages</span> per tweet.</>
                : <>Tweet about Construct and earn <span className="font-semibold text-[var(--color-text)]">${tweetStatus.creditPerTweet}</span> in bonus credits per tweet.</>
              }
            </p>

            {/* Progress dots */}
            <div className="flex gap-1.5">
              {Array.from({ length: tweetStatus.maxTweets }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i < tweetStatus!.tweetsRedeemed ? 'bg-emerald-500' : 'bg-white/[0.08]'
                  }`}
                />
              ))}
            </div>

            {/* Tweet + Claim */}
            <div className="space-y-2">
              <button
                onClick={() => window.open(tweetStatus!.shareUrl, '_blank', 'width=600,height=400')}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white transition-colors"
              >
                <Twitter className="w-3.5 h-3.5" />
                Tweet about Construct
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tweetUrl}
                  onChange={(e) => setTweetUrl(e.target.value)}
                  placeholder="Paste your tweet link..."
                  className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]/50"
                />
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleRedeemTweet}
                  disabled={tweetSubmitting || !tweetUrl.trim()}
                >
                  {tweetSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Claim'}
                </Button>
              </div>
            </div>

            {tweetMessage && (
              <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] leading-relaxed ${
                tweetMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {tweetMessage.type === 'success' ? <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                <span>{tweetMessage.text}</span>
              </div>
            )}
          </div>
        </InfoCard>
      )}
    </div>
  );
}

// ── Plan Selector (plan cards + feature comparison in one) ──

type PlanId = 'free' | 'starter' | 'pro';
const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];

type FeatureRow = {
  label: string;
  free: string;
  starter: string;
  pro: string;
  freeHas: boolean;
  starterHas: boolean;
  proHas: boolean;
};

const PLAN_FEATURES: FeatureRow[] = [
  { label: 'Usage',             free: '1x',      starter: '3x',    pro: '30x',        freeHas: true,  starterHas: true,  proHas: true },
  { label: 'AI model',          free: 'Basic',   starter: 'Fast',  pro: 'Premium',    freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Storage',           free: '500 MB',  starter: '1 GB',  pro: '2 GB',       freeHas: true,  starterHas: true,  proHas: true },
  { label: 'Agent email',       free: '',        starter: '',      pro: '',            freeHas: false, starterHas: false, proHas: true },
  { label: 'Background agents', free: '',        starter: '',      pro: '',            freeHas: false, starterHas: false, proHas: true },
];

function PlanSelector({ currentPlan, isDevMode, checkoutLoading, onSwitchPlan, onCheckout }: {
  currentPlan: string;
  isDevMode: boolean;
  checkoutLoading: boolean;
  onSwitchPlan: (plan: 'free' | 'starter' | 'pro') => void;
  onCheckout: (plan: 'starter' | 'pro') => void;
}) {
  const effective = (currentPlan || 'free') as PlanId;
  const currentIndex = PLAN_ORDER.indexOf(effective);

  const plans: { id: PlanId; name: string; price: string; period: string }[] = [
    { id: 'free', name: 'Free', price: '$0', period: '' },
    { id: 'starter', name: 'Starter', price: '$9', period: '/mo' },
    { id: 'pro', name: 'Pro', price: '$99', period: '/mo' },
  ];

  return (
    <div className="space-y-3">
      {/* Plan cards row */}
      <div className="grid grid-cols-3 gap-2">
        {plans.map((p) => {
          const isCurrent = p.id === effective;
          const targetIndex = PLAN_ORDER.indexOf(p.id);
          const isUpgrade = targetIndex > currentIndex;
          return (
            <div
              key={p.id}
              className={`p-3 rounded-lg border text-center ${
                isCurrent
                  ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent)]/[0.04]'
                  : 'border-black/[0.06] dark:border-white/[0.06]'
              }`}
            >
              <span className="text-[13px] font-semibold">{p.name}</span>
              <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                <span className="text-[18px] font-bold">{p.price}</span>
                {p.period && <span className="text-[11px] text-[var(--color-text-muted)]">{p.period}</span>}
              </div>
              {isCurrent ? (
                <div className="mt-2 text-[11px] font-medium text-[var(--color-accent)] py-1">Current</div>
              ) : (
                <Button
                  size="sm"
                  variant={isUpgrade ? 'primary' : 'default'}
                  onClick={() => {
                    if (p.id === 'free' || isDevMode) onSwitchPlan(p.id);
                    else onCheckout(p.id as 'starter' | 'pro');
                  }}
                  disabled={checkoutLoading}
                  className="w-full mt-2"
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isUpgrade ? (
                    'Upgrade'
                  ) : (
                    'Switch'
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature comparison table */}
      <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_72px_72px_72px] text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
          <span />
          <span className="text-center">Free</span>
          <span className="text-center">Starter</span>
          <span className="text-center">Pro</span>
        </div>
        {PLAN_FEATURES.map((f, i) => (
          <div
            key={f.label}
            className={`grid grid-cols-[1fr_72px_72px_72px] items-center px-3 py-1.5 text-[11px] ${
              i % 2 === 0 ? '' : 'bg-black/[0.015] dark:bg-white/[0.015]'
            }`}
          >
            <span className="text-[var(--color-text-muted)]">{f.label}</span>
            {(['free', 'starter', 'pro'] as const).map((tier) => {
              const has = f[`${tier}Has`];
              const val = f[tier];
              return (
                <span key={tier} className="text-center">
                  {has ? (
                    val ? (
                      <span className={tier === effective ? 'text-[var(--color-text)] font-medium' : 'text-[var(--color-text-muted)]'}>{val}</span>
                    ) : (
                      <Check className="w-3 h-3 text-emerald-400 mx-auto" />
                    )
                  ) : (
                    <X className="w-3 h-3 text-red-400/60 mx-auto" />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
