import { describe, expect, it } from 'vitest';
import { hasAgentAccess, hasPaidAccess } from './plans';

describe('plan helpers', () => {
  it('treats free, starter, and pro as active agent plans', () => {
    expect(hasAgentAccess('free')).toBe(true);
    expect(hasAgentAccess('starter')).toBe(true);
    expect(hasAgentAccess('pro')).toBe(true);
  });

  it('keeps paid-only checks distinct from free access', () => {
    expect(hasPaidAccess('free')).toBe(false);
    expect(hasPaidAccess('starter')).toBe(true);
    expect(hasPaidAccess('pro')).toBe(true);
  });

  it('rejects missing and disabled plan states', () => {
    expect(hasAgentAccess(undefined)).toBe(false);
    expect(hasAgentAccess('unsubscribed')).toBe(false);
    expect(hasPaidAccess('unsubscribed')).toBe(false);
  });
});
