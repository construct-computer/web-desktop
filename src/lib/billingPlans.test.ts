import { describe, expect, it } from 'vitest';
import { buildBillingFeatureRows, type BillingFeatureRow } from './billingPlans';
import type { BillingPlanInfo } from '@/services/api';

const plans: BillingPlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    priceLabel: '$0',
    period: '',
    limits: {
      monthlyUsageRelativeToFree: 1,
      sessionUsageRelativeToFree: 1,
      mainTaskSteps: 20,
      commandRuntimeSeconds: 300,
      parallelWork: 2,
      scheduledTasks: 3,
      storageBytes: 100 * 1024 * 1024,
      emailAddress: false,
      backgroundTasks: false,
    },
  },
  {
    id: 'starter',
    name: 'Starter',
    priceUsd: 59,
    priceLabel: '$59',
    period: '/mo',
    limits: {
      monthlyUsageRelativeToFree: 4.375,
      sessionUsageRelativeToFree: 4.5,
      mainTaskSteps: 50,
      commandRuntimeSeconds: 3600,
      parallelWork: 6,
      scheduledTasks: 10,
      storageBytes: 1024 * 1024 * 1024,
      emailAddress: true,
      backgroundTasks: true,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUsd: 299,
    priceLabel: '$299',
    period: '/mo',
    limits: {
      monthlyUsageRelativeToFree: 23.75,
      sessionUsageRelativeToFree: 16,
      mainTaskSteps: 100,
      commandRuntimeSeconds: 10800,
      parallelWork: -1,
      scheduledTasks: -1,
      storageBytes: 3 * 1024 * 1024 * 1024,
      emailAddress: true,
      backgroundTasks: true,
    },
  },
];

function row(rows: BillingFeatureRow[], label: string): BillingFeatureRow {
  const match = rows.find((item) => item.label === label);
  if (!match) throw new Error(`Missing row: ${label}`);
  return match;
}

describe('billing plan feature rows', () => {
  it('renders only code-backed plan rows', () => {
    const rows = buildBillingFeatureRows(plans, 'free', 'construct.local');
    expect(rows.map((item) => item.label)).toContain('Command runtime');
    expect(rows.map((item) => item.label)).toContain('Background tasks');
    expect(rows.map((item) => item.label)).not.toContain('Model quality');
    expect(rows.map((item) => item.label)).not.toContain('Apps');
    expect(rows.map((item) => item.label)).not.toContain('BYOK');
    expect(rows.map((item) => item.label)).not.toContain('Priority Support');
  });

  it('formats tier limits from plan metadata', () => {
    const rows = buildBillingFeatureRows(plans, 'starter', 'construct.local');
    expect(row(rows, 'Command runtime').cells.pro.value).toBe('3 hours');
    expect(row(rows, 'Work at once').cells.pro.value).toBe('Unlimited');
    expect(row(rows, 'Scheduled tasks').cells.free.value).toBe('Up to 3');
    expect(row(rows, 'Email address').cells.free.enabled).toBe(false);
  });
});
