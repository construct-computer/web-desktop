import { cn } from '@/lib/utils';
import type { AnimatedListPhase } from '@/hooks/useAnimatedList';

export function AnimatedListItem({
  phase,
  className,
  children,
  as: Tag = 'div',
}: {
  phase: AnimatedListPhase;
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'li' | 'article';
}) {
  return (
    <Tag
      className={cn(
        phase === 'entering' && 'list-item-enter',
        phase === 'leaving' && 'list-item-leave',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function AnimatedListContainer({
  pending,
  className,
  children,
}: {
  pending?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('list-crossfade', pending && 'list-crossfade-pending', className)}>
      {children}
    </div>
  );
}
