/**
 * BrowserActivityRow — compact, single-line renderer for one browser-use action
 * inside the agent's "Worked for X" timeline. Icon + label + optional host +
 * wait duration + repeat badge, matching the density of the other tool rows.
 */

import type { ChatMessage } from '@/stores/agentStore';
import { ActivityIconBadge } from './ActivityIconBadge';
import { formatRepeatBadge } from './browserActivityUtils';

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
  const url = meta?.url;
  const waitMs = meta?.waitMs;
  const activityType = message.activityType === 'web' ? 'web' : 'browser';

  return (
    <div className="flex items-center gap-2.5 rounded-md px-1 py-[2px] hover:bg-white/[0.025]">
      <ActivityIconBadge
        type={activityType}
        tool={message.tool ?? 'browser_navigate'}
        label={message.content}
        size="sm"
      />
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
