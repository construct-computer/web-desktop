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
  X,
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
    switchPlan,
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

  const handleCheckout = useCallback(async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(true);
    const url = await startCheckout(undefined, plan);
    if (url) window.location.href = url;
    setCheckoutLoading(false);
  }, [startCheckout]);

  const handleSwitchPlan = useCallback(async (plan: 'starter' | 'pro') => {
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

  const hasActivePlan = subscription?.plan === 'pro' || subscription?.plan === 'starter';
  const isByok = subscription?.plan === 'starter';
  const isStaging = subscription?.environment === 'staging' || usage?.environment === 'staging';
  const isDevMode = isStaging || !subscription?.dodoSubscriptionId;
  const costCap = usage?.costCapUsd ?? 0;
  const isUnlimited = costCap === -1;

  return (
    <div className="space-y-4">
      {/* ── Plan Comparison ── */}
      <InfoCard>
        <CardHeader icon={CreditCard} title="Plan" trailing={
          !isDevMode && subscription?.dodoSubscriptionId && (
            <button
              onClick={handleManage}
              disabled={portalLoading}
              className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              {portalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
              Manage billing
            </button>
          )
        } />
        <div className="px-4 pb-4">
          {subscriptionLoading && !subscription ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading subscription...
            </div>
          ) : (
            <PlanComparison
              currentPlan={subscription?.plan || null}
              isDevMode={isDevMode}
              checkoutLoading={checkoutLoading}
              onSwitchPlan={handleSwitchPlan}
              onCheckout={handleCheckout}
            />
          )}
        </div>
      </InfoCard>

      {/* ── Usage ── */}
      <InfoCard>
        <CardHeader
          icon={Cpu}
          title="Usage"
          trailing={
            isByok ? (
              <span className="text-[11px] text-[var(--color-text-muted)]">Resets daily at midnight UTC</span>
            ) : usage ? (
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                <Clock className="w-3 h-3" />
                Resets in {timeLeft}
              </span>
            ) : null
          }
        />
        <div className="px-4 pb-4">
          {subscriptionLoading && !subscription ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading usage...
            </div>
          ) : isByok ? (
            /* ── Starter: Daily quota bars ── */
            <StarterUsageDisplay
              quotaUsage={subscription?.dailyQuotaUsage as Record<string, number> | undefined}
              planLimits={subscription?.planLimits as Record<string, number> | undefined}
              bonusMessages={subscription?.bonusMessages ?? 0}
            />
          ) : usage ? (
            /* ── Pro: Cost-based usage ── */
            <div className="space-y-3">
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
                        usage.percentUsed >= 100 ? 'bg-red-500' : usage.percentUsed >= 75 ? 'bg-amber-500' : 'bg-[var(--color-accent)]'
                      }`}
                      style={{ width: `${Math.min(100, usage.percentUsed)}%` }}
                    />
                  </div>
                )}
              </div>
              {isStaging && (
                <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)] pt-0.5">
                  <span className="font-mono">{((usage.promptTokens || 0) + (usage.completionTokens || 0)).toLocaleString()} tokens</span>
                  <span className="text-black/10 dark:text-white/10">|</span>
                  <span className="font-mono">{usage.requestCount || 0} requests</span>
                </div>
              )}
              {!isUnlimited && usage.percentUsed >= 75 && (
                <div className={`flex items-center gap-2.5 p-2.5 rounded-lg text-[12px] ${
                  usage.percentUsed >= 100 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{usage.percentUsed >= 100 ? `Usage limit reached. Resets in ${timeLeft}.` : `${usage.percentUsed}% of usage budget used this period.`}</span>
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

      {/* ── Credit Top-Ups ── */}
      {hasActivePlan && !isUnlimited && subscription?.topupsEnabled && (
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

      {/* ── Earn Bonus ── */}
      {hasActivePlan && tweetStatus && tweetStatus.tweetsRemaining > 0 && (
        <InfoCard>
          <CardHeader icon={Gift} title={isByok ? 'Earn Bonus Messages' : 'Earn Bonus Credits'} trailing={
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {tweetStatus.tweetsRedeemed}/{tweetStatus.maxTweets} redeemed
            </span>
          } />
          <div className="px-4 pb-4 space-y-3">
            <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
              {isByok
                ? <>Tweet about Construct and earn <span className="font-semibold text-[var(--color-text)]">{tweetStatus.messagesPerTweet} bonus messages</span> per tweet. One tweet per week, up to {tweetStatus.maxTweets} tweets.</>
                : <>Tweet about Construct and earn <span className="font-semibold text-[var(--color-text)]">${tweetStatus.creditPerTweet}</span> in bonus usage credits per tweet. One tweet per week, up to {tweetStatus.maxTweets} tweets.</>
              }
            </p>

            {/* Current bonus */}
            {isByok ? (
              tweetStatus.bonusMessages > 0 && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--color-text-muted)]">Bonus messages remaining</span>
                  <span className="font-mono font-medium text-emerald-400">{tweetStatus.bonusMessages}</span>
                </div>
              )
            ) : (
              tweetStatus.totalBonusCredits > 0 && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--color-text-muted)]">Bonus credits earned</span>
                  <span className="font-mono font-medium text-emerald-400">${tweetStatus.totalBonusCredits.toFixed(2)}</span>
                </div>
              )
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
    </div>
  );
}

// ── Plan Comparison ──

type FeatureRow = { label: string; starter: string; pro: string; starterHas: boolean; proHas: boolean };

const PLAN_FEATURES: FeatureRow[] = [
  { label: 'AI model',           starter: 'Free (or own key)',   pro: 'Premium (included)',    starterHas: true,  proHas: true },
  { label: 'Web searches',       starter: '50 / day',            pro: 'Unlimited',             starterHas: true,  proHas: true },
  { label: 'Browser sessions',   starter: '10 / day',            pro: 'Unlimited',             starterHas: true,  proHas: true },
  { label: 'Email',               starter: 'Gmail (via Apps)',     pro: 'Agent inbox',            starterHas: true,  proHas: true },
  { label: 'Storage',            starter: '500 MB',              pro: '2 GB',                  starterHas: true,  proHas: true },
  { label: 'Apps',               starter: '3',                   pro: 'Unlimited',             starterHas: true,  proHas: true },
  { label: 'Scheduled tasks',    starter: '5',                   pro: 'Unlimited',             starterHas: true,  proHas: true },
  { label: 'Background agents',  starter: '',                    pro: '',                      starterHas: false, proHas: true },
];

// ── Starter Daily Usage ──

type QuotaRow = { key: string; label: string; used: number; limit: number; unit?: string };

function StarterUsageDisplay({ quotaUsage, planLimits, bonusMessages = 0 }: {
  quotaUsage?: Record<string, number>;
  planLimits?: Record<string, number>;
  bonusMessages?: number;
}) {
  const rows: QuotaRow[] = [
    {
      key: 'free_message',
      label: 'Messages',
      used: quotaUsage?.free_message ?? 0,
      limit: planLimits?.dailyFreeMessages ?? 25,
    },
    { key: 'search', label: 'Searches', used: quotaUsage?.search ?? 0, limit: planLimits?.dailySearches ?? 50 },
    { key: 'browser', label: 'Browser', used: quotaUsage?.browser ?? 0, limit: planLimits?.dailyBrowserSessions ?? 10 },
    { key: 'sandbox', label: 'Sandbox', used: quotaUsage?.sandbox ?? 0, limit: planLimits?.dailySandboxMinutes ?? 60, unit: 'min' },
  ];

  const anyLow = rows.some(r => r.limit > 0 && r.used / r.limit >= 0.8);
  const anyExhausted = rows.some(r => r.limit > 0 && r.used >= r.limit);

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {rows.map((r) => {
          const pct = r.limit > 0 ? Math.min(100, (r.used / r.limit) * 100) : 0;
          return (
            <div key={r.key} className="space-y-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--color-text-muted)]">{r.label}</span>
                <span className="font-mono text-[11px]">
                  <span className={pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : ''}>{r.used}</span>
                  <span className="text-[var(--color-text-muted)]"> / {r.limit}{r.unit ? ` ${r.unit}` : ''}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[var(--color-accent)]'
                  }`}
                  style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bonus messages balance */}
      {bonusMessages > 0 && (
        <div className="flex items-center justify-between text-[12px] pt-1">
          <span className="text-[var(--color-text-muted)]">Bonus messages</span>
          <span className="font-mono text-[11px] text-emerald-400">{bonusMessages} remaining</span>
        </div>
      )}

      {anyExhausted && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg text-[11px] bg-red-500/10 text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            {bonusMessages > 0
              ? 'Daily limit reached. Using bonus messages.'
              : 'Some daily limits reached. Resets at midnight UTC.'}
          </span>
        </div>
      )}
      {!anyExhausted && anyLow && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg text-[11px] bg-amber-500/10 text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Some daily quotas are running low.</span>
        </div>
      )}
    </div>
  );
}

function PlanComparison({ currentPlan, isDevMode, checkoutLoading, onSwitchPlan, onCheckout }: {
  currentPlan: string | null;
  isDevMode: boolean;
  checkoutLoading: boolean;
  onSwitchPlan: (plan: 'starter' | 'pro') => void;
  onCheckout: (plan: 'starter' | 'pro') => void;
}) {
  const isStarter = currentPlan === 'starter';
  const isPro = currentPlan === 'pro';

  function renderPlanAction(plan: 'starter' | 'pro') {
    const isCurrent = plan === currentPlan;
    if (isCurrent) {
      return (
        <div className="mt-3 text-center text-[11px] font-medium text-emerald-400 py-1.5">
          Current plan
        </div>
      );
    }
    const isUpgrade = plan === 'pro';
    return (
      <Button
        size="sm"
        variant={isUpgrade ? 'primary' : 'default'}
        onClick={() => isDevMode ? onSwitchPlan(plan) : onCheckout(plan)}
        disabled={checkoutLoading}
        className="w-full mt-3"
      >
        {checkoutLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isUpgrade ? (
          <><Zap className="w-3 h-3 mr-1" /> Upgrade</>
        ) : (
          'Downgrade'
        )}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Side-by-side plan cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Starter */}
        <div className={`p-3 rounded-lg border ${
          isStarter
            ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
            : 'border-black/[0.06] dark:border-white/[0.06]'
        }`}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold">Starter</span>
            {isStarter && (
              <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tracking-wide uppercase">
                Active
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[20px] font-bold">$9</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">/mo</span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Free AI, or bring your own key</p>
          {renderPlanAction('starter')}
        </div>

        {/* Pro */}
        <div className={`p-3 rounded-lg border ${
          isPro
            ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
            : 'border-black/[0.06] dark:border-white/[0.06]'
        }`}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold">Pro</span>
            {isPro && (
              <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tracking-wide uppercase">
                Active
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[20px] font-bold">$250</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">/mo</span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">AI included, unlimited</p>
          {renderPlanAction('pro')}
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
          <span>Feature</span>
          <span className="text-center w-[100px]">Starter</span>
          <span className="text-center w-[100px]">Pro</span>
        </div>
        {PLAN_FEATURES.map((f, i) => (
          <div
            key={f.label}
            className={`grid grid-cols-[1fr_auto_auto] items-center px-3 py-1.5 text-[11px] ${
              i % 2 === 0 ? '' : 'bg-black/[0.015] dark:bg-white/[0.015]'
            }`}
          >
            <span className="text-[var(--color-text-muted)]">{f.label}</span>
            <span className="text-center w-[100px]">
              {f.starterHas ? (
                <span className={isStarter ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>{f.starter}</span>
              ) : (
                <X className="w-3 h-3 text-red-400/60 mx-auto" />
              )}
            </span>
            <span className="text-center w-[100px]">
              {f.proHas ? (
                f.pro ? (
                  <span className={isPro ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>{f.pro}</span>
                ) : (
                  <Check className="w-3 h-3 text-emerald-400 mx-auto" />
                )
              ) : (
                <X className="w-3 h-3 text-red-400/60 mx-auto" />
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Shared features */}
      <div className="space-y-1.5 pt-1">
        <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Both plans include
        </p>
        {[
          'Cloud desktop with AI agent',
          'Web search, email & calendar',
          'Terminal & code sandbox',
          'Memory & file storage',
        ].map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            {feature}
          </div>
        ))}
      </div>
    </div>
  );
}

