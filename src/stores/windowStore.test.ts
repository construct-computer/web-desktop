import { beforeAll, describe, expect, it } from 'vitest';
import { useWindowStore } from './windowStore';
import { useAuthStore } from './authStore';

describe('app-builder singleton metadata switching', () => {
  beforeAll(() => {
    // Grant agent access so openWindow's plan gate doesn't no-op.
    useAuthStore.setState({ user: { plan: 'pro' } as never });
  });

  it('reuses the singleton window but needs updateWindow to switch apps', () => {
    const store = useWindowStore.getState();

    const firstId = store.openWindow('app-builder', {
      title: 'Builder - App A',
      metadata: { appId: 'app-a' },
    });
    expect(firstId).toBeTruthy();

    // Opening again returns the same singleton id and does NOT apply new metadata.
    const secondId = useWindowStore.getState().openWindow('app-builder', {
      title: 'Builder - App B',
      metadata: { appId: 'app-b' },
    });
    expect(secondId).toBe(firstId);

    const stale = useWindowStore.getState().windows.find((w) => w.id === firstId);
    expect(stale?.metadata?.appId).toBe('app-a');

    // The fix: explicitly push the new metadata/title onto the singleton window.
    useWindowStore.getState().updateWindow(secondId, {
      title: 'Builder - App B',
      metadata: { appId: 'app-b' },
    });

    const updated = useWindowStore.getState().windows.find((w) => w.id === firstId);
    expect(updated?.metadata?.appId).toBe('app-b');
    expect(updated?.title).toBe('Builder - App B');
  });
});
