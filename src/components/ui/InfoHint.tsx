import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip } from './tooltip';
import { cn } from '@/lib/utils';

interface InfoHintProps {
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function InfoHint({ children, side = 'top', className }: InfoHintProps) {
  return (
    <Tooltip
      content={<span className="block max-w-[240px] text-left leading-relaxed whitespace-normal">{children}</span>}
      side={side}
      delay={180}
      className="max-w-[260px] whitespace-normal"
    >
      <button
        type="button"
        className={cn(
          'inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-text-muted)]/70 transition-colors hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/45',
          className,
        )}
        aria-label="More information"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
