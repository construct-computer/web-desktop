import { describe, expect, it } from 'vitest';
import { shouldPersistNotification, workOrderNotificationPriority } from './notificationPolicy';

describe('notificationPolicy', () => {
  it('treats routine work-order completion as silent', () => {
    expect(workOrderNotificationPriority('completed')).toBe('silent');
    expect(workOrderNotificationPriority('cancelled')).toBe('silent');
    expect(workOrderNotificationPriority('failed')).toBe('critical');
  });

  it('respects priority tiers', () => {
    expect(shouldPersistNotification('silent')).toBe(false);
    expect(shouldPersistNotification('critical')).toBe(true);
  });
});
