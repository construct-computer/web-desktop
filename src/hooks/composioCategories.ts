/** Maps our legacy browse buckets → Composio category ids (Feb 2026 taxonomy). */
export const LEGACY_TO_COMPOSIO_CATEGORY: Record<string, string> = {
  productivity: 'productivity',
  communication: 'email',
  'dev-tools': 'developer-tools',
  data: 'file-management-&-storage',
  search: 'ai-web-scraping',
  utilities: 'productivity',
  shopping: 'ecommerce',
  finance: 'accounting',
  media: 'images-&-design',
  'ai-tools': 'artificial-intelligence',
  integrations: 'developer-tools',
  games: 'action-rpg',
};

export type ComposioCategoryRef = { name?: string; slug?: string; id?: string };

export function resolvePrimaryComposioCategoryId(
  categories?: ComposioCategoryRef[],
): string | null {
  if (!categories?.length) return null;
  for (const cat of categories) {
    const id = (cat.slug || cat.id || '').trim().toLowerCase();
    if (id) return id;
  }
  return null;
}

export function mapLegacyCategoryToComposio(category: string): string {
  return LEGACY_TO_COMPOSIO_CATEGORY[category] || category;
}

/** Title-case fallback when Composio label lookup is missing */
export function formatCategoryLabel(categoryId: string): string {
  if (!categoryId || categoryId === 'all') return 'All';
  return categoryId
    .split('-')
    .map((part) => part.replace(/&/g, ' & ').split(' ').map((w) =>
      w ? w.charAt(0).toUpperCase() + w.slice(1) : w,
    ).join(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function categoryDisplayName(
  categoryId: string,
  labels: Record<string, string>,
): string {
  if (categoryId === 'all') return 'All';
  return labels[categoryId] || formatCategoryLabel(categoryId);
}

export type BrowseCategoryNavItem = { id: string; label: string };

/** Minimum apps in a category before it appears in browse nav / home sections */
export const MIN_CATEGORY_APPS = 6;

export function categoryMeetsBrowseThreshold(count: number): boolean {
  return count >= MIN_CATEGORY_APPS;
}

export function buildBrowseCategoryNav(
  apps: Array<{ category: string }>,
  labels: Record<string, string>,
): BrowseCategoryNavItem[] {
  const counts = new Map<string, number>();
  for (const app of apps) {
    const id = app.category;
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  const sorted = [...counts.entries()]
    .filter(([, count]) => categoryMeetsBrowseThreshold(count))
    .map(([id]) => ({
      id,
      label: categoryDisplayName(id, labels),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  return [{ id: 'all', label: 'All' }, ...sorted];
}
