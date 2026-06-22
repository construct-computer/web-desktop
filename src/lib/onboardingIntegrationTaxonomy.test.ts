import { describe, expect, it } from 'vitest';
import {
  scoreCatalogForOnboarding,
  type CatalogToolkit,
} from './onboardingIntegrationTaxonomy';

function toolkit(
  slug: string,
  name: string,
  category: string,
  extra: Partial<CatalogToolkit> = {},
): CatalogToolkit {
  return {
    slug,
    name,
    description: `${name} description`,
    logo: `https://logo.test/${slug}.png`,
    connectable: true,
    tools_count: 10,
    categories: [{ name: category, slug: category }],
    ...extra,
  };
}

const FIXTURE_CATALOG: CatalogToolkit[] = [
  toolkit('gmail', 'Gmail', 'email'),
  toolkit('github', 'GitHub', 'developer-tools'),
  toolkit('linear', 'Linear', 'developer-tools'),
  toolkit('hubspot', 'HubSpot', 'crm'),
  toolkit('salesforce', 'Salesforce', 'crm'),
  toolkit('calendly', 'Calendly', 'scheduling-&-booking'),
  toolkit('perplexity', 'Perplexity', 'artificial-intelligence'),
  toolkit('notion', 'Notion', 'productivity'),
  toolkit('googledocs', 'Google Docs', 'productivity'),
  toolkit('outlook', 'Outlook', 'email'),
];

describe('scoreCatalogForOnboarding', () => {
  it('returns empty when no goals selected', () => {
    const result = scoreCatalogForOnboarding({ role: 'founder' }, FIXTURE_CATALOG);
    expect(result.candidates).toEqual([]);
    expect(result.rankedPool).toEqual([]);
  });

  it('ranks sales + email toward CRM and inbox apps, not github', () => {
    const result = scoreCatalogForOnboarding(
      { role: 'sales', goals: ['email'] },
      FIXTURE_CATALOG,
    );
    const slugs = result.candidates.map((c) => c.slug);
    expect(slugs).toContain('gmail');
    expect(slugs).toContain('hubspot');
    expect(slugs).not.toContain('github');
  });

  it('ranks engineer + coding toward github and linear', () => {
    const result = scoreCatalogForOnboarding(
      { role: 'engineer', goals: ['coding'] },
      FIXTURE_CATALOG,
    );
    const slugs = result.candidates.map((c) => c.slug);
    expect(slugs.indexOf('github')).toBeLessThan(3);
    expect(slugs.indexOf('linear')).toBeLessThan(3);
  });

  it('does not duplicate slugs', () => {
    const result = scoreCatalogForOnboarding(
      { role: 'founder', goals: ['email', 'scheduling', 'documents'] },
      FIXTURE_CATALOG,
    );
    const slugs = result.candidates.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('caps at 9 display candidates', () => {
    const bigCatalog = [
      ...FIXTURE_CATALOG,
      ...Array.from({ length: 20 }, (_, i) => toolkit(`app${i}`, `App ${i}`, 'productivity')),
    ];
    const result = scoreCatalogForOnboarding(
      { role: 'founder', goals: ['research', 'documents', 'email'] },
      bigCatalog,
    );
    expect(result.candidates.length).toBeLessThanOrEqual(9);
  });
});
