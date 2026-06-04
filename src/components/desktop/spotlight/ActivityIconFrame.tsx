import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ActivityIconFrameVariant = 'default' | 'branded' | 'failed';

const FRAME_BASE = 'shrink-0 flex items-center justify-center';

const VARIANT_CLASS: Record<ActivityIconFrameVariant, string> = {
  default: 'text-[var(--color-text-muted)]/70',
  branded: 'text-[var(--color-text-muted)]/70',
  failed: 'text-red-300/90',
};

const SIZE_CLASS = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
} as const;

export function ActivityIconFrame({
  children,
  variant = 'default',
  size = 'md',
  className,
}: {
  children: ReactNode;
  variant?: ActivityIconFrameVariant;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  return (
    <div className={cn(FRAME_BASE, SIZE_CLASS[size], VARIANT_CLASS[variant], className)}>
      {children}
    </div>
  );
}
