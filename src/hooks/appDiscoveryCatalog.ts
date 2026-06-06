import type { ComposioCatalogItem, UnifiedApp } from './useAppDiscovery';

export const POPULAR_PER_CATEGORY = 10;
export const MAX_HOME_CATEGORY_SECTIONS = 12;

export function isComposioConnectable(item: ComposioCatalogItem): boolean {
  if (item.connectable != null) return item.connectable;
  return item.no_auth === true || (item.auth_schemes?.length ?? 0) > 0;
}

export function filterBrowsableCatalog(items: ComposioCatalogItem[]): ComposioCatalogItem[] {
  return items.filter(isComposioConnectable);
}

export function slicePopularApps(apps: UnifiedApp[], limit = POPULAR_PER_CATEGORY): UnifiedApp[] {
  return apps.slice(0, Math.min(limit, apps.length));
}

export function composioAppQualityScore(app: UnifiedApp): number {
  let score = 0;
  const connectable = app.connectable !== false
    && ((app.authSchemes?.length ?? 0) > 0 || app.tags?.includes('no-auth'));
  if (connectable) score += 100;
  if (app.composioLogo || (app.icon && app.icon.length > 0)) score += 10;
  score += Math.min(app.toolCount ?? app.tools?.length ?? 0, 50);
  if (app.featured) score += 5;
  return score;
}

export function pickBetterComposioApp(current: UnifiedApp, candidate: UnifiedApp): UnifiedApp {
  return composioAppQualityScore(candidate) > composioAppQualityScore(current) ? candidate : current;
}

export function deduplicateComposioApps(apps: UnifiedApp[]): UnifiedApp[] {
  const normalize = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '')
      .replace(/(mcp|server|integration|tool|api|bot|app|plugin)$/g, '');

  const bySlug = new Map<string, UnifiedApp>();
  for (const app of apps) {
    const slug = app.composioSlug?.toLowerCase();
    if (!slug) continue;
    const prev = bySlug.get(slug);
    bySlug.set(slug, prev ? pickBetterComposioApp(prev, app) : app);
  }

  const byName = new Map<string, UnifiedApp>();
  for (const app of bySlug.values()) {
    const key = normalize(app.name);
    if (!key) continue;
    const prev = byName.get(key);
    byName.set(key, prev ? pickBetterComposioApp(prev, app) : app);
  }

  return [...byName.values()];
}

export function sortAppsByQuality(apps: UnifiedApp[]): UnifiedApp[] {
  return [...apps].sort((a, b) => {
    const scoreDiff = composioAppQualityScore(b) - composioAppQualityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function groupAppsByCategory(
  apps: UnifiedApp[],
  order?: string[],
): Array<[string, UnifiedApp[]]> {
  const groups = new Map<string, UnifiedApp[]>();
  for (const app of apps) {
    const cat = app.category;
    if (!cat) continue;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(app);
  }

  const sortedIds = order?.filter((c) => c !== 'all' && groups.has(c))
    ?? [...groups.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return sortedIds.map((c) => [c, sortAppsByQuality(groups.get(c)!)] as const);
}

export function sortCategoryGroupsBySize(
  groups: Array<[string, UnifiedApp[]]>,
): Array<[string, UnifiedApp[]]> {
  return [...groups].sort((a, b) => {
    const countDiff = b[1].length - a[1].length;
    if (countDiff !== 0) return countDiff;
    return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
  });
}
