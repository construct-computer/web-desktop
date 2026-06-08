/**
 * BrowserActivityRow — compact, single-line renderer for one browser-use action
 * inside the agent's "Worked for X" timeline. Icon + label + optional host +
 * wait duration + repeat badge, matching the density of the other tool rows.
 */

import {
  Globe, Code2, Timer, Search, Download, MousePointerClick, Keyboard,
  Compass, Camera, Sparkles, FileText, StopCircle,
} from 'lucide-react';
import { ACTIVITY_ICON_CLASS } from './activityStyles';
import type { ChatMessage } from '@/stores/agentStore';
import { formatRepeatBadge } from './browserActivityUtils';

interface BrowserStyle {
  icon: typeof Globe;
  color: string;
}

const BROWSER_STYLES: Record<string, BrowserStyle> = {
  navigate: { icon: Globe, color: ACTIVITY_ICON_CLASS },
  evaluate: { icon: Code2, color: ACTIVITY_ICON_CLASS },
  wait: { icon: Timer, color: ACTIVITY_ICON_CLASS },
  find_text: { icon: Search, color: ACTIVITY_ICON_CLASS },
  fetch: { icon: Download, color: ACTIVITY_ICON_CLASS },
  click: { icon: MousePointerClick, color: ACTIVITY_ICON_CLASS },
  type: { icon: Keyboard, color: ACTIVITY_ICON_CLASS },
  input: { icon: Keyboard, color: ACTIVITY_ICON_CLASS },
  discover_data_sources: { icon: Compass, color: ACTIVITY_ICON_CLASS },
  screenshot: { icon: Camera, color: ACTIVITY_ICON_CLASS },
  open: { icon: Globe, color: ACTIVITY_ICON_CLASS },
  task: { icon: Sparkles, color: ACTIVITY_ICON_CLASS },
  read: { icon: FileText, color: ACTIVITY_ICON_CLASS },
  files: { icon: Download, color: ACTIVITY_ICON_CLASS },
  status: { icon: Timer, color: ACTIVITY_ICON_CLASS },
  stop: { icon: StopCircle, color: ACTIVITY_ICON_CLASS },
};

const DEFAULT_STYLE: BrowserStyle = { icon: Sparkles, color: ACTIVITY_ICON_CLASS };

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

export function BrowserActivityRow({
  message,
  duration,
  repeatCount,
}: {
  message: ChatMessage;
  duration?: string;
  repeatCount?: number;
}) {
  const meta = message.browserAction;
  const { icon: Icon, color } = styleFor(meta?.actionType);
  const url = meta?.url;
  const waitMs = meta?.waitMs;

  return (
    <div className="flex items-center gap-2.5 rounded-md px-1 py-[2px] hover:bg-white/[0.025]">
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
          <span
            className="text-[10px] px-1.5 py-px rounded-full bg-white/[0.06] text-[var(--color-text-muted)]/50 shrink-0"
            title={repeatCount > 3 ? `${repeatCount} similar steps` : undefined}
          >
            {formatRepeatBadge(repeatCount)}
          </span>
        )}
      </div>
      {duration && (
        <span className="text-[10px] text-[var(--color-text-muted)]/25 shrink-0 tabular-nums">
          {duration}
        </span>
      )}
    </div>
  );
}
