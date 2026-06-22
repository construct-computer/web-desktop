import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ONBOARDING_INTEGRATION_CATALOG } from './onboarding';
import {
  filterOAuthToolkits,
  getCachedOAuthIntegrations,
  getCoveredNeighborIndex,
  getExpandSide,
  prefetchOAuthIntegrations,
  prefetchOAuthIntegrationsWithBackfill,
  clearOnboardingIntegrationsCache,
} from './onboardingIntegrations';
import { peekToolkitDetail, clearComposioToolkitCache } from './composioToolkitCache';
import { writeCatalogToSession, clearOnboardingCatalogSessionCache } from './onboardingCatalogCache';

vi.mock('@/services/api', () => ({
  batchGetComposioToolkitAuthMeta: vi.fn(),
}));

import * as api from '@/services/api';

const batchAuthMeta = vi.mocked(api.batchGetComposioToolkitAuthMeta);

function oauthToolkit(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    name: slug,
    description: '',
    logo: `https://logo.test/${slug}.png`,
    auth_schemes: ['OAUTH2'],
    composio_managed_schemes: ['OAUTH2'],
    ...overrides,
  };
}

beforeEach(() => {
  batchAuthMeta.mockReset();
  clearComposioToolkitCache();
  clearOnboardingIntegrationsCache();
  clearOnboardingCatalogSessionCache();
});

describe('filterOAuthToolkits', () => {
  it('keeps OAuth-managed toolkits and drops API-only', async () => {
    batchAuthMeta.mockResolvedValue({
      success: true,
      data: {
        toolkits: [
          oauthToolkit('gmail'),
          { slug: 'notion', name: 'Notion', description: '', logo: '', auth_schemes: ['API_KEY'], composio_managed_schemes: [] },
        ],
      },
    });

    const result = await filterOAuthToolkits(['gmail', 'notion', 'missing']);
    expect(result).toEqual(['gmail']);
  });

  it('preserves rank order and caps at 9', async () => {
    batchAuthMeta.mockImplementation(async (slugs: string[]) => ({
      success: true,
      data: {
        toolkits: slugs.map((slug) => oauthToolkit(slug)),
      },
    }));

    const slugs = Array.from({ length: 12 }, (_, i) => `app${i}`);
    const result = await filterOAuthToolkits(slugs);
    expect(result).toHaveLength(9);
    expect(result[0]).toBe('app0');
    expect(result[8]).toBe('app8');
  });
});

describe('prefetchOAuthIntegrations', () => {
  it('returns auth prefetch payload and seeds composio toolkit cache', async () => {
    batchAuthMeta.mockResolvedValue({
      success: true,
      data: {
        toolkits: [
          oauthToolkit('gmail', { name: 'Gmail', description: 'Email' }),
        ],
      },
    });

    const catalog = [{ slug: 'gmail', label: 'Gmail', tagline: 'Read and triage your inbox' }];
    const ready = await prefetchOAuthIntegrations(['gmail', 'missing'], catalog);

    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({
      slug: 'gmail',
      label: 'Gmail',
      tagline: 'Read and triage your inbox',
      logo: 'https://logo.test/gmail.png',
      authPrefetch: {
        authSchemes: ['OAUTH2'],
        composioManagedSchemes: ['OAUTH2'],
      },
    });
    expect(peekToolkitDetail('gmail')).toMatchObject({
      name: 'Gmail',
      logo: 'https://logo.test/gmail.png',
    });
    expect(batchAuthMeta).toHaveBeenCalledTimes(1);
  });

  it('getCachedOAuthIntegrations returns synchronously after prefetch', async () => {
    batchAuthMeta.mockResolvedValue({
      success: true,
      data: {
        toolkits: [oauthToolkit('gmail'), oauthToolkit('slack')],
      },
    });

    const slugs = ['gmail', 'slack'];
    expect(getCachedOAuthIntegrations(slugs)).toBeNull();

    await prefetchOAuthIntegrations(slugs);

    const cached = getCachedOAuthIntegrations(slugs);
    expect(cached).not.toBeNull();
    expect(cached!.map((r) => r.slug)).toEqual(['gmail', 'slack']);
  });

  it('prefetchOAuthIntegrationsWithBackfill fills from ranked pool', async () => {
    batchAuthMeta.mockImplementation(async (slugs: string[]) => ({
      success: true,
      data: {
        toolkits: slugs
          .filter((slug) => slug !== 'notion')
          .map((slug) => oauthToolkit(slug)),
      },
    }));

    const rankedPool = ['gmail', 'notion', 'github'];
    const catalog = rankedPool.map((slug) => ({ slug, label: slug, tagline: '' }));
    const ready = await prefetchOAuthIntegrationsWithBackfill(rankedPool, catalog);
    expect(ready.map((r) => r.slug)).toEqual(['gmail', 'github']);
  });

  it('prefetchAllCatalogSlugs uses session catalog when present', async () => {
    writeCatalogToSession(
      ONBOARDING_INTEGRATION_CATALOG.map((c) => ({
        slug: c.slug,
        name: c.label,
        description: c.tagline,
        logo: `https://logo.test/${c.slug}.png`,
        connectable: true,
      })),
    );

    batchAuthMeta.mockImplementation(async (slugs: string[]) => ({
      success: true,
      data: { toolkits: slugs.map((slug) => oauthToolkit(slug)) },
    }));

    const { prefetchAllCatalogSlugs } = await import('./onboardingIntegrations');
    prefetchAllCatalogSlugs();
    await prefetchOAuthIntegrations(['gmail']);
    expect(batchAuthMeta.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getExpandSide', () => {
  it('expands right from first column', () => {
    expect(getExpandSide(0, 4)).toBe('right');
    expect(getExpandSide(4, 4)).toBe('right');
  });

  it('expands left from last column', () => {
    expect(getExpandSide(3, 4)).toBe('left');
    expect(getExpandSide(7, 4)).toBe('left');
  });

  it('expands left from right half of row', () => {
    expect(getExpandSide(2, 4)).toBe('left');
    expect(getExpandSide(1, 4)).toBe('right');
  });
});

describe('getCoveredNeighborIndex', () => {
  it('returns right neighbor when expanding right', () => {
    expect(getCoveredNeighborIndex(0, 4, 8)).toBe(1);
    expect(getCoveredNeighborIndex(1, 4, 8)).toBe(2);
  });

  it('returns left neighbor when expanding left', () => {
    expect(getCoveredNeighborIndex(3, 4, 8)).toBe(2);
    expect(getCoveredNeighborIndex(2, 4, 8)).toBe(1);
  });

  it('returns -1 when neighbor is out of bounds', () => {
    expect(getCoveredNeighborIndex(4, 4, 5)).toBe(-1);
    expect(getCoveredNeighborIndex(-1, 4, 8)).toBe(-1);
  });
});
