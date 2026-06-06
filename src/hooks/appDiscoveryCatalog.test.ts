import { describe, expect, it } from 'vitest';
import type { UnifiedApp } from './useAppDiscovery';
import {
  deduplicateComposioApps,
  filterBrowsableCatalog,
  isComposioConnectable,
  slicePopularApps,
  POPULAR_PER_CATEGORY,
} from './appDiscoveryCatalog';

function composioApp(overrides: Partial<UnifiedApp> & Pick<UnifiedApp, 'id' | 'name' | 'composioSlug'>): UnifiedApp {
  return {
    description: '',
    category: 'productivity',
    tags: ['integration'],
    source: 'composio',
    tools: [],
    hasUi: false,
    status: 'available',
    ...overrides,
  };
}

describe('appDiscoveryCatalog', () => {
  it('filters non-connectable catalog items', () => {
    const items = [
      { slug: 'a', name: 'A', description: '', connectable: true },
      { slug: 'b', name: 'B', description: '', auth_schemes: [] },
      { slug: 'c', name: 'C', description: '', no_auth: true },
    ];
    expect(filterBrowsableCatalog(items)).toHaveLength(2);
    expect(isComposioConnectable({ slug: 'x', name: 'X', description: '', no_auth: true })).toBe(true);
  });

  it('deduplicates composio apps by normalized name with quality scoring', () => {
    const apps = [
      composioApp({
        id: 'composio-polymarket_us',
        name: 'Polymarket US',
        composioSlug: 'polymarket_us',
        connectable: false,
      }),
      composioApp({
        id: 'composio-polymarket',
        name: 'Polymarket US',
        composioSlug: 'polymarket',
        connectable: true,
        authSchemes: ['OAUTH2'],
        toolCount: 44,
        composioLogo: 'https://example.com/logo.png',
      }),
    ];
    const result = deduplicateComposioApps(apps);
    expect(result).toHaveLength(1);
    expect(result[0].composioSlug).toBe('polymarket');
  });

  it('slices popular apps to the configured limit', () => {
    const apps = Array.from({ length: 15 }, (_, i) =>
      composioApp({
        id: `composio-${i}`,
        name: `App ${i}`,
        composioSlug: `app-${i}`,
      }),
    );
    expect(slicePopularApps(apps, POPULAR_PER_CATEGORY)).toHaveLength(10);
    expect(slicePopularApps(apps.slice(0, 5), POPULAR_PER_CATEGORY)).toHaveLength(5);
  });
});
