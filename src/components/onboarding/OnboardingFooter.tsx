import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface OnboardingFooterProps {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  canContinue?: boolean;
  hint?: string;
  secondaryAction?: { label: string; onClick: () => void };
  loading?: boolean;
  className?: string;
}

export function OnboardingFooter({
  onBack,
  onContinue,
  continueLabel = 'Continue',
  canContinue = true,
  hint,
  secondaryAction,
  loading,
  className,
}: OnboardingFooterProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3', className)}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            Back
          </Button>
        )}
        {hint && !canContinue && (
          <p
            key={hint}
            className="text-[12px] text-[var(--color-text-muted)] truncate animate-in fade-in duration-200"
          >
            {hint}
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] py-2 px-3 text-center sm:text-left transition-colors"
          >
            {secondaryAction.label}
          </button>
        )}
        <Button
          type="button"
          className="min-h-[44px] sm:min-w-[120px]"
          disabled={!canContinue || loading}
          onClick={onContinue}
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
