import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  clearOnboardingDraft,
  mergeOnboardingDraftWithServer,
  readOnboardingDraft,
  writeOnboardingDraft,
} from './onboardingDraftCache';

const sessionStore = new Map<string, string>();

beforeEach(() => {
  sessionStore.clear();
  clearOnboardingDraft();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, value: string) => { sessionStore.set(key, value); },
    removeItem: (key: string) => { sessionStore.delete(key); },
  });
});

describe('onboardingDraftCache', () => {
  it('round-trips draft in sessionStorage', () => {
    writeOnboardingDraft({
      profile: { role: 'founder', goals: ['research'] },
      progress: { step: 1 },
      step: 1,
    });
    const draft = readOnboardingDraft();
    expect(draft?.profile.role).toBe('founder');
    expect(draft?.step).toBe(1);
  });

  it('merges draft over server state when onboarding not completed', () => {
    writeOnboardingDraft({
      profile: { role: 'engineer', goals: ['coding'] },
      progress: { step: 1 },
      step: 1,
    });
    const merged = mergeOnboardingDraftWithServer(
      { role: 'founder' },
      { step: 0 },
      0,
      false,
    );
    expect(merged.profile.role).toBe('engineer');
    expect(merged.profile.goals).toEqual(['coding']);
    expect(merged.step).toBe(1);
  });

  it('clears draft when onboarding already completed', () => {
    writeOnboardingDraft({
      profile: { role: 'engineer' },
      progress: {},
      step: 0,
    });
    const merged = mergeOnboardingDraftWithServer(
      { role: 'founder' },
      { step: 0 },
      0,
      true,
    );
    expect(merged.profile.role).toBe('founder');
    expect(readOnboardingDraft()).toBeNull();
  });
});
