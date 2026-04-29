import { describe, expect, it } from 'vitest';
import {
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
});
