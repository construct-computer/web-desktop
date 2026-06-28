import { describe, expect, it } from 'vitest';
import { LITE_FEATURES, STARTER_FEATURES, PRO_FEATURES, type PlanFeature } from './subscribePlanCopy';

const textOf = (features: PlanFeature[]) => features.map((f) => f.text);

describe('subscribe window plan copy', () => {
  it('Lite copy matches the Lite tier limits', () => {
    const texts = textOf(LITE_FEATURES);
    expect(texts).toContain('Public $9/mo plan');
    expect(texts).toContain('50 steps per task');
    expect(texts).toContain('5 min command runtime');
    expect(texts).toContain('2 tasks in parallel');
    expect(texts).toContain('100 MB cloud storage');
  });

  it('Starter copy matches the Starter tier limits', () => {
    const texts = textOf(STARTER_FEATURES);
    expect(texts).toContain('6× the usage of Lite');
    expect(texts).toContain('150 steps per task');
    expect(texts).toContain('30 min command runtime');
    expect(texts).toContain('5 tasks in parallel');
    expect(texts).toContain('1 GB cloud storage');
    expect(texts).toContain('Agent email address');
    expect(texts).toContain('Background & scheduled tasks');
  });

  it('Pro copy matches the Pro tier limits', () => {
    const texts = textOf(PRO_FEATURES);
    expect(texts).toContain('32× the usage of Lite');
    expect(texts).toContain('1,000 steps per task');
    expect(texts).toContain('1 hr command runtime');
    expect(texts).toContain('Unlimited parallel tasks');
    expect(texts).toContain('3 GB cloud storage');
    expect(texts).toContain('Agent email address');
    expect(texts).toContain('Background & scheduled tasks');
    expect(texts).toContain('BYOK support');
  });

  it('drops the misleading model-tier copy (model quality is equal across plans)', () => {
    const all = [...textOf(LITE_FEATURES), ...textOf(STARTER_FEATURES), ...textOf(PRO_FEATURES)].join(' ').toLowerCase();
    expect(all).not.toContain('premium ai model');
    expect(all).not.toContain('fast ai model');
    expect(all).not.toContain('2 gb');
  });
});
