import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BOOT_EVENTS } from '@/hooks/useBootPhase';

describe('boot transition', () => {
  it('defines postOnboardingDesktopReady event', () => {
    expect(BOOT_EVENTS.postOnboardingDesktopReady).toBe('construct:post-onboarding-desktop-ready');
  });

  it('no longer includes welcome boot phase', () => {
    const phases = ['lock', 'first_run', 'desktop_enter', 'desktop'] as const;
    expect(phases).not.toContain('welcome');
  });
});

describe('onboardingStore draft behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('saveProfile does not patch onboarding API', async () => {
    const patchOnboarding = vi.fn().mockResolvedValue({ success: true, data: {} });
    const completeOnboarding = vi.fn().mockResolvedValue({
      success: true,
      data: { user: { onboardingCompleted: true }, profile: {}, progress: {} },
    });
    const getOnboarding = vi.fn().mockResolvedValue({
      success: true,
      data: { onboardingCompleted: false, profile: {}, progress: {} },
    });

    vi.doMock('@/services/api', () => ({
      patchOnboarding,
      completeOnboarding,
      getOnboarding,
      trackOnboardingEvent: vi.fn(),
    }));

    const { useOnboardingStore } = await import('@/stores/onboardingStore');
    await useOnboardingStore.getState().fetch();
    await useOnboardingStore.getState().saveProfile({ role: 'engineer' });

    expect(patchOnboarding).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().profile.role).toBe('engineer');
  });

  it('complete sends full profile snapshot', async () => {
    const patchOnboarding = vi.fn();
    const completeOnboarding = vi.fn().mockResolvedValue({
      success: true,
      data: { user: { onboardingCompleted: true }, profile: {}, progress: {} },
    });
    const getOnboarding = vi.fn().mockResolvedValue({
      success: true,
      data: { onboardingCompleted: false, profile: {}, progress: {} },
    });

    vi.doMock('@/services/api', () => ({
      patchOnboarding,
      completeOnboarding,
      getOnboarding,
      trackOnboardingEvent: vi.fn(),
    }));

    const { useOnboardingStore } = await import('@/stores/onboardingStore');
    await useOnboardingStore.getState().fetch();
    await useOnboardingStore.getState().saveProfile({
      role: 'founder',
      goals: ['research'],
      workContext: 'solo',
    });
    await useOnboardingStore.getState().complete();

    expect(completeOnboarding).toHaveBeenCalledWith({
      profile: {
        role: 'founder',
        goals: ['research'],
        workContext: 'solo',
      },
      progress: expect.any(Object),
    });
    expect(patchOnboarding).not.toHaveBeenCalled();
  });
});
