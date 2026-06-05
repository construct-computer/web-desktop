import { Loader2, Check } from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';
import { ActivityIconBadge } from './ActivityIconBadge';
import { formatActivityLine } from './formatActivityLine';

export function CompactActivityRow({
  content,
  activityType,
  tool,
  iconPlatform,
  iconUrl,
  failed,
  duration,
  activityStatus,
  dense,
  className = '',
}: {
  content: string;
  activityType?: ChatMessage['activityType'];
  tool?: string;
  iconPlatform?: string;
  iconUrl?: string;
  failed?: boolean;
  duration?: string;
  activityStatus?: ChatMessage['activityStatus'];
  dense?: boolean;
  className?: string;
}) {
  const line = formatActivityLine(content, { activityType });
  const isTerminal = activityType === 'terminal';

  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-md px-0.5 ${dense ? 'py-[1px]' : 'py-[2px]'} ${className}`}
    >
      <ActivityIconBadge
        type={activityType}
        tool={tool}
        label={content}
        iconPlatform={iconPlatform}
        iconUrl={iconUrl}
        failed={failed}
        size="sm"
        surface="clippy"
      />
      <span
        className={`min-w-0 flex-1 truncate text-[12px] leading-snug ${
          isTerminal ? 'font-mono' : ''
        } ${failed ? 'text-red-200/90' : 'text-white/90'}`}
        title={content}
      >
        {line}
      </span>
      {activityStatus === 'running' && !failed && (
        <Loader2 className="w-3 h-3 shrink-0 animate-spin text-[var(--color-accent)]/60" />
      )}
      {activityStatus === 'completed' && !failed && (
        <Check className="w-3 h-3 shrink-0 text-emerald-400/50" />
      )}
      {duration && (
        <span className="shrink-0 text-[10px] tabular-nums text-white/40">{duration}</span>
      )}
    </div>
  );
}
