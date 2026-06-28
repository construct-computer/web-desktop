import { describe, expect, it } from 'vitest';
import { hasAgentAccess, hasPaidAccess } from './plans';

describe('plan helpers', () => {
  it('treats lite, starter, and pro as active agent plans', () => {
    expect(hasAgentAccess('lite')).toBe(true);
    expect(hasAgentAccess('starter')).toBe(true);
    expect(hasAgentAccess('pro')).toBe(true);
  });

  it('keeps paid-only checks distinct from unsubscribed access', () => {
    expect(hasPaidAccess('lite')).toBe(true);
    expect(hasPaidAccess('starter')).toBe(true);
    expect(hasPaidAccess('pro')).toBe(true);
  });

  it('rejects missing and disabled plan states', () => {
    expect(hasAgentAccess(undefined)).toBe(false);
    expect(hasAgentAccess('unsubscribed')).toBe(false);
    expect(hasPaidAccess('unsubscribed')).toBe(false);
  });
});
