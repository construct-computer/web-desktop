import { describe, expect, it } from 'vitest';
import { shouldPersistNotification } from './notificationPolicy';

describe('notificationPolicy', () => {
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
