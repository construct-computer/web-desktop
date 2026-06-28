import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./BillingSection.tsx', import.meta.url), 'utf8');

describe('BillingSection visibility', () => {
  it('shows ai provider only for pro', () => {
    expect(source).toMatch(/const showAiProvider = isPro;/);
    expect(source).toMatch(/\{showAiProvider && \(/);
    expect(source).toMatch(/subtitle=\{subtitle\}/);
  });
});
