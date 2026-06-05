import type { ChatMessage } from '@/stores/agentStore';
import { isBrandedActivityVisual, resolveActivityVisual } from '@/lib/toolActivityIcon';
import type { ActivityTone } from './activityStyles';
import { ActivityIcon } from './ActivityIcon';
import { ActivityIconFrame, type ActivityIconFrameVariant } from './ActivityIconFrame';

export function ActivityIconBadge({
  type,
  tone,
  tool,
  label,
  iconPlatform,
  iconUrl,
  failed,
  size = 'md',
  surface = 'spotlight',
}: {
  type?: ChatMessage['activityType'];
  tone?: ActivityTone;
  tool?: string;
  label?: string;
  iconPlatform?: string;
  iconUrl?: string;
  failed?: boolean;
  size?: 'sm' | 'md';
  surface?: 'spotlight' | 'clippy';
}) {
  const visual = resolveActivityVisual({ type, tool, label, iconPlatform, iconUrl });
  const branded = isBrandedActivityVisual(visual);
  let frameVariant: ActivityIconFrameVariant = 'default';
  if (failed || tone === 'error' || tone === 'warn') {
    frameVariant = surface === 'clippy' ? 'clippy' : 'failed';
  } else if (surface === 'clippy') {
    frameVariant = 'clippy';
  }
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <ActivityIconFrame variant={frameVariant} size={size}>
      <ActivityIcon
        type={type}
        tone={surface === 'clippy' ? undefined : tone}
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
