import { Input } from '@/components/ui';
import {
  ONBOARDING_GOALS,
  ONBOARDING_ROLES,
  ONBOARDING_WORK_CONTEXTS,
  type OnboardingGoal,
  type OnboardingRole,
  type OnboardingWorkContext,
} from '@/lib/onboarding';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { OnboardingSelectionCard } from './OnboardingSelectionCard';
import { OnboardingStepHeader } from './OnboardingStepHeader';
import { cn } from '@/lib/utils';

const ABOUT_HEADERS = [
  { title: "What's your role?", description: 'This helps Construct tailor how it works with you.' },
  { title: 'What do you want help with?', description: 'Pick up to three — you can change these anytime.' },
  {
    title: 'How do you work?',
    description: 'Your day-to-day context — company and priorities are optional.',
  },
] as const;

export function getAboutSubStepValidation(
  subStep: number,
  profile: { role?: string; goals?: string[]; workContext?: string },
): { canContinue: boolean; hint?: string } {
  switch (subStep) {
    case 0:
      return profile.role
        ? { canContinue: true }
        : { canContinue: false, hint: 'Choose a role' };
    case 1:
      return (profile.goals?.length ?? 0) > 0
        ? { canContinue: true }
        : { canContinue: false, hint: 'Pick at least one goal' };
    case 2:
      return profile.workContext
        ? { canContinue: true }
        : { canContinue: false, hint: 'Choose how you work' };
    default:
      return { canContinue: true };
  }
}

export function OnboardingAboutStep({ subStep }: { subStep: number }) {
  const profile = useOnboardingStore((s) => s.profile);
  const saveProfile = useOnboardingStore((s) => s.saveProfile);
  const goals = profile.goals ?? [];
  const header = ABOUT_HEADERS[subStep] ?? ABOUT_HEADERS[0];

  const toggleGoal = (goal: OnboardingGoal) => {
    const next = goals.includes(goal)
      ? goals.filter((g) => g !== goal)
      : goals.length >= 3 ? goals : [...goals, goal];
    void saveProfile({ goals: next });
  };

  return (
    <>
      <OnboardingStepHeader title={header.title} description={header.description} />

      {subStep === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ONBOARDING_ROLES.map((r) => (
            <OnboardingSelectionCard
              key={r.id}
              selected={profile.role === r.id}
              onClick={() => void saveProfile({ role: r.id as OnboardingRole })}
              label={r.label}
              description={r.description}
              icon={r.icon}
            />
          ))}
        </div>
      )}

      {subStep === 1 && (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--color-text-muted)]">
            {goals.length} of 3 selected
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ONBOARDING_GOALS.map((g) => (
              <OnboardingSelectionCard
                key={g.id}
                selected={goals.includes(g.id)}
                onClick={() => toggleGoal(g.id)}
                label={g.label}
                description={g.description}
                icon={g.icon}
              />
            ))}
          </div>
        </div>
      )}

      {subStep === 2 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ONBOARDING_WORK_CONTEXTS.map((c) => (
              <OnboardingSelectionCard
                key={c.id}
                layout="stacked"
                selected={profile.workContext === c.id}
                onClick={() => void saveProfile({ workContext: c.id as OnboardingWorkContext })}
                label={c.label}
                description={c.description}
                icon={c.icon}
              />
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-muted)]">Company (optional)</label>
            <Input
              value={profile.company ?? ''}
              onChange={(e) => void saveProfile({ company: e.target.value })}
              placeholder="Acme Inc."
              className="text-sm min-h-[44px]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-muted)]">
              Anything else we should know? (optional)
            </label>
            <textarea
              value={profile.freeText ?? ''}
              onChange={(e) => void saveProfile({ freeText: e.target.value })}
              placeholder="e.g. weekly investor updates, inbox triage…"
              rows={4}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-[var(--radius-input)] min-h-[88px]',
                'bg-[var(--color-surface)] text-[var(--color-text)]',
                'border border-[var(--color-border)]',
                'placeholder:text-[var(--color-text-subtle)]',
                'focus:outline-none resize-y',
              )}
            />
          </div>
        </div>
      )}
    </>
  );
}
