import { ONBOARDING_DEMOS, pickRecommendedDemo, type OnboardingDemoId } from '@/lib/onboarding-demos';
import type { OnboardingGoal } from '@/lib/onboarding';
import { useComputerStore } from '@/stores/agentStore';
import { useWindowStore } from '@/stores/windowStore';
import * as api from '@/services/api';

export async function runOnboardingDemo(
  goals: OnboardingGoal[] = [],
  opts?: { topic?: string; mode?: 'watch' | 'try' },
): Promise<OnboardingDemoId | null> {
  const demoId = pickRecommendedDemo(goals);
  const demo = ONBOARDING_DEMOS.find((d) => d.id === demoId);
  if (!demo) return null;

  const mode = opts?.mode ?? 'watch';
  const topic = opts?.topic ?? 'getting started with Construct';
  const { ensureWindowOpen, toggleSpotlight } = useWindowStore.getState();
  const sendChatMessage = useComputerStore.getState().sendChatMessage;

  for (const win of demo.windows) {
    ensureWindowOpen(win);
  }
  if (!useWindowStore.getState().spotlightOpen) {
    toggleSpotlight();
  }

  const prompt = demo.buildPrompt(demo.id === 'browser-capture' ? demo.defaultTopic : topic);
  sendChatMessage(prompt, undefined, {
    frontendContext: {
      onboardingDemo: true,
      onboardingDemoId: demoId,
      source: 'onboarding_post_reveal',
    },
  });

  void api.trackOnboardingEvent({
    event: mode === 'watch' ? 'onboarding_demo_started' : 'onboarding_demo_try',
    demoId,
  });

  await api.patchOnboarding({
    progress: {
      requiredDemoCompleted: demoId,
      ...(mode === 'watch' ? { demosWatched: [demoId] } : { demosTried: [demoId] }),
    },
  });

  void api.trackOnboardingEvent({ event: 'onboarding_demo_completed', demoId });

  return demoId;
}
