import { FirstRunBackdrop } from './FirstRunBackdrop';
import { SetupStep } from './SetupStep';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useAuthStore } from '@/stores/authStore';

interface FirstRunSceneProps {
  exiting?: boolean;
}

export function FirstRunScene({ exiting }: FirstRunSceneProps) {
  const setupCompleted = useAuthStore((s) => s.user?.setupCompleted);

  return (
    <FirstRunBackdrop>
      {!setupCompleted ? (
        <SetupStep />
      ) : (
        <OnboardingWizard exiting={exiting} />
      )}
    </FirstRunBackdrop>
  );
}
