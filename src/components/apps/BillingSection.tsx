/**
 * BillingSection — Subscription management and usage dashboard.
 * Rendered inside SettingsWindow as a section.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Zap,
  Clock,
  ExternalLink,
  Loader2,
  AlertTriangle,
  HardDrive,
  Twitter,
  Gift,
  Check,
  X,
} from 'lucide-react';
import * as api from '@/services/api';
import { Button } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';

function formatTimeRemaining(resetsAt: number | string): string {
  const ts = typeof resetsAt === 'string' ? new Date(resetsAt).getTime() : resetsAt;
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ── Reusable card wrapper ── */

function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.04] ${className}`}>
      {children}
    </div>
  );
}

/* ── Progress bar ── */

function UsageBar({ percent, height = 'h-2' }: { percent: number; height?: string }) {
  return (
    <div className={`${height} rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          percent >= 100 ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : 'bg-[var(--color-accent)]'
        }`}
        style={{ width: `${Math.max(1, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

export function BillingSection() {
  const {
    subscription,
    subscriptionLoading,
    usage,
    fetchSubscription,
    fetchUsage,
    startCheckout,
    switchPlan,
    openPortal,
    buyTopup,
  } = useBillingStore();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [storage, setStorage] = useState<{ bytesUsed: number; fileCount: number; maxBytes: number } | null>(null);

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
    fetchUsage();
    fetchTweetStatus();
    api.getStorageUsage().then(r => { if (r.success && r.data) setStorage(r.data); });
  }, [fetchSubscription, fetchUsage, fetchTweetStatus]);

  // Refresh usage + storage every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsage();
      api.getStorageUsage().then(r => { if (r.success && r.data) setStorage(r.data); });
    }, 15_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // Countdown timer for reset
  const [timeLeft, setTimeLeft] = useState('');
  const resetsAt = usage?.weeklyResetsAt || usage?.resetsAt;
  useEffect(() => {
    if (!resetsAt) return;
    const update = () => setTimeLeft(formatTimeRemaining(resetsAt));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [resetsAt]);

  const handleCheckout = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(true);
    const url = await startCheckout(undefined, plan);
    if (url) window.location.href = url;
    setCheckoutLoading(false);
  }, [startCheckout]);

  const handleSwitchPlan = useCallback(async (plan: 'free' | 'starter' | 'pro') => {
    setCheckoutLoading(true);
    const success = await switchPlan(plan);
    setCheckoutLoading(false);
    if (success) window.location.reload();
  }, [switchPlan]);

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
  const isStaging = subscription?.environment === 'staging' || usage?.environment === 'staging';
  const isDevMode = isStaging || !subscription?.dodoSubscriptionId;

  const weeklyPercent = usage?.weeklyPercentUsed ?? usage?.percentUsed ?? 0;
  const windowPercent = usage?.windowPercentUsed ?? 0;
  const storagePercent = storage ? (storage.bytesUsed / storage.maxBytes) * 100 : 0;

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

      {/* ── Usage + Storage ── */}
      {subscriptionLoading && !subscription ? (
        <InfoCard>
          <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] px-4 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading usage...
          </div>
        </InfoCard>
      ) : (
        <InfoCard>
          <div className="px-4 pt-3.5 pb-4 space-y-4">
            {/* Weekly usage */}
            {usage && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium">AI Usage</span>
                  {resetsAt && weeklyPercent > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                      <Clock className="w-3 h-3" />
                      Resets in {timeLeft}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[var(--color-text-muted)]">Weekly</span>
                    <span className="font-mono text-[12px]">
                      {isStaging && usage.weeklyUsedUsd !== undefined && usage.weeklyCapUsd !== undefined ? (
                        <>
                          {formatCost(usage.weeklyUsedUsd)}
                          <span className="text-[var(--color-text-muted)] font-normal"> / {formatCost(usage.weeklyCapUsd)}</span>
                        </>
                      ) : (
                        <>{weeklyPercent}%</>
                      )}
                    </span>
                  </div>
                  <UsageBar percent={weeklyPercent} />
                </div>

                {/* Window usage — only when active */}
                {windowPercent > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-[var(--color-text-muted)]">Current window</span>
                      <span className="font-mono text-[11px]">
                        {isStaging && usage.windowUsedUsd !== undefined && usage.windowCapUsd !== undefined ? (
                          <>
                            {formatCost(usage.windowUsedUsd)}
                            <span className="text-[var(--color-text-muted)] font-normal"> / {formatCost(usage.windowCapUsd)}</span>
                          </>
                        ) : (
                          <>{windowPercent}%</>
                        )}
                      </span>
                    </div>
                    <UsageBar percent={windowPercent} height="h-1.5" />
                  </div>
                )}

                {/* Warning banner */}
                {weeklyPercent >= 75 && (
                  <div className={`flex items-center gap-2.5 p-2.5 rounded-lg text-[12px] ${
                    weeklyPercent >= 100 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      {weeklyPercent >= 100
                        ? `Usage limit reached. Resets in ${timeLeft}.`
                        : `${weeklyPercent}% of weekly budget used.`}
                    </span>
                  </div>
                )}

                {/* Staging debug stats */}
                {isStaging && (
                  <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]/50 font-mono">
                    <span>{((usage.promptTokens || 0) + (usage.completionTokens || 0)).toLocaleString()} tokens</span>
                    <span>{usage.requestCount || 0} requests</span>
                  </div>
                )}
              </div>
            )}

            {/* Divider between usage and storage */}
            {usage && storage && (
              <div className="border-t border-black/[0.04] dark:border-white/[0.04]" />
            )}

            {/* Storage */}
            {storage && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                    <HardDrive className="w-3 h-3" />
                    Storage
                    <span className="text-[10px] text-[var(--color-text-muted)]/50">({storage.fileCount} file{storage.fileCount !== 1 ? 's' : ''})</span>
                  </span>
                  <span className="font-mono text-[12px]">
                    {formatBytes(storage.bytesUsed)}
                    <span className="text-[var(--color-text-muted)] font-normal"> / {formatBytes(storage.maxBytes)}</span>
                  </span>
                </div>
                <UsageBar percent={storagePercent} height="h-1.5" />
              </div>
            )}

            {!usage && !storage && (
              <p className="text-[12px] text-[var(--color-text-muted)] py-2">No usage data available.</p>
            )}
          </div>
        </InfoCard>
      )}

      {/* ── Credit Top-Ups (staging only, if balance > 0) ── */}
      {isStaging && (subscription?.topupCreditsUsd ?? 0) > 0 && (
        <InfoCard>
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-[13px] font-medium">Credits</span>
              </div>
              <span className="font-mono text-[13px] font-medium">
                ${(subscription?.topupCreditsUsd ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="flex gap-2">
              {[10, 25, 50].map((amt) => (
                <Button key={amt} size="sm" variant="default" onClick={() => handleTopup(amt)}>
                  +${amt}
                </Button>
              ))}
            </div>
          </div>
        </InfoCard>
      )}

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
