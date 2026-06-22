import { create } from 'zustand';
import * as api from '@/services/api';
import type { OnboardingProfile, OnboardingProgress } from '@/lib/onboarding';
import { ONBOARDING_STEP_COUNT } from '@/lib/onboarding';
import {
  clearOnboardingDraft,
  mergeOnboardingDraftWithServer,
  writeOnboardingDraft,
} from '@/lib/onboardingDraftCache';
import { log } from '@/lib/logger';

const logger = log('OnboardingStore');

function persistDraft(
  profile: OnboardingProfile,
  progress: OnboardingProgress,
  step: number,
): void {
  writeOnboardingDraft({ profile, progress, step });
}

interface OnboardingStore {
  loaded: boolean;
  loading: boolean;
  profile: OnboardingProfile;
  progress: OnboardingProgress;
  step: number;
  fetch: () => Promise<void>;
  saveProfile: (patch: Partial<OnboardingProfile>) => Promise<void>;
  saveProgress: (patch: Partial<OnboardingProgress>) => Promise<void>;
  setStep: (step: number) => Promise<void>;
  trackEvent: (event: string, extra?: { demoId?: string; integration?: string }) => void;
  complete: () => Promise<boolean>;
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  loaded: false,
  loading: false,
  profile: {},
  progress: {},
  step: 0,

  fetch: async () => {
    set({ loading: true });
    const result = await api.getOnboarding();
    if (result.success) {
      const serverProfile = result.data.profile ?? {};
      const serverProgress = result.data.progress ?? {};
      const rawStep = serverProgress.step ?? 0;
      const clampedStep = Math.min(rawStep, ONBOARDING_STEP_COUNT - 1);
      const merged = mergeOnboardingDraftWithServer(
        serverProfile,
        serverProgress,
        clampedStep,
        result.data.onboardingCompleted,
      );
      set({
        loaded: true,
        loading: false,
        profile: merged.profile,
        progress: merged.progress,
        step: merged.step,
      });
    } else {
      logger.warn('Failed to load onboarding', result.error);
      set({ loaded: true, loading: false });
    }
  },

  saveProfile: async (patch) => {
    const profile = { ...get().profile, ...patch };
    const { progress, step } = get();
    set({ profile });
    persistDraft(profile, progress, step);
  },

  saveProgress: async (patch) => {
    const progress = { ...get().progress, ...patch };
    const { profile, step } = get();
    set({ progress });
    persistDraft(profile, progress, step);
  },

  setStep: async (step) => {
    const progress = { ...get().progress, step };
    const { profile } = get();
    set({ step, progress });
    persistDraft(profile, progress, step);
    void api.trackOnboardingEvent({ event: 'onboarding_step_viewed', step });
  },

  trackEvent: (event, extra) => {
    void api.trackOnboardingEvent({
      event,
      step: get().step,
      demoId: extra?.demoId,
      integration: extra?.integration,
    });
  },

  complete: async () => {
    const { profile, progress } = get();
    const result = await api.completeOnboarding({ profile, progress });
    if (!result.success) {
      logger.error('Failed to complete onboarding', result.error);
      return false;
    }
    clearOnboardingDraft();
    const { useAuthStore } = await import('@/stores/authStore');
    useAuthStore.setState({
      user: useAuthStore.getState().user
        ? { ...useAuthStore.getState().user!, onboardingCompleted: true }
        : result.data.user,
    });
    get().trackEvent('onboarding_completed');
    return true;
  },
}));
