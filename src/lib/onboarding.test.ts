import { describe, expect, it, beforeEach } from 'vitest';
import { recommendIntegrationsSync } from './onboardingRecommendations';
import { writeCatalogToSession, clearOnboardingCatalogSessionCache } from './onboardingCatalogCache';
import { scoreCatalogForOnboarding, type CatalogToolkit } from './onboardingIntegrationTaxonomy';

const FIXTURE_CATALOG: CatalogToolkit[] = [
  {
    slug: 'gmail',
    name: 'Gmail',
    description: 'Read and triage your inbox',
    logo: 'https://logo.test/gmail.png',
    connectable: true,
    categories: [{ name: 'Email', slug: 'email' }],
  },
  {
    slug: 'github',
    name: 'GitHub',
    description: 'Repos and PRs',
    logo: 'https://logo.test/github.png',
    connectable: true,
    categories: [{ name: 'Dev', slug: 'developer-tools' }],
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    description: 'CRM',
    logo: 'https://logo.test/hubspot.png',
    connectable: true,
    categories: [{ name: 'CRM', slug: 'crm' }],
  },
];

beforeEach(() => {
  clearOnboardingCatalogSessionCache();
});

describe('recommendIntegrationsSync', () => {
  it('returns at most 9 candidates from cached catalog', () => {
    writeCatalogToSession(FIXTURE_CATALOG);
    const result = recommendIntegrationsSync({
      role: 'sales',
      goals: ['email', 'documents', 'coding'],
    });
    expect(result.candidates.length).toBeLessThanOrEqual(9);
  });

  it('falls back to static list when catalog missing', () => {
    const result = recommendIntegrationsSync({ goals: ['email'] });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.some((c) => c.slug === 'gmail')).toBe(true);
  });

  it('sync scorer matches taxonomy for fixture profile', () => {
    writeCatalogToSession(FIXTURE_CATALOG);
    const profile = { role: 'engineer' as const, goals: ['coding' as const] };
    const sync = recommendIntegrationsSync(profile);
    const scored = scoreCatalogForOnboarding(profile, FIXTURE_CATALOG);
    expect(sync.candidates.map((c) => c.slug)).toEqual(
      scored.candidates.map((c) => c.slug),
    );
  });
});
