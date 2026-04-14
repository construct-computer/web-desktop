/**
 * UsageSection — AI Usage and storage statistics.
 * Rendered inside SettingsWindow as a section.
 */

import { useEffect, useState } from 'react';
import {
  Clock,
  Loader2,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';
import * as api from '@/services/api';
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

export function UsageSection() {
  const { subscription, usage, fetchUsage } = useBillingStore();
  const [storage, setStorage] = useState<{ bytesUsed: number; fileCount: number; maxBytes: number } | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchUsage();
    api.getStorageUsage().then(r => { if (r.success && r.data) setStorage(r.data); });
  }, [fetchUsage]);

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

  const isStaging = subscription?.environment === 'staging' || usage?.environment === 'staging';
  const weeklyPercent = usage?.weeklyPercentUsed ?? usage?.percentUsed ?? 0;
  const windowPercent = usage?.windowPercentUsed ?? 0;
  const storagePercent = storage ? (storage.bytesUsed / storage.maxBytes) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* ── AI Usage ── */}
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

              {/* Session tokens for free tier */}
              {usage?.sessionTokensCap && usage.sessionTokensCap > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[var(--color-text-muted)]">Session tokens</span>
                    <span className="font-mono text-[11px]">
                      {Math.round(usage.sessionTokensUsed || 0).toLocaleString()}
                      <span className="text-[var(--color-text-muted)] font-normal"> / {(usage.sessionTokensCap / 1000).toFixed(0)}K</span>
                    </span>
                  </div>
                  <UsageBar percent={usage.sessionPercentUsed || 0} height="h-1.5" />
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

          {!usage && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading usage...
            </div>
          )}
        </div>
      </InfoCard>

      {/* ── Storage ── */}
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
    </div>
  );
}
