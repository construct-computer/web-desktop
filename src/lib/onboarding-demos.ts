import type { LucideIcon } from 'lucide-react';
import { Globe, FileText, Camera, CalendarClock } from 'lucide-react';
import type { OnboardingGoal } from '@/lib/onboarding';
import type { WindowType } from '@/types';

export type OnboardingDemoId =
  | 'research-brief'
  | 'pdf-report'
  | 'browser-capture'
  | 'daily-plan';

export interface OnboardingDemo {
  id: OnboardingDemoId;
  title: string;
  description: string;
  icon: LucideIcon;
  windows: WindowType[];
  defaultTopic: string;
  buildPrompt: (topic: string) => string;
}

export const ONBOARDING_DEMOS: OnboardingDemo[] = [
  {
    id: 'research-brief',
    title: 'Research brief',
    description: 'Watch Construct research a topic and save a brief to your workspace.',
    icon: Globe,
    windows: ['files'],
    defaultTopic: 'getting started with Construct',
    buildPrompt: (topic) =>
      `Research "${topic}" and save a concise one-page brief to /mnt/saved/onboarding/research-brief.md. Keep it short and practical.`,
  },
  {
    id: 'pdf-report',
    title: 'PDF report',
    description: 'See how Construct turns content into a polished PDF deliverable.',
    icon: FileText,
    windows: ['files', 'document-viewer'],
    defaultTopic: 'getting started with Construct',
    buildPrompt: (topic) =>
      `Create a one-page PDF report about "${topic}" and save it under /mnt/saved/onboarding/. Use the document workflow (guide → terminal → verify).`,
  },
  {
    id: 'browser-capture',
    title: 'Browser capture',
    description: 'Open the Browser app while Construct screenshots a live page.',
    icon: Camera,
    windows: ['browser'],
    defaultTopic: 'construct.computer',
    buildPrompt: () =>
      'Take a screenshot of https://construct.computer and briefly describe what you see on the page.',
  },
  {
    id: 'daily-plan',
    title: 'Daily reminder',
    description: 'Set a calendar reminder so Construct can nudge you later.',
    icon: CalendarClock,
    windows: ['calendar'],
    defaultTopic: 'Check Construct',
    buildPrompt: (topic) =>
      `Set a one-time reminder for tomorrow at 9:00 AM in my timezone titled "${topic}". Use agent_schedule or agent_calendar — keep it simple.`,
  },
];

export function getOnboardingDemo(id: OnboardingDemoId): OnboardingDemo | undefined {
  return ONBOARDING_DEMOS.find((d) => d.id === id);
}

export function pickRecommendedDemo(goals: OnboardingGoal[] = []): OnboardingDemoId {
  if (goals.includes('documents')) return 'pdf-report';
  if (goals.includes('research')) return 'research-brief';
  if (goals.includes('scheduling')) return 'daily-plan';
  return 'research-brief';
}
