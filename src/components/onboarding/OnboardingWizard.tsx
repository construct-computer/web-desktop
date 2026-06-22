import { useEffect, useState, useCallback } from 'react';
import constructLogo from '@/assets/logo.png';
import { ConstructSetupWindow } from '@/components/boot/ConstructSetupWindow';
import { OnboardingAboutStep, getAboutSubStepValidation } from './OnboardingAboutStep';
import { OnboardingIntegrationsStep } from './OnboardingIntegrationsStep';
import { OnboardingStepRail } from './OnboardingStepRail';
import { OnboardingStepPanel } from './OnboardingStepPanel';
import { OnboardingFooter } from './OnboardingFooter';
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from '@/lib/onboarding';
import {
  ensureComposioCatalogCached,
  refreshOnboardingRecommendations,
} from '@/lib/onboardingRecommendations';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useAppStore } from '@/stores/appStore';
import { trackOnboardingEvent } from '@/services/api';
import { BOOT_EVENTS } from '@/hooks/useBootPhase';

const ABOUT_SUB_STEPS = 3;

interface OnboardingWizardProps {
  onComplete?: () => void;
  exiting?: boolean;
}

export function OnboardingWizard({ onComplete, exiting }: OnboardingWizardProps) {
  const step = useOnboardingStore((s) => s.step);
  const loaded = useOnboardingStore((s) => s.loaded);
  const fetch = useOnboardingStore((s) => s.fetch);
  const setStep = useOnboardingStore((s) => s.setStep);
  const saveProgress = useOnboardingStore((s) => s.saveProgress);
  const complete = useOnboardingStore((s) => s.complete);
  const profile = useOnboardingStore((s) => s.profile);
  const fetchApps = useAppStore((s) => s.fetchApps);
  const [aboutSubStep, setAboutSubStep] = useState(0);
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const [finishing, setFinishing] = useState(false);

  const clampedStep = Math.min(step, ONBOARDING_STEP_COUNT - 1);

  useEffect(() => {
    void fetch();
    void fetchApps();
  }, [fetch, fetchApps]);

  useEffect(() => {
    if (!loaded) return;
    void ensureComposioCatalogCached();
  }, [loaded]);

  useEffect(() => {
    if (!loaded || (profile.goals?.length ?? 0) === 0) return;
    const timer = window.setTimeout(() => {
      void refreshOnboardingRecommendations(profile);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loaded, profile]);

  useEffect(() => {
    if (!loaded) return;
    void trackOnboardingEvent({ event: 'onboarding_step_viewed', step });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    const ok = await complete();
    setFinishing(false);
    if (ok) {
      window.dispatchEvent(new Event(BOOT_EVENTS.onboardingComplete));
      onComplete?.();
    }
  }, [complete, onComplete]);

  const aboutValidation = getAboutSubStepValidation(aboutSubStep, profile);

  const handleContinue = () => {
    setStepDirection(1);
    if (clampedStep === 0) {
      if (aboutSubStep < ABOUT_SUB_STEPS - 1) {
        setAboutSubStep((s) => s + 1);
        return;
      }
      void setStep(1);
      setAboutSubStep(0);
      return;
    }
    void handleFinish();
  };

  const handleBack = () => {
    setStepDirection(-1);
    if (clampedStep === 0 && aboutSubStep > 0) {
      setAboutSubStep((s) => s - 1);
      return;
    }
    if (clampedStep > 0) {
      void setStep(0);
    }
  };

  const handleSkipIntegrations = async () => {
    await saveProgress({ integrationsSkipped: true });
    void handleFinish();
  };

  if (!loaded) {
    return (
      <ConstructSetupWindow title="Personalize Construct" icon={constructLogo} exiting={exiting}>
        <div className="flex-1 flex items-center justify-center p-8 text-sm text-text-muted">
          Loading…
        </div>
      </ConstructSetupWindow>
    );
  }

  const showBack = clampedStep > 0 || aboutSubStep > 0;
  const continueLabel = clampedStep === ONBOARDING_STEP_COUNT - 1 ? 'Finish' : 'Continue';
  const canContinue = clampedStep === 0 ? aboutValidation.canContinue : true;
  const hint = clampedStep === 0 ? aboutValidation.hint : undefined;
  const contentKey = clampedStep === 0 ? `about-${aboutSubStep}` : 'integrations';

  return (
    <ConstructSetupWindow
      title="Personalize Construct"
      icon={constructLogo}
      exiting={exiting}
      footer={
        <OnboardingFooter
          onBack={showBack ? handleBack : undefined}
          onContinue={() => void handleContinue()}
          continueLabel={continueLabel}
          canContinue={canContinue && !finishing}
          hint={hint}
          loading={finishing}
          secondaryAction={
            clampedStep === 1
              ? { label: 'Skip for now', onClick: () => void handleSkipIntegrations() }
              : undefined
          }
        />
      }
    >
      <OnboardingStepRail steps={ONBOARDING_STEPS} currentStep={clampedStep} />
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 md:px-8 md:py-6 md:pl-5">
        <OnboardingStepPanel stepKey={contentKey} direction={stepDirection}>
          {clampedStep === 0 ? (
            <OnboardingAboutStep subStep={aboutSubStep} />
          ) : (
            <OnboardingIntegrationsStep />
          )}
        </OnboardingStepPanel>
      </div>
    </ConstructSetupWindow>
  );
}
