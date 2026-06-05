import { describe, expect, it } from 'vitest';
import { isTriggeredSessionKey } from './agentSessionKeys';

describe('isTriggeredSessionKey', () => {
  it('matches per-occurrence scheduled sessions', () => {
    expect(isTriggeredSessionKey('sched_sch_abc_occ_def')).toBe(true);
  });

  it('matches legacy shared scheduled lanes', () => {
    expect(isTriggeredSessionKey('scheduled_tasks')).toBe(true);
    expect(isTriggeredSessionKey('calendar_reminders')).toBe(true);
  });

  it('does not match normal desktop chats', () => {
    expect(isTriggeredSessionKey('default')).toBe(false);
    expect(isTriggeredSessionKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });
});
