import type { ChatMessage } from '@/stores/agentStore';
import { isBrandedActivityVisual, resolveActivityVisual } from '@/lib/toolActivityIcon';
import type { ActivityTone } from './activityStyles';
import { ActivityIcon } from './ActivityIcon';
import { ActivityIconFrame } from './ActivityIconFrame';

export function ActivityIconBadge({
  type,
  tone,
  tool,
  label,
  iconPlatform,
  iconUrl,
  failed,
  size = 'md',
}: {
  type?: ChatMessage['activityType'];
  tone?: ActivityTone;
  tool?: string;
  label?: string;
  iconPlatform?: string;
  iconUrl?: string;
  failed?: boolean;
  size?: 'sm' | 'md';
}) {
  const visual = resolveActivityVisual({ type, tool, label, iconPlatform, iconUrl });
  const branded = isBrandedActivityVisual(visual);
  const variant = failed || tone === 'error' || tone === 'warn' ? 'failed' : 'default';
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <ActivityIconFrame variant={variant} size={size}>
      <ActivityIcon
        type={type}
        tone={tone}
        tool={tool}
        label={label}
        iconPlatform={iconPlatform}
        iconUrl={iconUrl}
        className={iconClass}
        fill={branded}
      />
    </ActivityIconFrame>
  );
}
