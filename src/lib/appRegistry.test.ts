import { describe, expect, it } from 'vitest';
import {
  DESKTOP_DOCK_APP_IDS,
  MOBILE_APP_BAR_APP_IDS,
  MOBILE_HOME_APP_IDS,
  SYSTEM_WINDOW_METADATA,
  getSystemAppsByIds,
} from './appRegistry';

describe('app registry navigation definitions', () => {
  it('resolves desktop dock apps in product order', () => {
    const apps = getSystemAppsByIds(DESKTOP_DOCK_APP_IDS);
    expect(apps.map((app) => app.id)).toEqual([...DESKTOP_DOCK_APP_IDS]);
  });

  it('resolves mobile app bar apps without desktop-only apps', () => {
    const apps = getSystemAppsByIds(MOBILE_APP_BAR_APP_IDS);
    expect(apps.map((app) => app.id)).toEqual(['app-registry', 'files', 'calendar', 'email']);
    expect(apps.some((app) => app.id === 'terminal')).toBe(false);
  });

  it('keeps every non-chat mobile home shortcut backed by a system app', () => {
    const appIds = MOBILE_HOME_APP_IDS.filter((id) => id !== 'chat');
    const apps = getSystemAppsByIds(appIds);
    expect(apps.map((app) => app.id)).toEqual(appIds);
  });

  it('has metadata for dynamic system windows used by mobile and desktop chrome', () => {
    expect(SYSTEM_WINDOW_METADATA.settings?.label).toBe('Settings');
    expect(SYSTEM_WINDOW_METADATA.memory?.icon).toBeTruthy();
    expect(SYSTEM_WINDOW_METADATA['access-control']?.label).toBe('Access Control');
  });
});
