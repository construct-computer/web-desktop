/**
 * BrowserActivityRow — type-aware renderer for a single browser-use action
 * inside the agent's "Worked for X" timeline.
 *
 * Picks an icon + color from the action type, formats URLs/host for nav events,
 * shows wait durations inline, exposes payload as a click-to-reveal disclosure,
 * and renders semicolon-joined "x; y; z" compounds as nested sub-bullets.
 */

import { useState } from 'react';
import {
  Globe, Code2, Timer, Search, Download, MousePointerClick, Keyboard,
  Compass, Camera, ChevronRight, ChevronDown, Sparkles,
} from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';

interface BrowserStyle {
  icon: typeof Globe;
  color: string;
}

const BROWSER_STYLES: Record<string, BrowserStyle> = {
  navigate: { icon: Globe, color: 'text-cyan-400 bg-cyan-400/10' },
  evaluate: { icon: Code2, color: 'text-amber-400 bg-amber-400/10' },
  wait: { icon: Timer, color: 'text-gray-400 bg-gray-400/10' },
  find_text: { icon: Search, color: 'text-violet-400 bg-violet-400/10' },
  fetch: { icon: Download, color: 'text-emerald-400 bg-emerald-400/10' },
  click: { icon: MousePointerClick, color: 'text-blue-400 bg-blue-400/10' },
  type: { icon: Keyboard, color: 'text-blue-400 bg-blue-400/10' },
  input: { icon: Keyboard, color: 'text-blue-400 bg-blue-400/10' },
  discover_data_sources: { icon: Compass, color: 'text-fuchsia-400 bg-fuchsia-400/10' },
  screenshot: { icon: Camera, color: 'text-pink-400 bg-pink-400/10' },
};

const DEFAULT_STYLE: BrowserStyle = { icon: Sparkles, color: 'text-[var(--color-text-muted)]/60 bg-white/5' };

function styleFor(actionType: string | null | undefined): BrowserStyle {
  if (!actionType) return DEFAULT_STYLE;
  return BROWSER_STYLES[actionType] || DEFAULT_STYLE;
}

/** Strip protocol + trailing slash for compact display. Hover for full URL. */
function compactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.host}${path}`.slice(0, 64);
  } catch {
    return raw.slice(0, 64);
  }
}

function formatWait(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function isExpandablePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const keys = Object.keys(payload);
  if (keys.length === 0) return false;
  // Skip payloads whose only contents we already surfaced inline (url / wait).
  const surfacedOnly = keys.every((k) => k === 'url' || k === 'startUrl' || k === 'duration' || k === 'ms' || k === 'wait');
  return !surfacedOnly;
}

export function BrowserActivityRow({
  message,
  duration,
  repeatCount,
}: {
  message: ChatMessage;
  duration?: string;
  repeatCount?: number;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const meta = message.browserAction;
  const { icon: Icon, color } = styleFor(meta?.actionType);
  const subActions = meta?.subActions || [];
  const url = meta?.url;
  const waitMs = meta?.waitMs;
  const canExpand = isExpandablePayload(meta?.payload);

  return (
    <div className="py-[2px]">
      <div className="flex items-center gap-2.5">
        <div className="relative flex items-center justify-center w-5">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]/20" />
        </div>
        <div className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${color}`}>
          <Icon className="w-3 h-3" />
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[12px] text-[var(--color-text-muted)]/70 truncate">
            {message.content}
          </span>
          {typeof waitMs === 'number' && (
            <span className="text-[10px] text-gray-400/70 tabular-nums shrink-0">
              {formatWait(waitMs)}
            </span>
          )}
          {url && (
            <span
              className="text-[11px] text-cyan-400/60 truncate font-mono shrink min-w-0"
              title={url}
            >
              {compactUrl(url)}
            </span>
          )}
          {repeatCount && repeatCount > 1 && (
            <span className="text-[10px] px-1.5 py-px rounded-full bg-white/[0.06] text-[var(--color-text-muted)]/50 shrink-0">
              ×{repeatCount}
            </span>
          )}
          {canExpand && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowPayload((v) => !v); }}
              className="text-[10px] text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)]/70 shrink-0 flex items-center gap-0.5"
              title="Toggle payload"
            >
              {showPayload ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
              payload
            </button>
          )}
        </div>
        {duration && (
          <span className="text-[10px] text-[var(--color-text-muted)]/25 shrink-0 tabular-nums">
            {duration}
          </span>
        )}
      </div>

      {subActions.length > 0 && (
        <div className="ml-[58px] mt-0.5 space-y-px">
          {subActions.map((s, i) => (
            <div key={i} className="text-[11px] text-[var(--color-text-muted)]/40 truncate">
              ↳ {s}
            </div>
          ))}
        </div>
      )}

      {showPayload && meta?.payload != null && (
        <pre className="ml-[58px] mt-1 mb-1 text-[10px] text-[var(--color-text-muted)]/60 bg-black/30 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono">
          {JSON.stringify(meta.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Collapse consecutive browser activities whose label, action type, and url
 * match. Returns each item with a `repeat` count. Non-browser activities
 * pass through untouched (repeat=1).
 */
export function mergeBrowserRepeats(activities: ChatMessage[]): Array<{ act: ChatMessage; repeat: number }> {
  const out: Array<{ act: ChatMessage; repeat: number }> = [];
  for (const act of activities) {
    const last = out[out.length - 1];
    if (last && canMerge(last.act, act)) {
      last.repeat += 1;
      continue;
    }
    out.push({ act, repeat: 1 });
  }
  return out;
}

function canMerge(a: ChatMessage, b: ChatMessage): boolean {
  if (a.activityType !== 'web' || b.activityType !== 'web') return false;
  if (!a.browserAction || !b.browserAction) return false;
  if (a.content !== b.content) return false;
  if (a.browserAction.actionType !== b.browserAction.actionType) return false;
  if ((a.browserAction.url || '') !== (b.browserAction.url || '')) return false;
  // Don't merge waits with different durations — that loses useful signal.
  if ((a.browserAction.waitMs ?? -1) !== (b.browserAction.waitMs ?? -1)) return false;
  // Don't merge entries with sub-actions: each compound is semantically distinct.
  if ((a.browserAction.subActions?.length || 0) > 0) return false;
  if ((b.browserAction.subActions?.length || 0) > 0) return false;
  return true;
}
