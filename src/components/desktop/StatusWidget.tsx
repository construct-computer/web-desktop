/**
 * StatusWidget — unified agent status + usage stats widget.
 * Combines agent connection state, recent tool activity, and token/cost metrics
 * into a single draggable desktop widget.
 */

import { useEffect, useMemo, useState } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useDraggableWidget } from '@/hooks/useDraggableWidget';
import * as api from '@/services/api';
import { USAGE_POLL_INTERVAL_MS } from '@/lib/config';
import { openSettingsToSection } from '@/lib/settingsNav';
import buyIcon from '@/icons/buy.png';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  terminal: 'Terminal', sandbox_write_file: 'Write file', sandbox_read_file: 'Read file',
  save_to_workspace: 'Save', load_from_workspace: 'Load', browser: 'Browser',
  web_search: 'Search', remote_browser: 'Browse', read_file: 'Read', write_file: 'Write',
  list_directory: 'List files', email: 'Email', calendar: 'Calendar',
  agent_calendar: 'Calendar', slack: 'Slack', telegram: 'Telegram', memory: 'Memory',
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

function fmt(n: number): string {
  if (n < 1000) return n.toFixed(0);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
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

interface UsageWindow {
  weeklyPercentUsed: number;
  windowPercentUsed: number;
  weeklyResetsAt: string;
  windowResetsAt: string;
  plan?: string;
  allowed: boolean;
  shouldDowngrade: boolean;
  environment?: string;
  // Staging-only
  weeklyUsedUsd?: number;
  weeklyCapUsd?: number;
  windowUsedUsd?: number;
  windowCapUsd?: number;
  // Legacy aliases
  percentUsed?: number;
  resetsAt?: string;
  promptTokens?: number;
  completionTokens?: number;
  requestCount?: number;
  totalCostUsd?: number;
  costCapUsd?: number;
}

const EMPTY_HISTORY: Array<{ tool: string; timestamp: number }> = [];

// ── Widget ───────────────────────────────────────────────────────────────────

export function StatusWidget() {
  const { containerStyle, containerProps } = useDraggableWidget('status', 'tr');
  const userPlan = useAuthStore((s) => s.user?.plan);

  // Agent status
  const connected = useComputerStore((s) => s.agentConnected);
  const running = useComputerStore((s) => s.agentRunning);
  const thinking = useComputerStore((s) => s.agentThinking);
  const toolHistoryJson = useComputerStore((s) => {
    const h = s.platformAgents?.desktop?.toolHistory;
    if (!h || h.length === 0) return '';
    return JSON.stringify(h.slice(-6));
  });

  const recentTools = useMemo(() => {
    if (!toolHistoryJson) return EMPTY_HISTORY;
    try {
      const h = JSON.parse(toolHistoryJson) as Array<{ tool: string; timestamp: number }>;
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

  const dotColor = running ? '#4ade80' : connected ? 'rgba(255,255,255,0.25)' : '#f87171';

  // Usage stats
  const [usage, setUsage] = useState<UsageWindow | null>(null);
  const [storage, setStorage] = useState<{ bytesUsed: number; maxBytes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const r = await api.getCurrentUsage();
      if (!cancelled && r.success && r.data) setUsage(r.data as unknown as UsageWindow);
    };
    poll();
    const iv = setInterval(poll, USAGE_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // Daily quotas removed — all tiers use percentage-based usage now
  const starterQuotas = null;
  const bonusMessages = 0;

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

  const pct = usage?.weeklyPercentUsed ?? usage?.percentUsed ?? 0;
  const isStaging = usage?.environment === 'staging';
  const resetSource = usage?.weeklyResetsAt || usage?.resetsAt;
  const resetsIn = resetSource ? fmtTime(new Date(resetSource).getTime() - Date.now()) : null;
  const accent = pct < 60 ? '#22d3ee' : pct < 85 ? '#fbbf24' : '#f87171';
  const total = (usage?.promptTokens || 0) + (usage?.completionTokens || 0);

  return (
    <div style={containerStyle} {...containerProps} className="flex flex-col items-center">
      <div
        className="px-5 py-4 rounded-2xl w-full"
        style={{
          maskImage: 'radial-gradient(ellipse 85% 75% at center, black 55%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 75% at center, black 55%, transparent 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, transparent 80%)',
        }}
      >
      {/* ── Agent status ── */}
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Agent
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-[6px] h-[6px] rounded-full ${running ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-[13px] font-medium truncate max-w-[120px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {statusText}
          </span>
        </div>
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

      {/* ── Usage stats (staging only) ── */}
      {isStaging && (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Tokens
            </span>
            <span className="text-[14px] font-medium tabular-nums" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {fmt(total)}
            </span>
          </div>
          <div className="flex justify-between mt-px text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,0.2)' }}>
            <span>▲ {fmt(usage?.promptTokens || 0)}</span>
            <span>▼ {fmt(usage?.completionTokens || 0)}</span>
            {usage?.totalCostUsd != null && <span>{fmtCost(usage.totalCostUsd)}</span>}
          </div>
        </>
      )}

      {/* ── Weekly usage bar ── */}
      {usage && (
        <>
          <div className="flex items-baseline justify-between gap-2 mt-2">
            <span className="text-[11px] font-semibold tracking-wide shrink-0" style={{ color: pct >= 100 ? accent : 'rgba(255,255,255,0.35)' }}>
              {pct >= 100 ? 'Limit reached' : 'Usage'}
            </span>
            <span className="text-[12px] font-medium tabular-nums whitespace-nowrap" style={{ color: pct >= 100 ? accent : 'rgba(255,255,255,0.6)' }}>
              {isStaging && usage.weeklyCapUsd && usage.weeklyCapUsd > 0
                ? `${fmtCost(usage.weeklyUsedUsd || 0)} / ${fmtCost(usage.weeklyCapUsd)}`
                : `${Math.min(pct, 100).toFixed(0)}%`}
            </span>
          </div>
          <div className="h-[2px] rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${pct >= 100 ? 'animate-pulse' : ''}`}
              style={{ width: `${Math.max(1, Math.min(100, pct))}%`, background: accent, boxShadow: `0 0 6px ${accent}66` }}
            />
          </div>
          {resetsIn && pct > 0 && (
            <div className="text-[10px] tabular-nums mt-0.5 text-right" style={{ color: 'rgba(255,255,255,0.15)' }}>
              resets {resetsIn}
            </div>
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

      {/* Get Premium shortcut — free plan only */}
      {userPlan === 'free' && (
        <button
          onClick={() => openSettingsToSection('subscription')}
          className="flex flex-col items-center gap-1 mt-2 group cursor-pointer self-center"
        >
          <img
            src={buyIcon}
            alt="Get Premium"
            className="w-12 h-12 drop-shadow-lg group-hover:scale-110 transition-transform duration-150"
            draggable={false}
          />
          <span className="text-[10px] font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Get Premium
          </span>
        </button>
      )}
    </div>
  );
}
