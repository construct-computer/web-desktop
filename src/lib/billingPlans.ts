import type { BillingPlanId, BillingPlanInfo } from '@/services/api';

export const BILLING_PLAN_ORDER: BillingPlanId[] = ['free', 'starter', 'pro'];

export type BillingFeatureCell = {
  value: string;
  enabled: boolean;
  color?: string;
};

export type BillingFeatureRow = {
  label: string;
  tooltip: string;
  cells: Record<BillingPlanId, BillingFeatureCell>;
};

function formatMultiplier(ratio: number): string {
  if (Math.abs(ratio - 1) < 0.01) return '1x';
  if (ratio > 1) return `${Math.round(ratio)}x more`;
  return `${Math.round(1 / ratio)}x less`;
}

function multiplierColor(ratio: number): string | undefined {
  if (Math.abs(ratio - 1) < 0.01) return undefined;
  return ratio > 1 ? 'text-emerald-400' : 'text-red-400';
}

function formatRuntime(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

function formatStorage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function countLabel(value: number, suffix = ''): string {
  if (value < 0) return 'Unlimited';
  return suffix ? `${value} ${suffix}` : `Up to ${value}`;
}

function cell(value: string, enabled = true, color?: string): BillingFeatureCell {
  return { value, enabled, color };
}

function booleanCell(enabled: boolean): BillingFeatureCell {
  return { value: '', enabled };
}

function byId(plans: BillingPlanInfo[]): Record<BillingPlanId, BillingPlanInfo> | null {
  const map = new Map(plans.map((plan) => [plan.id, plan]));
  const ordered = BILLING_PLAN_ORDER.map((id) => map.get(id));
  if (ordered.some((plan) => !plan)) return null;
  return Object.fromEntries(ordered.map((plan) => [plan!.id, plan!])) as Record<BillingPlanId, BillingPlanInfo>;
}

function sameForEveryPlan(row: BillingFeatureRow): boolean {
  const values = BILLING_PLAN_ORDER.map((id) => row.cells[id]);
  const first = values[0];
  return values.every((value) => (
    value.enabled === first.enabled
    && value.value === first.value
  ));
}

export function buildBillingFeatureRows(
  plans: BillingPlanInfo[],
  currentPlan: string,
  emailDomain: string,
): BillingFeatureRow[] {
  const planMap = byId(plans);
  if (!planMap) return [];
  const effective = BILLING_PLAN_ORDER.includes(currentPlan as BillingPlanId)
    ? currentPlan as BillingPlanId
    : 'free';
  const currentUsage = planMap[effective].limits.weeklyUsageRelativeToFree || 1;

  const fromPlans = (
    label: string,
    tooltip: string,
    getCell: (plan: BillingPlanInfo) => BillingFeatureCell,
  ): BillingFeatureRow => ({
    label,
    tooltip,
    cells: {
      free: getCell(planMap.free),
      starter: getCell(planMap.starter),
      pro: getCell(planMap.pro),
    },
  });

  const rows = [
    fromPlans(
      'Usage included',
      'Standard AI usage included relative to your current plan. Heavy tasks use more of this budget. BYOK bypasses this.',
      (plan) => {
        const ratio = plan.limits.weeklyUsageRelativeToFree / currentUsage;
        return cell(formatMultiplier(ratio), true, multiplierColor(ratio));
      },
    ),
    fromPlans(
      'Main task steps',
      'How many steps Construct can take before stopping on a task. Higher limits help with harder multi-step work.',
      (plan) => cell(`${plan.limits.mainTaskSteps} steps/task`),
    ),
    fromPlans(
      'Command runtime',
      'How long a Terminal command can run before Construct stops it.',
      (plan) => cell(formatRuntime(plan.limits.commandRuntimeSeconds)),
    ),
    fromPlans(
      'Work at once',
      'How many pieces of work Construct can run at the same time.',
      (plan) => cell(countLabel(plan.limits.parallelWork, 'active')),
    ),
    fromPlans(
      'Scheduled tasks',
      'Routines you can ask Construct to repeat on a schedule, such as checking email each morning.',
      (plan) => cell(countLabel(plan.limits.scheduledTasks)),
    ),
    fromPlans(
      'Storage',
      'Space for files, PDFs, images, and documents stored in your workspace.',
      (plan) => cell(formatStorage(plan.limits.storageBytes)),
    ),
    fromPlans(
      'Email address',
      `Get a dedicated @${emailDomain} email address that Construct can read and reply from.`,
      (plan) => booleanCell(plan.limits.emailAddress),
    ),
    fromPlans(
      'Background tasks',
      'Let Construct continue longer tasks after you close the app or go offline.',
      (plan) => booleanCell(plan.limits.backgroundTasks),
    ),
  ];
  return rows.filter((row) => !sameForEveryPlan(row));
}
