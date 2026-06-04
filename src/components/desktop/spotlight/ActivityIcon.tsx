import { useState } from 'react';
import type { ChatMessage } from '@/stores/agentStore';
import type { ActivityTone } from './activityStyles';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import {
  AlertCircle,
  Info,
  lucideIconForActivity,
  resolveActivityVisual,
} from '@/lib/toolActivityIcon';

function parseIconSize(className: string, fill?: boolean): number {
  if (fill) return 18;
  if (className.includes('w-2.5') || className.includes('h-2.5')) return 10;
  if (className.includes('calc(100%')) return 18;
  if (className.includes('w-3.5') || className.includes('h-3.5')) return 14;
  if (className.includes('w-4') || className.includes('h-4')) return 16;
  return 12;
}

export function ActivityIcon({
  type,
  tone,
  tool,
  label,
  className,
  iconPlatform,
  iconUrl,
  fill,
}: {
  type?: ChatMessage['activityType'];
  tone?: ActivityTone;
  tool?: string;
  label?: string;
  className?: string;
  iconPlatform?: string;
  iconUrl?: string;
  fill?: boolean;
}) {
  const cls = className || 'w-3 h-3';
  if (tone === 'error' || tone === 'warn') return <AlertCircle className={cls} />;
  if (tone === 'info') return <Info className={cls} />;

  const [imgFailed, setImgFailed] = useState(false);
  const visual = resolveActivityVisual({ type, tool, label, iconPlatform, iconUrl });
  const size = parseIconSize(cls, fill);

  if (visual.kind === 'image') {
    if (!imgFailed) {
      return (
        <img
          src={visual.src}
          alt={visual.alt}
          className={`object-contain shrink-0 ${fill ? 'h-full w-full' : cls}`}
          onError={() => setImgFailed(true)}
        />
      );
    }
    const Fallback = lucideIconForActivity(type, tool, label);
    return <Fallback className={cls} />;
  }

  if (visual.kind === 'platform') {
    return (
      <PlatformIcon
        platform={visual.platform}
        logoUrl={visual.logoUrl}
        size={size}
        className={fill ? 'h-full w-full rounded-[4px] object-contain' : 'rounded-sm shrink-0'}
      />
    );
  }

  const Icon = visual.Icon;
  return <Icon className={cls} />;
}
