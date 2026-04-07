/**
 * BillingSection — Subscription management and usage dashboard.
 * Rendered inside SettingsWindow as a section.
 *
 * The only enforced limit is AI cost per 6h window. Messages, searches,
 * and emails are unlimited.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  CreditCard,
  Zap,
  TrendingUp,
  Clock,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDrive,
  Twitter,
  Gift,
  Check,
} from 'lucide-react';
import * as api from '@/services/api';
import { Button } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';

function formatTimeRemaining(resetsAt: number | string): string {
  const ts = typeof resetsAt === 'string' ? new Date(resetsAt).getTime() : resetsAt;
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

/* ── Reusable card wrapper ── */

function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.04] ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, trailing }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--color-text-muted)]" />
        <span className="text-[13px] font-medium">{title}</span>
      </div>
      {trailing}
    </div>
  );
}

export function BillingSection() {
  const {
    subscription,
    subscriptionLoading,
    usage,
    usageLoading,
    fetchSubscription,
    fetchUsage,
    startCheckout,
    openPortal,
    buyTopup,
  } = useBillingStore();

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

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
      fetchSubscription(); // refresh topup credits
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
  useEffect(() => {
    if (!usage?.resetsAt) return;
    const update = () => setTimeLeft(formatTimeRemaining(usage.resetsAt));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [usage?.resetsAt]);

  const handleUpgrade = useCallback(async () => {
    setCheckoutLoading(true);
    const url = await startCheckout();
    if (url) window.location.href = url;
    setCheckoutLoading(false);
  }, [startCheckout]);

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

  const isPro = subscription?.plan === 'pro';
  const isCancelling = subscription?.cancelAtPeriodEnd;
  const isStaging = usage?.environment === 'staging';
  const costCap = usage?.costCapUsd ?? 0;
  const isUnlimited = costCap === -1;

  return (
    <div className="space-y-4">
      {/* ── Subscription Plan ── */}
      <InfoCard>
        <CardHeader icon={CreditCard} title="Plan" />
        <div className="px-4 pb-4">
          {subscriptionLoading && !subscription ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading subscription...
            </div>
          ) : isPro ? (
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">Pro</span>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tracking-wide uppercase">
                    Active
                  </span>
                  {!subscription?.dodoSubscriptionId && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/15 text-amber-400 font-semibold tracking-wide uppercase">
                      Dev
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
                  {subscription?.dodoSubscriptionId
                    ? isCancelling
                      ? '$250/month — cancels at end of period'
                      : '$250/month'
                    : 'Subscription bypassed (dev mode)'}
                </p>
              </div>
              {subscription?.dodoSubscriptionId && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleManage}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Manage
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[15px] font-semibold">No active plan</span>
                  <p className="text-[12px] text-[var(--color-text-muted)]">
                    Subscribe to use your AI computer
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Subscribe — $250/mo
                </Button>
              </div>
              <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] space-y-2">
                <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  Included
                </p>
                {[
                  'Unlimited access to your AI computer',
                  'All frontier AI models included',
                  'Unlimited messages, searches, and emails',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </InfoCard>

      {/* ── AI Usage ── */}
      <InfoCard>
        <CardHeader
          icon={Cpu}
          title="AI Usage"
          trailing={
            usage && (
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                <Clock className="w-3 h-3" />
                Resets in {timeLeft}
              </span>
            )
          }
        />
        <div className="px-4 pb-4">
          {usageLoading && !usage ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading usage...
            </div>
          ) : usage ? (
            <div className="space-y-3">
              {/* Cost display */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--color-text-muted)]">Cost this period</span>
                  <span className="font-mono font-medium">
                    {isStaging && isUnlimited ? (
                      <>
                        {formatCost(usage.totalCostUsd || 0)}
                        <span className="text-[var(--color-text-muted)] font-normal text-[12px] ml-1">(unlimited)</span>
                      </>
                    ) : isStaging && costCap > 0 ? (
                      <>
                        {formatCost(usage.totalCostUsd || 0)}
                        <span className="text-[var(--color-text-muted)] font-normal"> / {formatCost(costCap)}</span>
                      </>
                    ) : (
                      <>{usage.percentUsed}% used</>
                    )}
                  </span>
                </div>
                {!isUnlimited && (
                  <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        usage.percentUsed >= 100
                          ? 'bg-red-500'
                          : usage.percentUsed >= 75
                            ? 'bg-amber-500'
                            : 'bg-[var(--color-accent)]'
                      }`}
                      style={{ width: `${Math.min(100, usage.percentUsed)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Dev stats */}
              {isStaging && (
                <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)] pt-0.5">
                  <span className="font-mono">{(usage.promptTokens + usage.completionTokens).toLocaleString()} tokens</span>
                  <span className="text-black/10 dark:text-white/10">|</span>
                  <span className="font-mono">{usage.requestCount} requests</span>
                </div>
              )}

              {/* Warning banner */}
              {!isUnlimited && usage.percentUsed >= 75 && (
                <div className={`flex items-center gap-2.5 p-2.5 rounded-lg text-[12px] ${
                  usage.percentUsed >= 100
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {usage.percentUsed >= 100
                      ? `Usage limit reached. Resets in ${timeLeft}.`
                      : `${usage.percentUsed}% of usage budget used this period.`
                    }
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--color-text-muted)] py-2">No usage data available.</p>
          )}
        </div>
      </InfoCard>

      {/* ── Storage ── */}
      {storage && (
        <InfoCard>
          <CardHeader icon={HardDrive} title="Storage" />
          <div className="px-4 pb-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--color-text-muted)]">
                  {storage.fileCount} file{storage.fileCount !== 1 ? 's' : ''}
                </span>
                <span className="font-mono font-medium">
                  {formatBytes(storage.bytesUsed)}
                  <span className="text-[var(--color-text-muted)] font-normal"> / {formatBytes(storage.maxBytes)}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    storage.bytesUsed / storage.maxBytes >= 0.95
                      ? 'bg-red-500'
                      : storage.bytesUsed / storage.maxBytes >= 0.8
                        ? 'bg-amber-500'
                        : 'bg-[var(--color-accent)]'
                  }`}
                  style={{ width: `${Math.max(1, Math.min(100, (storage.bytesUsed / storage.maxBytes) * 100))}%` }}
                />
              </div>
              <div className="text-right text-[11px] text-[var(--color-text-muted)]">
                {formatBytes(storage.maxBytes - storage.bytesUsed)} available
              </div>
            </div>
          </div>
        </InfoCard>
      )}

      {/* ── Tweet for Credits ── */}
      {isPro && tweetStatus && tweetStatus.tweetsRemaining > 0 && (
        <InfoCard>
          <CardHeader icon={Gift} title="Earn Bonus Credits" trailing={
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {tweetStatus.tweetsRedeemed}/{tweetStatus.maxTweets} redeemed
            </span>
          } />
          <div className="px-4 pb-4 space-y-3">
            <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
              Tweet about Construct and earn <span className="font-semibold text-[var(--color-text)]">${tweetStatus.creditPerTweet}</span> in bonus usage credits per tweet. One tweet per week, up to {tweetStatus.maxTweets} tweets.
            </p>

            {/* Current bonus */}
            {tweetStatus.totalBonusCredits > 0 && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--color-text-muted)]">Bonus credits earned</span>
                <span className="font-mono font-medium text-emerald-400">${tweetStatus.totalBonusCredits.toFixed(2)}</span>
              </div>
            )}

            {/* Progress dots */}
            <div className="flex gap-1.5">
              {Array.from({ length: tweetStatus.maxTweets }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i < tweetStatus!.tweetsRedeemed
                      ? 'bg-emerald-500'
                      : 'bg-white/[0.08]'
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Tweet */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Step 1 — Tweet</p>
              <button
                onClick={() => window.open(tweetStatus!.shareUrl, '_blank', 'width=600,height=400')}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white transition-colors"
              >
                <Twitter className="w-3.5 h-3.5" />
                Tweet about Construct
              </button>
            </div>

            {/* Step 2: Submit link */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Step 2 — Paste your tweet link</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tweetUrl}
                  onChange={(e) => setTweetUrl(e.target.value)}
                  placeholder="https://x.com/you/status/..."
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

            {/* Feedback message */}
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

      {/* ── Credit Top-Ups ── */}
      {isPro && !isUnlimited && subscription?.topupsEnabled && (
        <InfoCard>
          <CardHeader icon={Zap} title="Credit Top-Ups" />
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[var(--color-text-muted)]">Current balance</span>
              <span className="font-mono font-medium">
                ${subscription.topupCreditsUsd.toFixed(2)}
              </span>
            </div>
            <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
              Credits extend your AI usage when you hit the cost cap.
            </p>
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
    </div>
  );
}
