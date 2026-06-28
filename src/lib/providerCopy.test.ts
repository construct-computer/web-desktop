import { describe, expect, it } from 'vitest';
import { providerCopy } from './providerCopy';
import type { EffectiveProvider } from '@/stores/billingStore';

describe('provider copy', () => {
  it('uses monthly language for BYOK cap blocks', () => {
    const copy = providerCopy({ kind: 'blocked-byok-cap' } as EffectiveProvider);
    expect(copy.bannerTitle).toBe('OpenRouter monthly cap reached');
    expect(copy.bannerBody).toContain('monthly cap');
    expect(copy.bannerBody).not.toContain('weekly');
    expect(copy.bannerBody).not.toContain('Monday');
    expect(copy.toastBody).toContain('monthly cap');
  });
});
