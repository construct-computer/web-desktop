import { Globe, FileSearch, Terminal, Mail, FileText, CalendarClock, Code } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OnboardingGoal, OnboardingProfile } from '@/lib/onboarding';
import type { OnboardingDemoId } from '@/lib/onboarding-demos';
import { getOnboardingDemo } from '@/lib/onboarding-demos';

export interface StarterPrompt {
  icon: ReactNode;
  label: string;
  prompt: string;
}

const DEFAULT_PROMPTS: StarterPrompt[] = [
  {
    icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
    label: 'Research a topic',
    prompt: 'Help me research a topic. First ask me for the topic/industry, audience, deadline, and desired output format if I have not provided them; do not guess missing details.',
  },
  {
    icon: <FileSearch className="w-3.5 h-3.5 shrink-0" />,
    label: 'Draft an email',
    prompt: 'Help me draft a professional email. First ask for the recipient, goal, tone, and key points if they are missing; do not invent meeting details.',
  },
  {
    icon: <Terminal className="w-3.5 h-3.5 shrink-0" />,
    label: 'Summarize my files',
    prompt: 'Look through my workspace files and summarize only what you can verify from accessible files. Note unknowns separately and list any action items you find.',
  },
];

const GOAL_PROMPTS: Record<OnboardingGoal, StarterPrompt> = {
  research: {
    icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
    label: 'Research a topic',
    prompt: 'Research a topic on the web and give me a concise brief with sources.',
  },
  documents: {
    icon: <FileText className="w-3.5 h-3.5 shrink-0" />,
    label: 'Create a PDF report',
    prompt: 'Write a one-page report as a PDF and save it to my workspace.',
  },
  email: {
    icon: <Mail className="w-3.5 h-3.5 shrink-0" />,
    label: 'Draft an email',
    prompt: 'Help me draft a professional email. Ask for recipient and goal if missing.',
  },
  coding: {
    icon: <Code className="w-3.5 h-3.5 shrink-0" />,
    label: 'Review my code',
    prompt: 'Look at a file in my workspace and suggest focused improvements.',
  },
  scheduling: {
    icon: <CalendarClock className="w-3.5 h-3.5 shrink-0" />,
    label: 'Plan my day',
    prompt: 'Look at my calendar and inbox and suggest a plan for today.',
  },
  data: {
    icon: <Terminal className="w-3.5 h-3.5 shrink-0" />,
    label: 'Summarize a spreadsheet',
    prompt: 'Summarize key metrics from a spreadsheet in my workspace.',
  },
  integrations: {
    icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
    label: 'Automate a workflow',
    prompt: 'Help me automate a repetitive task using my connected apps.',
  },
};

export function buildStarterPrompts(
  profile?: OnboardingProfile | null,
  pinnedDemoId?: OnboardingDemoId,
): StarterPrompt[] {
  const prompts: StarterPrompt[] = [];

  if (pinnedDemoId) {
    const demo = getOnboardingDemo(pinnedDemoId);
    if (demo) {
      prompts.push({
        icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
        label: `Try: ${demo.title}`,
        prompt: demo.buildPrompt(demo.defaultTopic),
      });
    }
  }

  const goals = profile?.goals ?? [];
  for (const goal of goals) {
    const p = GOAL_PROMPTS[goal];
    if (p && !prompts.some((x) => x.label === p.label)) prompts.push(p);
  }

  for (const p of DEFAULT_PROMPTS) {
    if (prompts.length >= 4) break;
    if (!prompts.some((x) => x.label === p.label)) prompts.push(p);
  }

  return prompts.slice(0, 4);
}

export function starterPromptHeader(profile?: OnboardingProfile | null): string | null {
  const goals = profile?.goals ?? [];
  if (!goals.length) return null;
  const labels = goals
    .map((g) => GOAL_PROMPTS[g]?.label.replace(/^Create |^Research |^Draft |^Plan |^Summarize |^Review |^Automate /, '') ?? g)
    .slice(0, 3);
  return `Based on your goals: ${labels.join(', ')}`;
}
