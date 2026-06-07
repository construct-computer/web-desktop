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

  it('blocks default priority when the tab is visible but allows important', () => {
    const original = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { hidden: false },
    });
    try {
      expect(shouldPersistNotification('default')).toBe(false);
      expect(shouldPersistNotification('important')).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: original,
      });
    }
  });
});
