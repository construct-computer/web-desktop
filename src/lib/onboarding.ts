/**
 * Onboarding types and helpers (frontend).
 */

import type { LucideIcon } from 'lucide-react';
import { recommendIntegrationsSync } from '@/lib/onboardingRecommendations';
import {
  Briefcase,
  Code2,
  FileText,
  GraduationCap,
  LineChart,
  Mail,
  Megaphone,
  MoreHorizontal,
  Calendar,
  Table2,
  Search,
  Plug,
  User,
  Users,
  Building2,
} from 'lucide-react';

export const ONBOARDING_STEPS = [
  { id: 'about', label: 'About you', description: 'Role and goals' },
  { id: 'integrations', label: 'Connect apps', description: 'Gmail, Calendar, …' },
] as const;

export const ONBOARDING_ROLES: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: 'founder', label: 'Founder / executive', description: 'Strategy, updates, decisions', icon: Briefcase },
  { id: 'engineer', label: 'Engineer', description: 'Code, reviews, shipping', icon: Code2 },
  { id: 'ops', label: 'Operations', description: 'Processes, vendors, logistics', icon: LineChart },
  { id: 'marketing', label: 'Marketing', description: 'Campaigns, content, growth', icon: Megaphone },
  { id: 'sales', label: 'Sales', description: 'Pipeline, outreach, CRM', icon: Users },
  { id: 'student', label: 'Student', description: 'Research, notes, deadlines', icon: GraduationCap },
  { id: 'other', label: 'Other', description: 'Something else entirely', icon: MoreHorizontal },
] as const;

export const ONBOARDING_GOALS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: 'research', label: 'Research & briefs', description: 'Summarize and synthesize', icon: Search },
  { id: 'documents', label: 'Documents & reports', description: 'Write and polish deliverables', icon: FileText },
  { id: 'email', label: 'Email & communication', description: 'Draft, triage, follow up', icon: Mail },
  { id: 'coding', label: 'Coding & dev work', description: 'Build, debug, review PRs', icon: Code2 },
  { id: 'scheduling', label: 'Scheduling & reminders', description: 'Calendar and deadlines', icon: Calendar },
  { id: 'data', label: 'Spreadsheets & data', description: 'Tables, charts, analysis', icon: Table2 },
  { id: 'integrations', label: 'Automate with apps', description: 'Connect tools you already use', icon: Plug },
] as const;

export const ONBOARDING_WORK_CONTEXTS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: 'solo', label: 'Solo', description: 'Just me', icon: User },
  { id: 'small_team', label: 'Small team', description: '2–20 people', icon: Users },
  { id: 'company', label: 'Company', description: 'Larger org', icon: Building2 },
] as const;

export type OnboardingRole = (typeof ONBOARDING_ROLES)[number]['id'];
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number]['id'];
export type OnboardingWorkContext = (typeof ONBOARDING_WORK_CONTEXTS)[number]['id'];

export interface OnboardingProfile {
  role?: OnboardingRole;
  goals?: OnboardingGoal[];
  workContext?: OnboardingWorkContext;
  company?: string;
  freeText?: string;
}

export interface OnboardingProgress {
  step?: number;
  integrationsSkipped?: boolean;
  integrationsConnected?: string[];
  demosWatched?: string[];
  demosTried?: string[];
  requiredDemoCompleted?: string;
}

export const ONBOARDING_INTEGRATION_CATALOG = [
  { slug: 'gmail', label: 'Gmail', tagline: 'Read and triage your inbox', goals: ['email', 'research'] },
  { slug: 'googlecalendar', label: 'Google Calendar', tagline: 'Schedule and manage events', goals: ['scheduling', 'email'] },
  { slug: 'github', label: 'GitHub', tagline: 'Repos, issues, and PRs', goals: ['coding'] },
  { slug: 'linear', label: 'Linear', tagline: 'Track issues and projects', goals: ['coding', 'integrations'] },
  { slug: 'notion', label: 'Notion', tagline: 'Notes and docs in one place', goals: ['documents', 'integrations'] },
  { slug: 'googledocs', label: 'Google Docs', tagline: 'Draft and edit docs', goals: ['documents'] },
  { slug: 'googlesheets', label: 'Google Sheets', tagline: 'Spreadsheets and data', goals: ['data'] },
  { slug: 'slack', label: 'Slack', tagline: 'Team messages and channels', goals: ['email', 'integrations'] },
  { slug: 'googledrive', label: 'Google Drive', tagline: 'Files and folders', goals: ['documents', 'data'] },
  { slug: 'outlook', label: 'Outlook', tagline: 'Microsoft email and calendar', goals: ['email', 'scheduling'] },
] as const satisfies ReadonlyArray<{
  slug: string;
  label: string;
  tagline: string;
  goals: readonly OnboardingGoal[];
}>;

export type OnboardingIntegrationEntry = {
  slug: string;
  label: string;
  tagline: string;
};

export const ONBOARDING_INTEGRATION_DISPLAY_LIMIT = 9;

export function recommendIntegrations(profile: OnboardingProfile = {}): OnboardingIntegrationEntry[] {
  return recommendIntegrationsSync(profile).candidates;
}

export function goalLabels(goals: OnboardingGoal[] = []): string {
  const map = new Map(ONBOARDING_GOALS.map((g) => [g.id, g.label]));
  return goals.map((g) => map.get(g) ?? g).join(' · ');
}

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;
