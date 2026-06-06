import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_PLATFORM_META,
  coerceExternalAccess,
  coerceExternalSource,
  inferExternalPlatform,
  isExternalSessionKey,
  sourceContext,
  sourceLabel,
} from './externalPlatforms';

describe('external platform helpers', () => {
  it('infers platform from legacy session keys', () => {
    expect(inferExternalPlatform('slack_T1_123')).toBe('slack');
    expect(inferExternalPlatform('telegram_42')).toBe('telegram');
    expect(inferExternalPlatform('email_thr_1')).toBe('email');
    expect(inferExternalPlatform('default')).toBeNull();
    expect(isExternalSessionKey('email_msg_1')).toBe(true);
  });

  it('coerces source and access metadata used by Spotlight rendering', () => {
    const source = coerceExternalSource({
      platform: 'email',
      senderName: 'Alice Example',
      senderId: 'alice@example.com',
      subject: 'Contract update',
    });

    expect(source?.platform).toBe('email');
    expect(sourceLabel(source)).toBe('Alice Example');
    expect(sourceContext(source)).toBe('Contract update');
    expect(coerceExternalAccess({ role: 'ONE_OFF', grant: { type: 'one_off', approvalId: 'apr_1' } })?.role).toBe('ONE_OFF');
  });

  it('renders scheduled-task source as a platform card', () => {
    expect(EXTERNAL_PLATFORM_META.scheduled.label).toBe('Scheduled task');

    const source = coerceExternalSource({
      platform: 'scheduled',
      senderName: 'Morning inbox sweep',
      scheduledAt: '2026-06-05T09:00:00.000Z',
      recurrence: 'daily',
      deliveryChannel: 'email',
    });

    expect(source?.platform).toBe('scheduled');
    expect(sourceLabel(source)).toBe('Morning inbox sweep');
    const ctx = sourceContext(source);
    expect(ctx).toContain('daily');
    expect(ctx).toContain('deliver: email');
  });

  it('keeps scheduled out of session-key platform inference (stays interactive)', () => {
    expect(inferExternalPlatform('sched_sch_1_occ_1')).toBeNull();
    expect(isExternalSessionKey('sched_sch_1_occ_1')).toBe(false);
    expect(inferExternalPlatform('calendar_evt_evt1')).toBeNull();
  });
});
