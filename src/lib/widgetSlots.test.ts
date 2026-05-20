import { beforeEach, describe, expect, it, vi } from 'vitest';

function installBrowserGlobals(width = 1000, height = 800) {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {
    innerWidth: width,
    innerHeight: height,
    dispatchEvent: vi.fn(),
  });
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn((key: string) => { storage.delete(key); }),
  });
  vi.stubGlobal('CustomEvent', class TestCustomEvent<T = unknown> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  });
}

describe('widget slot helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installBrowserGlobals();
  });

  it('uses measured widget width for right-side slots', async () => {
    const { slotPosition } = await import('./widgetSlots');

    expect(slotPosition('tr', { width: 260, height: 120 })).toEqual({ x: 726, y: 54 });
    expect(slotPosition('br', { width: 260, height: 120 })).toEqual({ x: 726, y: 586 });
  });

  it('uses measured widget height for bottom slots', async () => {
    const { slotPosition } = await import('./widgetSlots');

    expect(slotPosition('bl', { width: 320, height: 220 })).toEqual({ x: 14, y: 486 });
    expect(slotPosition('br', { width: 320, height: 220 })).toEqual({ x: 666, y: 486 });
  });

  it('snaps a dropped widget to the nearest measured slot', async () => {
    const { getWidgetSlot, snapToSlotWithSize } = await import('./widgetSlots');

    expect(snapToSlotWithSize('autopilot', 700, 560, { width: 260, height: 120 })).toBe('br');
    expect(getWidgetSlot('autopilot')).toBe('br');
  });

  it('bumps an existing occupant when a different widget claims its slot', async () => {
    const { claimSlot, getWidgetSlot } = await import('./widgetSlots');

    claimSlot('status', 'tr', true, { width: 300, height: 420 });
    claimSlot('autopilot', 'tr', false, { width: 260, height: 120 });

    expect(getWidgetSlot('autopilot')).toBe('tr');
    expect(getWidgetSlot('status')).not.toBe('tr');
  });
});
