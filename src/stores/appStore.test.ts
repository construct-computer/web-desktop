import { describe, expect, it, vi } from 'vitest';
import {
  getLocalAppIframeRefs,
  localAppIframeRefKey,
  localAppIframeRefs,
  localAppsToDefinitions,
  postToLocalAppIframes,
  reloadLocalAppIframes,
} from './appStore';
import type { LocalApp } from '@/services/api';

describe('localAppsToDefinitions', () => {
  it('uses composed local app icon urls without manifest window sizing', () => {
    const apps: LocalApp[] = [{
      id: 'construct-builder-gallery',
      icon_url: 'data:image/svg+xml,%3Csvg%3Ecomposed%3C%2Fsvg%3E',
      manifest: {
        version: 2,
        name: 'Construct Builder Gallery',
        description: 'Inspect Construct Builder components.',
        icon: 'icon.svg',
        iconBackground: 'white',
        window: { width: 1120, height: 760, minWidth: 760, minHeight: 560 },
        ui: { renderer: 'construct-hosted', spec: 'app.construct.json', kit: 'construct-v2' },
        tools: [{ name: 'refresh_gallery' }],
      },
    }];

    const [definition] = localAppsToDefinitions(apps);

    expect(definition.icon).toBe(apps[0].icon_url);
    expect(definition.appMetadata?.appId).toBe('construct-builder-gallery');
    expect(definition.appMetadata?.ui).toEqual({
      type: 'static',
      entry: 'index.html',
    });
  });
});

describe('local app iframe registry helpers', () => {
  it('targets reloads and bridge messages to the requested app only', () => {
    const appOneWindow = { src: '/one', contentWindow: { postMessage: vi.fn() } } as any;
    const appTwoWindow = { src: '/two', contentWindow: { postMessage: vi.fn() } } as any;
    localAppIframeRefs.clear();
    localAppIframeRefs.set(localAppIframeRefKey('win-1', 'app-one'), { current: appOneWindow });
    localAppIframeRefs.set(localAppIframeRefKey('win-2', 'app-two'), { current: appTwoWindow });

    expect(getLocalAppIframeRefs('app-one')).toHaveLength(1);
    reloadLocalAppIframes('app-one');
    postToLocalAppIframes('app-one', { type: 'construct:test' });

    expect(appOneWindow.contentWindow.postMessage).toHaveBeenCalledWith({ type: 'construct:test' }, '*');
    expect(appTwoWindow.contentWindow.postMessage).not.toHaveBeenCalled();

    localAppIframeRefs.clear();
  });
});
