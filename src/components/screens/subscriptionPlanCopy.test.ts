import { describe, expect, it } from 'vitest';
import { STARTER_FEATURES, PRO_FEATURES, type PlanFeature } from './subscriptionPlanCopy';

const textOf = (features: PlanFeature[]) => features.map((f) => f.text);

// These assertions mirror worker/src/config/tiers.ts (TIER_LIMITS). If the
// canonical tier limits change, this test should be updated alongside the copy.
describe('subscription overlay plan copy', () => {
  it('Starter copy matches the Starter tier limits', () => {
    const texts = textOf(STARTER_FEATURES);
    expect(texts).toContain('150 steps per task');
    expect(texts).toContain('30 min command runtime');
    expect(texts).toContain('5 tasks in parallel');
    expect(texts).toContain('1 GB cloud storage');
    expect(texts).toContain('Agent email address');
    expect(texts).toContain('Background & scheduled tasks');
  });

  it('Pro copy matches the Pro tier limits', () => {
    const texts = textOf(PRO_FEATURES);
    expect(texts).toContain('1,000 steps per task');
    expect(texts).toContain('1 hr command runtime');
    expect(texts).toContain('Unlimited parallel tasks');
    expect(texts).toContain('3 GB cloud storage');
    expect(texts).toContain('Agent email address');
    expect(texts).toContain('Background & scheduled tasks');
  });

  it('drops the misleading model-tier copy (model quality is equal across plans)', () => {
    const all = [...textOf(STARTER_FEATURES), ...textOf(PRO_FEATURES)].join(' ').toLowerCase();
    expect(all).not.toContain('premium ai model');
    expect(all).not.toContain('fast ai model');
    // Pro no longer claims the stale 2 GB storage figure.
    expect(all).not.toContain('2 gb');
  });
});
