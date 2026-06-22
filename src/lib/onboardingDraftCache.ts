import type { OnboardingProfile, OnboardingProgress } from '@/lib/onboarding';

const DRAFT_KEY = 'construct-onboarding-draft';

export type OnboardingDraft = {
  profile: OnboardingProfile;
  progress: OnboardingProgress;
  step: number;
  updatedAt: number;
};

export function readOnboardingDraft(): OnboardingDraft | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      profile: parsed.profile ?? {},
      progress: parsed.progress ?? {},
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function writeOnboardingDraft(draft: Omit<OnboardingDraft, 'updatedAt'>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      ...draft,
      updatedAt: Date.now(),
    }));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function clearOnboardingDraft(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function mergeOnboardingDraftWithServer(
  serverProfile: OnboardingProfile,
  serverProgress: OnboardingProgress,
  serverStep: number,
  onboardingCompleted: boolean,
): { profile: OnboardingProfile; progress: OnboardingProgress; step: number } {
  if (onboardingCompleted) {
    clearOnboardingDraft();
    return { profile: serverProfile, progress: serverProgress, step: serverStep };
  }

  const draft = readOnboardingDraft();
  if (!draft) {
    return { profile: serverProfile, progress: serverProgress, step: serverStep };
  }

  return {
    profile: { ...serverProfile, ...draft.profile },
    progress: { ...serverProgress, ...draft.progress, step: draft.step ?? serverStep },
    step: draft.step ?? serverStep,
  };
}
