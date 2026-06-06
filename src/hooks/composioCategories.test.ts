import { describe, expect, it } from 'vitest';
import {
  buildBrowseCategoryNav,
  MIN_CATEGORY_APPS,
  resolvePrimaryComposioCategoryId,
} from './composioCategories';

describe('composioCategories', () => {
  it('reads Composio category id field when slug is absent', () => {
    expect(resolvePrimaryComposioCategoryId([{ id: 'developer-tools', name: 'developer-tools' }]))
      .toBe('developer-tools');
  });

  it('builds nav from apps sorted alphabetically by label', () => {
    const crmApps = Array.from({ length: MIN_CATEGORY_APPS }, () => ({ category: 'crm' }));
    const nav = buildBrowseCategoryNav(
      [
        ...crmApps,
        { category: 'developer-tools' },
      ],
      { crm: 'CRM', 'developer-tools': 'Developer Tools' },
    );
    expect(nav).toEqual([
      { id: 'all', label: 'All' },
      { id: 'crm', label: 'CRM' },
    ]);
  });

  it('omits categories with fewer than the minimum app count', () => {
    const nav = buildBrowseCategoryNav(
      Array.from({ length: MIN_CATEGORY_APPS - 1 }, () => ({ category: 'email' })),
      { email: 'Email' },
    );
    expect(nav).toEqual([{ id: 'all', label: 'All' }]);
  });
});
