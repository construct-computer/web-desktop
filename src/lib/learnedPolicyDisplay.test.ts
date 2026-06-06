import { describe, expect, it } from 'vitest';
import { formatLearnedPolicyDisplay, resolveLearnedPolicyCopy } from './learnedPolicyDisplay';

describe('learnedPolicyDisplay', () => {
  it('formats delivery channel defaults', () => {
    const copy = resolveLearnedPolicyCopy({
      policyKey: 'delivery.preferred_channel.scheduled_work',
      scopeValue: 'scheduled_work',
      policyValue: 'email',
      confidence: 0.72,
    });
    expect(copy.title).toBe('Send results by email');
    expect(copy.scopeLabel).toBe('Scheduled work');
  });

  it('prefers API-enriched fields when present', () => {
    const display = formatLearnedPolicyDisplay({
      policyKey: 'delivery.preferred_channel.scheduled_work',
      displayTitle: 'Custom title',
      displayDescription: 'Custom description',
      displayScopeLabel: 'Scheduled work',
      strength: 'strong',
      strengthLabel: 'Strong',
    });
    expect(display.title).toBe('Custom title');
    expect(display.description).toBe('Custom description');
    expect(display.strengthText).toBe('Strong');
  });
});
