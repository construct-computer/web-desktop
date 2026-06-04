import type { AutopilotWorkOrderSnapshot } from '@/services/api';

export const ACTIVE_WORK_ORDER_STATUSES = new Set(['active', 'waiting', 'blocked']);
export const TERMINAL_WORK_ORDER_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export function formatTool(tool: string | null | undefined): string | null {
  if (!tool) return null;
  return tool.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusLabel(status: string): string {
  return status.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAge(ts: number | null | undefined): string {
  if (!ts) return 'just now';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatScheduleDue(value: string | null | undefined): string {
  if (!value) return 'no next run';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return 'scheduled';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const prefix = diff >= 0 ? 'in ' : 'due ';
  if (abs < 60_000) return diff >= 0 ? 'soon' : 'due now';
  if (abs < 60 * 60_000) return `${prefix}${Math.round(abs / 60_000)}m`;
  if (abs < 24 * 60 * 60_000) return `${prefix}${Math.round(abs / 60 / 60_000)}h`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'scheduled_task': return 'Scheduled';
    case 'external_platform': return 'External';
    case 'autopilot': return 'Autopilot';
    case 'recovery': return 'Recovery';
    default: return 'Chat';
  }
}

export function statusTone(status: string): string {
  if (status === 'blocked') return 'text-amber-600 dark:text-amber-300 bg-amber-500/15';
  if (status === 'failed') return 'text-red-600 dark:text-red-300 bg-red-500/15';
  if (status === 'completed') return 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/15';
  if (status === 'waiting') return 'text-slate-600 dark:text-slate-300 bg-slate-500/15';
  return 'text-blue-600 dark:text-blue-300 bg-blue-500/15';
}

/** Short list subtitle — never full blocker text or redundant terminal labels. */
export function listRowSubtitle(
  task: Pick<AutopilotWorkOrderSnapshot, 'status' | 'activityHint' | 'blockerReason' | 'updatedAt'> & { stalled?: boolean },
): string | null {
  if (TERMINAL_WORK_ORDER_STATUSES.has(task.status)) {
    return formatAge(task.updatedAt);
  }
  if (task.status === 'blocked') return 'Blocked';
  if (task.stalled) return 'May be stuck';
  const hint = task.activityHint?.trim();
  if (!hint || hint === 'Working' || hint === 'Waiting') return hint || null;
  if (task.blockerReason && (hint === task.blockerReason || hint.includes(task.blockerReason.slice(0, 40)))) {
    return 'Blocked';
  }
  if (hint.length > 48) return `${hint.slice(0, 45)}…`;
  return hint;
}

export function summarizeJsonContent(content: string): { summary: string; isJson: boolean; raw: string } {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { summary: content, isJson: false, raw: content };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return { summary: `Array (${parsed.length} items)`, isJson: true, raw: trimmed };
    }
    if (parsed && typeof parsed === 'object') {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length === 0) return { summary: 'Empty object', isJson: true, raw: trimmed };
      const preview = keys.slice(0, 4).join(', ');
      const more = keys.length > 4 ? ` +${keys.length - 4}` : '';
      return { summary: `{ ${preview}${more} }`, isJson: true, raw: trimmed };
    }
  } catch {
    /* not valid json */
  }
  return { summary: content.length > 80 ? `${content.slice(0, 77)}…` : content, isJson: false, raw: content };
}

export type AttentionKind = 'blocked' | 'stalled' | 'failed';

export function getAttentionKind(
  wo: { status: string; blockerReason?: string | null; stalled?: boolean },
): AttentionKind | null {
  if (wo.status === 'blocked' && wo.blockerReason) return 'blocked';
  if (wo.status === 'failed') return 'failed';
  if (wo.stalled && wo.status !== 'blocked') return 'stalled';
  return null;
}
