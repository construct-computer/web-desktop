export type BootPhase =
  | 'lock'
  | 'first_run'
  | 'desktop_enter'
  | 'desktop';

export const BOOT_EVENTS = {
  onboardingComplete: 'construct:first-run-onboarding-complete',
  desktopRevealed: 'construct:desktop-revealed',
  postOnboardingDesktopReady: 'construct:post-onboarding-desktop-ready',
  setupSaved: 'construct:setup-saved',
} as const;

export function deriveBootPhase(input: {
  isAuthenticated: boolean;
  hasAccess: boolean;
  firstRunDone: boolean;
  computerReady: boolean;
  lockScreenGone: boolean;
  explicitPhase?: BootPhase;
}): BootPhase {
  if (input.explicitPhase) return input.explicitPhase;
  if (!input.isAuthenticated || !input.hasAccess) return 'desktop';
  if (input.firstRunDone) return 'desktop';
  if (!input.computerReady) return 'lock';
  if (!input.lockScreenGone) return 'lock';
  return 'first_run';
}
