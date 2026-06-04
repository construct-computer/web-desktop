import type { ChatMessage } from '@/stores/agentStore';
import { ActivityIcon } from './ActivityIcon';
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
  dense,
  bare,
  className = '',
}: {
  content: string;
  activityType?: ChatMessage['activityType'];
  tool?: string;
  iconPlatform?: string;
  iconUrl?: string;
  failed?: boolean;
  duration?: string;
  dense?: boolean;
  /** Icon only — no badge frame (e.g. Clippy bubble on gradient). */
  bare?: boolean;
  className?: string;
}) {
  const line = formatActivityLine(content, { activityType });
  const isTerminal = activityType === 'terminal';

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 rounded-md px-0.5 ${dense ? 'py-[1px]' : 'py-[2px]'} ${className}`}
    >
      {bare ? (
        <ActivityIcon
          type={activityType}
          tool={tool}
          label={content}
          iconPlatform={iconPlatform}
          iconUrl={iconUrl}
          className={`h-3.5 w-3.5 shrink-0 ${failed ? 'text-red-200' : 'text-white/90'}`}
        />
      ) : (
        <ActivityIconBadge
          type={activityType}
          tool={tool}
          label={content}
          iconPlatform={iconPlatform}
          iconUrl={iconUrl}
          failed={failed}
          size="sm"
        />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-[11px] leading-tight ${
          isTerminal ? 'font-mono' : ''
        } ${failed ? 'text-red-300/75' : bare ? 'text-white/90' : 'text-white/[0.72]'}`}
        title={content}
      >
        {line}
      </span>
      {duration && (
        <span className="shrink-0 text-[9px] tabular-nums text-white/25">{duration}</span>
      )}
    </div>
  );
}
