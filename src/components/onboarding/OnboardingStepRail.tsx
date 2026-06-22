import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';

interface StepItem {
  id: string;
  label: string;
  description: string;
}

interface OnboardingStepRailProps {
  steps: readonly StepItem[];
  currentStep: number;
  className?: string;
}

export function OnboardingStepRail({ steps, currentStep, className }: OnboardingStepRailProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    const step = steps[currentStep];
    return (
      <div className={cn('shrink-0 px-4 pt-4 pb-2 border-b border-black/[0.06] dark:border-white/[0.06] md:hidden', className)}>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-1">
          Step {currentStep + 1} of {steps.length}
        </p>
        <p className="text-sm font-semibold text-[var(--color-text)]">{step?.label}</p>
        <div className="flex gap-1.5 mt-2">
          {steps.map((_, i) => (
            <div
              key={steps[i]!.id}
              className={cn(
                'h-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                i <= currentStep ? 'w-8 bg-[var(--color-accent)]' : 'w-4 bg-white/10',
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <nav className={cn('hidden md:flex w-[200px] shrink-0 flex-col gap-1 p-4 border-r border-black/[0.06] dark:border-white/[0.06]', className)}>
      {steps.map((step, i) => {
        const active = i === currentStep;
        const done = i < currentStep;
        return (
          <div
            key={step.id}
            className={cn(
              'rounded-lg px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              active && 'bg-[var(--color-accent)]/10',
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-all duration-300',
                  done ? 'bg-[var(--color-accent)] text-white' : active ? 'border-2 border-[var(--color-accent)] text-[var(--color-accent)]' : 'border border-white/20 text-[var(--color-text-muted)]',
                )}
              >
                {done ? '✓' : i + 1}
              </div>
              <div className="min-w-0">
                <p className={cn('text-[13px] font-medium', active ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]')}>
                  {step.label}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)] truncate">{step.description}</p>
              </div>
            </div>
          </div>
        );
      })}
      <p className="mt-auto pt-4 text-[10px] text-[var(--color-text-muted)] px-1">About 2 minutes</p>
    </nav>
  );
}
