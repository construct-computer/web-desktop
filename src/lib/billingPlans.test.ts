import { describe, expect, it } from 'vitest';
import { buildBillingFeatureRows, type BillingFeatureRow } from './billingPlans';
import type { BillingPlanInfo } from '@/services/api';

const plans: BillingPlanInfo[] = [
  {
    id: 'lite',
    name: 'Lite',
    priceUsd: 9,
    priceLabel: '$9',
    period: '/mo',
    limits: {
      monthlyUsageRelativeToFree: 1,
      sessionUsageRelativeToFree: 1,
      mainTaskSteps: 50,
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
      monthlyUsageRelativeToFree: 35 / 6,
      sessionUsageRelativeToFree: 4.5,
      mainTaskSteps: 150,
      commandRuntimeSeconds: 1800,
      parallelWork: 5,
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
      monthlyUsageRelativeToFree: 190 / 6,
      sessionUsageRelativeToFree: 16,
      mainTaskSteps: 1000,
      commandRuntimeSeconds: 3600,
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
    const rows = buildBillingFeatureRows(plans, 'lite', 'construct.local');
    expect(rows.map((item) => item.label)).toContain('Command runtime');
    expect(rows.map((item) => item.label)).toContain('Background tasks');
    expect(rows.map((item) => item.label)).not.toContain('Model quality');
    expect(rows.map((item) => item.label)).not.toContain('Apps');
    expect(rows.map((item) => item.label)).not.toContain('BYOK');
    expect(rows.map((item) => item.label)).not.toContain('Priority Support');
  });

  it('formats tier limits from plan metadata', () => {
    const rows = buildBillingFeatureRows(plans, 'starter', 'construct.local');
    expect(row(rows, 'Command runtime').cells.pro.value).toBe('1 hour');
    expect(row(rows, 'Work at once').cells.pro.value).toBe('Unlimited');
    expect(row(rows, 'Scheduled tasks').cells.lite.value).toBe('Up to 3');
    expect(row(rows, 'Email address').cells.lite.enabled).toBe(false);
  });
});
