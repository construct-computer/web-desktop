/**
 * StatusWidget — unified agent status + usage stats widget.
 * Combines agent connection state, recent tool activity, and token/cost metrics
 * into a single draggable desktop widget.
 */

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useBillingStore } from '@/stores/billingStore';
import { useDraggableWidget } from '@/hooks/useDraggableWidget';
import * as api from '@/services/api';
import { USAGE_POLL_INTERVAL_MS } from '@/lib/config';
import { openSettingsToSection } from '@/lib/settingsNav';
import { providerCopy, TONE_HEX } from '@/lib/providerCopy';
import buyIcon from '@/icons/buy.png';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  terminal: 'Terminal', sandbox_write_file: 'Write file', sandbox_read_file: 'Read file',
  save_to_workspace: 'Save', load_from_workspace: 'Load', browser: 'Browser',
  web_search: 'Search', remote_browser: 'Browse', read_file: 'Read', write_file: 'Write',
  list_directory: 'List files', email: 'Email', calendar: 'Calendar',
  agent_calendar: 'Calendar', slack: 'Slack', telegram: 'Telegram', memory: 'Knowledge',
  spawn_agent: 'Spawn', composio: 'Integration', desktop: 'Desktop',
  document_guide: 'Doc guide', view_image: 'View image',
};

function formatTool(tool: string): string {
  return TOOL_LABELS[tool] || tool.replace(/_/g, ' ');
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return '$0.00';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtTime(ms: number): string {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type CurrentUsage = api.CurrentUsage;

const EMPTY_HISTORY: Array<{ tool: string; timestamp: number }> = [];

// ── Widget ───────────────────────────────────────────────────────────────────

export function StatusWidget() {
  const { containerStyle, containerProps } = useDraggableWidget('status', 'tr');
  const { className: dragClassName, ...dragProps } = containerProps;
  const userPlan = useAuthStore((s) => s.user?.plan);
  const agentDisplayName = useComputerStore(
    (s) => s.computer?.config?.identityName?.trim() || 'Construct',
  );

  // Agent status — only the session the user is viewing (not background scheduled runs).
  const connected = useComputerStore((s) => s.agentConnected);
  const running = useComputerStore((s) => s.runningSessions.has(s.activeSessionKey));
  const thinking = useComputerStore((s) => s.agentThinking);
  const toolHistoryJson = useComputerStore((s) => {
    if (!s.runningSessions.has(s.activeSessionKey)) return '';
    const h = s.platformAgents?.desktop?.toolHistory?.filter(
      (entry) => !entry.sessionKey || entry.sessionKey === s.activeSessionKey,
    );
    if (!h || h.length === 0) return '';
    return JSON.stringify(h.slice(-6));
  });

  const recentTools = useMemo(() => {
    if (!toolHistoryJson) return EMPTY_HISTORY;
    try {
      const h = JSON.parse(toolHistoryJson) as Array<{ tool: string; timestamp: number; sessionKey?: string }>;
      return h.reverse().reduce<Array<{ tool: string; timestamp: number }>>((acc, t) => {
        if (acc.length < 3 && !acc.some((a) => a.tool === t.tool && Math.abs(a.timestamp - t.timestamp) < 2000)) {
          acc.push(t);
        }
        return acc;
      }, []);
    } catch { return EMPTY_HISTORY; }
  }, [toolHistoryJson]);

  const statusText = !connected
    ? 'Offline'
    : running
      ? (thinking && thinking.length < 30 ? thinking : 'Working…')
      : 'Idle';

  // Usage stats
  const [usage, setUsage] = useState<CurrentUsage | null>(null);
  const [storage, setStorage] = useState<{ bytesUsed: number; maxBytes: number } | null>(null);

  const fetchBillingUsage = useBillingStore(s => s.fetchUsage);
  const fetchByok = useBillingStore(s => s.fetchByok);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const r = await api.getCurrentUsage();
      if (!cancelled && r.success && r.data) setUsage(r.data);
      // Keep billingStore in sync so other surfaces read the same data.
      void fetchBillingUsage();
    };
    poll();
    void fetchByok();
    const iv = setInterval(poll, USAGE_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [fetchBillingUsage, fetchByok]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const r = await api.getStorageUsage();
      if (!cancelled && r.success && r.data) setStorage(r.data);
    };
    poll();
    const iv = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const monthlyPct = usage?.monthlyPercentUsed ?? 0;
  const weeklyPct = usage?.weeklyPercentUsed ?? 0;
  const sessionPct = usage?.sessionPercentUsed ?? 0;
  const monthlyResetsIn = usage?.monthlyResetsAt ? fmtTime(new Date(usage.monthlyResetsAt).getTime() - Date.now()) : null;
  const weeklyResetsIn = usage?.weeklyResetsAt ? fmtTime(new Date(usage.weeklyResetsAt).getTime() - Date.now()) : null;
  const sessionResetsIn = usage?.sessionResetsAt
    ? fmtTime(new Date(usage.sessionResetsAt).getTime() - Date.now())
    : null;
  const hasMonthlyUsd = usage?.monthlyUsedUsd !== undefined && usage?.monthlyCapUsd !== undefined && usage.monthlyCapUsd > 0;
  const hasWeeklyUsd = usage?.weeklyUsedUsd !== undefined && usage?.weeklyCapUsd !== undefined && usage.weeklyCapUsd > 0;
  const hasSessionUsd = usage?.sessionUsedUsd !== undefined && usage?.sessionCapUsd !== undefined && usage.sessionCapUsd > 0;

  // Provider-state drives the label + accent colors + CTA below.
  const provider = useBillingStore(useShallow((s) => s.getEffectiveProvider()));
  const byokSettings = useBillingStore(s => s.byok);
  const copy = providerCopy(provider);
  const providerAccent = copy.tone === 'neutral'
    ? (Math.max(monthlyPct, weeklyPct, sessionPct) < 60 ? '#22d3ee' : Math.max(monthlyPct, weeklyPct, sessionPct) < 85 ? '#fbbf24' : '#f87171')
    : TONE_HEX[copy.tone];
  const accent = providerAccent;

  const isByok = provider.kind === 'byok-fallback' || provider.kind === 'byok-exclusive';
  const isBlocked = provider.kind === 'blocked-no-key' || provider.kind === 'blocked-byok-cap';

  // Use BYOK cap as the primary metric when on BYOK — platform weekly bar
  // would read 100% (that's why we fell back) which is visually misleading.
  const byokCap = byokSettings?.weeklyLimitUsd ?? null;
  const byokUsed = usage?.weeklyUsedUsd ?? 0; // backend reports combined; close enough for a widget glance.
  const byokPct = byokCap && byokCap > 0 ? Math.min(100, (byokUsed / byokCap) * 100) : 0;

  const openCtaTarget = () => {
    if (!copy.cta) return;
    openSettingsToSection('billing');
  };

  return (
    <div style={containerStyle} {...dragProps} className={`flex w-[300px] flex-col items-center ${dragClassName || ''}`}>
      <div
        className="px-5 py-4 rounded-2xl w-full glass-window border border-black/10 dark:border-white/10 shadow-[var(--shadow-window)]"
      >
      {/* ── Agent status ── */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="min-w-0 truncate text-[13px] font-semibold"
          style={{ color: 'rgba(255,255,255,0.82)' }}
          title={agentDisplayName}
        >
          {agentDisplayName}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${running ? 'animate-pulse' : ''}`}
          style={{
            color: running ? '#22d3ee' : connected ? 'rgba(255,255,255,0.65)' : '#f87171',
            background: running
              ? 'rgba(34,211,238,0.12)'
              : connected
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(248,113,113,0.12)',
          }}
        >
          {statusText}
        </span>
      </div>

      {/* Recent tools */}
      {recentTools.length > 0 && (
        <div className="mt-1.5">
          {recentTools.map((t, i) => (
            <div key={`${t.tool}-${t.timestamp}`} className="flex justify-between items-baseline">
              <span
                className="text-[10px] truncate"
                style={{ color: `rgba(255,255,255,${0.4 - i * 0.08})` }}
              >
                {formatTool(t.tool)}
              </span>
              <span className="text-[9px] tabular-nums ml-2 shrink-0" style={{ color: 'rgba(255,255,255,0.12)' }}>
                {timeAgo(t.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Divider ── */}
      <div className="my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

      {/* ── Primary usage bar (platform weekly OR BYOK cap OR block CTA) ── */}
      {usage && (
        <>
          <div className="flex items-baseline justify-between gap-2 mt-2">
            <span
              className="text-[11px] font-semibold tracking-wide shrink-0"
              style={{ color: (isBlocked || isByok) ? accent : (monthlyPct >= 100 ? accent : 'rgba(255,255,255,0.35)') }}
            >
              {copy.widgetLabel}
            </span>
            <span
              className="text-[12px] font-medium tabular-nums whitespace-nowrap"
              style={{ color: (isBlocked || isByok) ? accent : (monthlyPct >= 100 ? accent : 'rgba(255,255,255,0.6)') }}
            >
              {isByok && byokCap
                ? `${fmtCost(byokUsed)} / ${fmtCost(byokCap)}`
                : isByok
                  ? 'no cap'
                  : hasMonthlyUsd
                    ? `${fmtCost(usage!.monthlyUsedUsd!)} / ${fmtCost(usage!.monthlyCapUsd!)}`
                    : `${Math.min(monthlyPct, 100).toFixed(0)}%`}
            </span>
          </div>
          <div className="h-[2px] rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${(isBlocked || monthlyPct >= 100) ? 'animate-pulse' : ''}`}
              style={{
                width: `${Math.max(1, Math.min(100, isByok && byokCap ? byokPct : (isBlocked ? 100 : monthlyPct)))}%`,
                background: accent,
                boxShadow: `0 0 6px ${accent}66`,
              }}
            />
          </div>

          {/* Contextual subline: resets, BYOK note, or blocked CTA. */}
          {isBlocked ? (
            <button
              type="button"
              onClick={openCtaTarget}
              className="mt-1 w-full text-left text-[10px] rounded px-1 py-0.5 transition-colors"
              style={{ color: accent, background: 'rgba(248,113,113,0.08)' }}
            >
              {copy.cta?.label ?? 'Open settings'} →
            </button>
          ) : isByok ? (
            <div className="text-[10px] mt-0.5" style={{ color: accent }}>
              {provider.kind === 'byok-fallback' ? `platform resets ${weeklyResetsIn ?? 'soon'}` : 'your key'}
            </div>
          ) : monthlyResetsIn && monthlyPct > 0 ? (
            <div className="text-[10px] tabular-nums mt-0.5 text-right" style={{ color: 'rgba(255,255,255,0.15)' }}>
              monthly resets {monthlyResetsIn}
            </div>
          ) : null}

          {/* Weekly bar — hidden when on BYOK or blocked. */}
          {!isByok && !isBlocked && weeklyPct > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-2 mt-1.5">
                <span className="text-[10px] tracking-wide shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  weekly
                </span>
                <span className="text-[11px] font-medium tabular-nums whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {hasWeeklyUsd
                    ? `${fmtCost(usage!.weeklyUsedUsd!)} / ${fmtCost(usage!.weeklyCapUsd!)}`
                    : `${Math.min(weeklyPct, 100).toFixed(0)}%`}
                </span>
              </div>
              <div className="h-[2px] rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(1, Math.min(100, weeklyPct))}%`, background: 'rgba(255,255,255,0.35)' }}
                />
              </div>
              {weeklyResetsIn && (
                <div className="text-[9px] tabular-nums mt-0.5 text-right" style={{ color: 'rgba(255,255,255,0.12)' }}>
                  resets {weeklyResetsIn}
                </div>
              )}
            </>
          )}

          {/* Session usage bar — hidden when on BYOK (platform session cap irrelevant) or blocked. */}
          {!isByok && !isBlocked && sessionPct > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-2 mt-1.5">
                <span className="text-[10px] tracking-wide shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  session
                </span>
                <span className="text-[11px] font-medium tabular-nums whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {hasSessionUsd
                    ? `${fmtCost(usage!.sessionUsedUsd!)} / ${fmtCost(usage!.sessionCapUsd!)}`
                    : `${Math.min(sessionPct, 100).toFixed(0)}%`}
                </span>
              </div>
              <div className="h-[2px] rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(1, Math.min(100, sessionPct))}%`, background: 'rgba(255,255,255,0.35)' }}
                />
              </div>
              {sessionResetsIn && (
                <div className="text-[9px] tabular-nums mt-0.5 text-right" style={{ color: 'rgba(255,255,255,0.12)' }}>
                  resets {sessionResetsIn}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Storage ── */}
      {storage && (
        <>
          <div className="flex items-baseline justify-between gap-2 mt-2">
            <span className="text-[11px] font-semibold tracking-wide shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Storage
            </span>
            <span className="text-[12px] font-medium tabular-nums whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {fmtBytes(storage.bytesUsed)} / {fmtBytes(storage.maxBytes)}
            </span>
          </div>
          <div className="h-[2px] rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(1, Math.min(100, (storage.bytesUsed / storage.maxBytes) * 100))}%`,
                background: storage.bytesUsed / storage.maxBytes > 0.9 ? '#f87171' : '#22d3ee',
                boxShadow: `0 0 6px ${storage.bytesUsed / storage.maxBytes > 0.9 ? '#f8717166' : '#22d3ee66'}`,
              }}
            />
          </div>
        </>
      )}
      </div>
    </div>
  );
}
