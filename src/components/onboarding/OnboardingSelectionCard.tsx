import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingSelectionCardProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  description?: string;
  icon?: LucideIcon;
  layout?: 'horizontal' | 'stacked';
  className?: string;
}

export function OnboardingSelectionCard({
  selected,
  onClick,
  label,
  description,
  icon: Icon,
  layout = 'horizontal',
  className,
}: OnboardingSelectionCardProps) {
  const stacked = layout === 'stacked';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-xl border min-h-[44px]',
        stacked ? 'p-3 text-center' : 'p-4 text-left',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:border-white/25 hover:bg-white/[0.04]',
        selected
          ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10'
          : 'border-white/10 bg-white/[0.03]',
        className,
      )}
    >
      {selected && (
        <Check className={cn(
          'absolute w-4 h-4 text-[var(--color-accent)]',
          stacked ? 'top-2 right-2' : 'top-3 right-3',
        )} />
      )}
      {stacked ? (
        <div className="flex flex-col items-center gap-2">
          {Icon && (
            <div className="rounded-lg bg-white/5 p-2 shrink-0">
              <Icon className="w-4 h-4 text-[var(--color-text-muted)]" />
            </div>
          )}
          <div className="min-w-0 w-full">
            <div className="text-sm font-medium text-[var(--color-text)]">{label}</div>
            {description && (
              <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{description}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 pr-5">
          {Icon && (
            <div className="mt-0.5 rounded-lg bg-white/5 p-2 shrink-0">
              <Icon className="w-4 h-4 text-[var(--color-text-muted)]" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--color-text)]">{label}</div>
            {description && (
              <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{description}</div>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
