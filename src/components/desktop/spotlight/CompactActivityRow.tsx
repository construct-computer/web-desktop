import { Loader2, Check } from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';
import { enrichActivityIconFields } from '@/lib/toolActivityIcon';
import { ActivityIconBadge } from './ActivityIconBadge';
import { formatRepeatBadge } from './browserActivityUtils';
import { formatActivityLine } from './formatActivityLine';
import { CachedToolOutputLink } from './CachedToolOutputLink';

function middleEllipsis(text: string, max = 42): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function CompactActivityRow({
  content,
  activityType,
  tool,
  iconPlatform,
  iconUrl,
  failed,
  duration,
  activityStatus,
  repeatCount,
  dense,
  clippy,
  className = '',
  toolCallId,
}: {
  content: string;
  activityType?: ChatMessage['activityType'];
  tool?: string;
  iconPlatform?: string;
  iconUrl?: string;
  failed?: boolean;
  duration?: string;
  activityStatus?: ChatMessage['activityStatus'];
  repeatCount?: number;
  dense?: boolean;
  clippy?: boolean;
  className?: string;
  toolCallId?: string;
}) {
  const line = formatActivityLine(content, { activityType });
  const isTerminal = activityType === 'terminal' || tool === 'terminal' || tool === 'exec';
  const displayLine = isTerminal && clippy ? middleEllipsis(line) : line;
  const iconFields = enrichActivityIconFields({
    tool,
    activityType,
    label: content,
    iconPlatform,
    iconUrl,
  });

  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className={`flex min-w-0 items-center gap-1.5 rounded-md px-0.5 ${dense ? 'py-[1px]' : 'py-[2px]'}`}
      >
      <ActivityIconBadge
        type={iconFields.activityType ?? activityType}
        tool={iconFields.tool ?? tool}
        label={content}
        iconPlatform={iconFields.iconPlatform ?? iconPlatform}
        iconUrl={iconFields.iconUrl ?? iconUrl}
        failed={failed}
        size="sm"
        surface={clippy ? 'clippy' : 'spotlight'}
      />
      <span
        className={`min-w-0 flex-1 truncate leading-snug ${
          clippy ? 'text-[11px]' : 'text-[12px]'
        } ${isTerminal ? 'font-mono' : ''} ${failed ? 'text-red-200/90' : 'text-white/90'}`}
        title={content}
      >
        {displayLine}
      </span>
      {activityStatus === 'running' && !failed && (
        <Loader2 className="w-3 h-3 shrink-0 animate-spin text-[var(--color-accent)]/60" />
      )}
      {activityStatus === 'completed' && !failed && (
        <Check className="w-3 h-3 shrink-0 text-emerald-400/50" />
      )}
      {repeatCount && repeatCount > 1 && (
        <span
          className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] text-[var(--color-text-muted)]/50"
          title={repeatCount > 3 ? `${repeatCount} similar steps` : undefined}
        >
          {formatRepeatBadge(repeatCount)}
        </span>
      )}
      {duration && (
        <span className="shrink-0 text-[10px] tabular-nums text-white/40">{duration}</span>
      )}
      </div>
      <CachedToolOutputLink toolCallId={toolCallId} content={content} />
    </div>
  );
}
