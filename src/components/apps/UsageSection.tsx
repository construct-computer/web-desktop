/**
 * UsageSection — AI Usage and storage statistics.
 * Rendered inside SettingsWindow as a section.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  Loader2,
  AlertTriangle,
  HardDrive,
  Twitter,
  Gift,
  Check,
  Zap,
} from 'lucide-react';
import * as api from '@/services/api';
import { Button } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';
import { formatBytes } from '@/lib/format';

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

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function InfoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.04] ${className}`}>
      {children}
    </div>
  );
}

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

export function UsageSection() {
  const { subscription, usage, fetchUsage, fetchSubscription } = useBillingStore();
  const [storage, setStorage] = useState<{ bytesUsed: number; fileCount: number; maxBytes: number } | null>(null);

  const [tweetStatus, setTweetStatus] = useState<api.TweetStatus | null>(null);
  const [tweetUrl, setTweetUrl] = useState('');
  const [tweetSubmitting, setTweetSubmitting] = useState(false);
  const [tweetMessage, setTweetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const hasBonusCredits = !!(usage?.hasBonusCredits ?? subscription?.hasBonusCredits ?? tweetStatus?.hasBonusCredits);
  const usingBonus = !!usage?.usingBonus;
  const allTweetsRedeemed = !!tweetStatus && tweetStatus.tweetsRemaining <= 0;
  const cooldownUntil = tweetStatus?.nextEligibleAt ?? null;
  const onCooldown = !!cooldownUntil && cooldownUntil > Date.now();

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
      fetchUsage();
    } else {
      setTweetMessage({ type: 'error', text: ('error' in result ? result.error : null) || 'Failed to redeem tweet' });
    }
  }, [tweetUrl, fetchTweetStatus, fetchSubscription, fetchUsage]);

  useEffect(() => {
    fetchUsage();
    fetchSubscription();
    fetchTweetStatus();
    api.getStorageUsage().then(r => { if (r.success && r.data) setStorage(r.data); });
  }, [fetchUsage, fetchSubscription, fetchTweetStatus]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsage();
      fetchTweetStatus();
      fetchSubscription();
      api.getStorageUsage().then(r => { if (r.success && r.data) setStorage(r.data); });
    }, 15_000);
    return () => clearInterval(interval);
  }, [fetchUsage, fetchTweetStatus, fetchSubscription]);

  const [weeklyTimeLeft, setWeeklyTimeLeft] = useState('');
  const [windowTimeLeft, setWindowTimeLeft] = useState('');
  useEffect(() => {
    const update = () => {
      if (usage?.weeklyResetsAt) setWeeklyTimeLeft(formatTimeRemaining(usage.weeklyResetsAt));
      if (usage?.windowResetsAt) setWindowTimeLeft(formatTimeRemaining(usage.windowResetsAt));
    };
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [usage?.weeklyResetsAt, usage?.windowResetsAt]);

  const weeklyPercent = usage?.weeklyPercentUsed ?? 0;
  const windowPercent = usage?.windowPercentUsed ?? 0;
  const storagePercent = storage ? (storage.bytesUsed / storage.maxBytes) * 100 : 0;

  return (
    <div className="space-y-4">
      <InfoCard>
        <div className="px-4 pt-3.5 pb-4 space-y-4">
          {usage && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium">AI Usage</span>
                <div className="flex items-center gap-2">
                  {usage.byokActive && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <Zap className="w-3 h-3" />
                      Using your key
                    </span>
                  )}
                  {usingBonus && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <Zap className="w-3 h-3" />
                      Bonus active
                    </span>
                  )}
                </div>
              </div>

              {usage.byokFallback && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg text-[12px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Switched to your OpenRouter key — platform weekly cap reached. Platform access returns on the next weekly reset.</span>
                </div>
              )}
              {usage.byokActive && !usage.byokFallback && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg text-[12px] bg-cyan-500/5 text-cyan-400/80 border border-cyan-500/15">
                  <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Using your OpenRouter key (exclusive mode).</span>
                </div>
              )}
              {!usage.allowed && !usage.byokActive && !usage.byokFallback && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg text-[12px] bg-red-500/10 text-red-400 border border-red-500/20">
                  <span>Usage limit reached. Add an OpenRouter key below or upgrade your plan to keep working.</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[var(--color-text-muted)]">Weekly</span>
                  <span className="font-mono text-[12px] flex items-center gap-2">
                    {usage.weeklyUsedUsd !== undefined && usage.weeklyCapUsd !== undefined && usage.weeklyCapUsd > 0 ? (
                      <span>
                        {formatCost(usage.weeklyUsedUsd)}
                        <span className="text-[var(--color-text-muted)] font-normal"> / {formatCost(usage.weeklyCapUsd)}</span>
                        <span className="text-[var(--color-text-muted)] font-normal"> ({Math.round(weeklyPercent)}%)</span>
                      </span>
                    ) : (
                      <span>{Math.round(weeklyPercent)}%</span>
                    )}
                    {usage.weeklyResetsAt && (
                      <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                        <Clock className="w-3 h-3" />
                        {weeklyTimeLeft}
                      </span>
                    )}
                  </span>
                </div>
                <UsageBar percent={weeklyPercent} />
                {(usage.topupCreditsUsd ?? 0) > 0 && (
                  <p className="text-[11px] text-emerald-400">
                    {formatCost(usage.topupCreditsUsd || 0)} bonus credits available
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[var(--color-text-muted)]">4-hour window</span>
                  <span className="font-mono text-[12px] flex items-center gap-2">
                    {usage.windowUsedUsd !== undefined && usage.windowCapUsd !== undefined && usage.windowCapUsd > 0 ? (
                      <span>
                        {formatCost(usage.windowUsedUsd)}
                        <span className="text-[var(--color-text-muted)] font-normal"> / {formatCost(usage.windowCapUsd)}</span>
                        <span className="text-[var(--color-text-muted)] font-normal"> ({Math.round(windowPercent)}%)</span>
                      </span>
                    ) : (
                      <span>{Math.round(windowPercent)}%</span>
                    )}
                    {usage.windowResetsAt && (
                      <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                        <Clock className="w-3 h-3" />
                        {windowTimeLeft}
                      </span>
                    )}
                  </span>
                </div>
                <UsageBar percent={windowPercent} height="h-1.5" />
              </div>

              {weeklyPercent >= 75 && !usingBonus && (
                <div className={`flex items-center gap-2.5 p-2.5 rounded-lg text-[12px] ${
                  weeklyPercent >= 100 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {weeklyPercent >= 100
                      ? `Weekly limit reached. Resets in ${weeklyTimeLeft}.`
                      : `${Math.round(weeklyPercent)}% of weekly usage consumed.`}
                  </span>
                </div>
              )}
            </div>
          )}

          {!usage && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading usage...
            </div>
          )}
        </div>
      </InfoCard>

      {storage && (
        <InfoCard>
          <div className="px-4 pt-3.5 pb-4 space-y-3">
            <span className="text-[13px] font-medium">Storage</span>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                  <HardDrive className="w-3 h-3" />
                  Used
                  <span className="text-[10px] text-[var(--color-text-muted)]/50">({storage.fileCount} file{storage.fileCount !== 1 ? 's' : ''})</span>
                </span>
                <span className="font-mono text-[12px]">
                  {formatBytes(storage.bytesUsed)}
                  <span className="text-[var(--color-text-muted)] font-normal"> / {formatBytes(storage.maxBytes)}</span>
                </span>
              </div>
              <UsageBar percent={storagePercent} height="h-1.5" />
            </div>
          </div>
        </InfoCard>
      )}

      {tweetStatus && (
        <InfoCard>
          <div className="px-4 pt-3.5 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-[13px] font-medium">Earn Bonus Usage</span>
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                {tweetStatus.tweetsRedeemed}/{tweetStatus.maxTweets} redeemed
              </span>
            </div>

            <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
              Tweet about Construct to earn{' '}
              {tweetStatus.creditPerTweet ? (
                <span className="font-semibold text-[var(--color-text)]">${tweetStatus.creditPerTweet}</span>
              ) : (
                <span className="font-semibold text-[var(--color-text)]">bonus usage</span>
              )}
              {tweetStatus.creditPerTweet ? ' in bonus usage' : ''}. Kicks in only after your weekly limit is hit. Max {tweetStatus.maxTweets} tweets, one per week.
            </p>

            <div className="flex gap-1.5">
              {Array.from({ length: tweetStatus.maxTweets }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i < tweetStatus.tweetsRedeemed ? 'bg-emerald-500' : 'bg-white/[0.08]'
                  }`}
                />
              ))}
            </div>

            {hasBonusCredits && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-400">
                <Zap className="w-3 h-3" />
                {tweetStatus.totalBonusCredits !== undefined
                  ? `${formatCost(tweetStatus.totalBonusCredits)} bonus usage available`
                  : 'Bonus usage available'}
              </div>
            )}

            {allTweetsRedeemed ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>All {tweetStatus.maxTweets} tweets redeemed. Thanks for sharing Construct!</span>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => window.open(tweetStatus.shareUrl, '_blank', 'width=600,height=400')}
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
                    placeholder={onCooldown ? 'On cooldown...' : 'Paste your tweet link...'}
                    disabled={onCooldown}
                    className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-[var(--color-text-muted)]/50 disabled:opacity-50"
                  />
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleRedeemTweet}
                    disabled={tweetSubmitting || !tweetUrl.trim() || onCooldown}
                  >
                    {tweetSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Claim'}
                  </Button>
                </div>
                {onCooldown && cooldownUntil && (
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Next tweet eligible in {formatTimeRemaining(cooldownUntil)}.
                  </p>
                )}
              </div>
            )}

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
