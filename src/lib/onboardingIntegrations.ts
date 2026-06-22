import * as api from '@/services/api';
import { normalizeAuthSchemes } from '@/components/apps/composioAuthUtils';
import { seedToolkitCache } from '@/lib/composioToolkitCache';
import type { ComposioAuthPrefetch } from '@/hooks/useComposioAuth';
import {
  ONBOARDING_INTEGRATION_CATALOG,
  type OnboardingIntegrationEntry,
} from '@/lib/onboarding';

const OAUTH_CAP = 9;
const ONBOARDING_CANDIDATE_POOL_LIMIT = 15;

/** Fixed 3×3 integration grid in onboarding. */
export const ONBOARDING_INTEGRATION_COLUMNS = 3;
export const ONBOARDING_INTEGRATION_DISPLAY_COUNT = 9;

type ComposioToolkitAuthMetaData = {
  name?: string;
  description?: string;
  logo?: string;
  auth_schemes?: string[];
  auth_config?: Array<{
    mode: string;
    fields: Array<{ name: string; displayName: string; description?: string; required: boolean }>;
  }>;
  composio_managed_schemes?: string[];
};

export function toolkitHasManagedOAuth(data: {
  auth_schemes?: string[];
  composio_managed_schemes?: string[];
}): boolean {
  const schemes = normalizeAuthSchemes(data.auth_schemes ?? []);
  const managed = new Set(normalizeAuthSchemes(data.composio_managed_schemes ?? []));
  return schemes.some((s) => (s === 'OAUTH2' || s === 'OAUTH1') && managed.has(s));
}

export type OnboardingIntegrationReady = OnboardingIntegrationEntry & {
  authPrefetch: ComposioAuthPrefetch;
  logo?: string;
};

export type OnboardingIntegrationDisplay = OnboardingIntegrationEntry & {
  logoUrl?: string;
  authPrefetch?: ComposioAuthPrefetch;
  authPending: boolean;
};

type SlugCacheEntry = OnboardingIntegrationReady | 'not_oauth';

const slugCache = new Map<string, SlugCacheEntry>();
const inFlightBySlugs = new Map<string, Promise<OnboardingIntegrationReady[]>>();

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function catalogMapFrom(entries?: OnboardingIntegrationEntry[]): Map<string, OnboardingIntegrationEntry> {
  const map = new Map(
    (entries ?? ONBOARDING_INTEGRATION_CATALOG.map((c) => ({
      slug: c.slug,
      label: c.label,
      tagline: c.tagline,
    }))).map((c) => [normalizeSlug(c.slug), c] as const),
  );
  return map;
}

function buildReadyEntry(
  slug: string,
  catalog: Map<string, OnboardingIntegrationEntry>,
  data: ComposioToolkitAuthMetaData,
): OnboardingIntegrationReady | null {
  if (!toolkitHasManagedOAuth(data)) return null;
  const meta = catalog.get(normalizeSlug(slug));
  return {
    slug,
    label: meta?.label ?? data.name ?? slug,
    tagline: meta?.tagline ?? data.description ?? '',
    logo: data.logo,
    authPrefetch: {
      authSchemes: normalizeAuthSchemes(data.auth_schemes ?? []),
      authConfig: data.auth_config,
      composioManagedSchemes: normalizeAuthSchemes(data.composio_managed_schemes ?? []),
    },
  };
}

function seedSlugCache(slug: string, entry: SlugCacheEntry): void {
  slugCache.set(normalizeSlug(slug), entry);
  if (entry !== 'not_oauth') {
    seedToolkitCache({
      [entry.slug]: { name: entry.label, description: entry.tagline, logo: entry.logo },
    });
  }
}

function composeOAuthFromSlugs(slugs: string[]): OnboardingIntegrationReady[] {
  const ready: OnboardingIntegrationReady[] = [];
  for (const slug of slugs) {
    const cached = slugCache.get(normalizeSlug(slug));
    if (cached && cached !== 'not_oauth') ready.push(cached);
    if (ready.length >= OAUTH_CAP) break;
  }
  return ready;
}

function allSlugsResolved(slugs: string[]): boolean {
  return slugs.every((slug) => slugCache.has(normalizeSlug(slug)));
}

async function fetchMissingSlugAuthMeta(
  slugs: string[],
  catalog?: OnboardingIntegrationEntry[],
): Promise<SlugCacheEntry[]> {
  const catalogMap = catalogMapFrom(catalog);
  for (const slug of slugs) {
    if (!catalogMap.has(normalizeSlug(slug))) {
      catalogMap.set(normalizeSlug(slug), { slug, label: slug, tagline: '' });
    }
  }

  const missing = slugs.filter((slug) => !slugCache.has(normalizeSlug(slug)));
  if (missing.length === 0) {
    return slugs.map((slug) => slugCache.get(normalizeSlug(slug))!);
  }

  const res = await api.batchGetComposioToolkitAuthMeta(missing);
  const bySlug = new Map(
    (res.success && res.data?.toolkits ? res.data.toolkits : []).map((t) => [normalizeSlug(t.slug), t]),
  );

  for (const slug of missing) {
    const data = bySlug.get(normalizeSlug(slug));
    if (!data) {
      seedSlugCache(slug, 'not_oauth');
      continue;
    }
    const ready = buildReadyEntry(slug, catalogMap, data);
    seedSlugCache(slug, ready ?? 'not_oauth');
  }

  return slugs.map((slug) => slugCache.get(normalizeSlug(slug))!);
}

function composeOAuthFromRankedPool(rankedPool: string[]): OnboardingIntegrationReady[] {
  const ready: OnboardingIntegrationReady[] = [];
  for (const slug of rankedPool) {
    const cached = slugCache.get(normalizeSlug(slug));
    if (cached && cached !== 'not_oauth') ready.push(cached);
    if (ready.length >= OAUTH_CAP) break;
  }
  return ready;
}

/**
 * Prefetch OAuth-ready integrations with backfill from an ordered ranked pool.
 */
export async function prefetchOAuthIntegrationsWithBackfill(
  rankedPool: string[],
  catalog?: OnboardingIntegrationEntry[],
): Promise<OnboardingIntegrationReady[]> {
  const uniquePool = [...new Set(rankedPool.map(normalizeSlug))];
  if (uniquePool.length === 0) return [];

  const key = uniquePool.join('\0');
  const pending = inFlightBySlugs.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const initialBatch = uniquePool.slice(0, ONBOARDING_CANDIDATE_POOL_LIMIT);
    await fetchMissingSlugAuthMeta(initialBatch, catalog);
    let ready = composeOAuthFromRankedPool(uniquePool);
    if (ready.length >= OAUTH_CAP) return ready;

    let idx = initialBatch.length;
    while (ready.length < OAUTH_CAP && idx < uniquePool.length) {
      const batch = uniquePool.slice(idx, idx + 5);
      idx += batch.length;
      await fetchMissingSlugAuthMeta(batch, catalog);
      ready = composeOAuthFromRankedPool(uniquePool);
    }

    return ready;
  })();

  inFlightBySlugs.set(key, promise);
  return promise.finally(() => { inFlightBySlugs.delete(key); });
}

/**
 * Prefetch OAuth-ready integrations for the given slug list (preserves order, capped at 9).
 * Uses per-slug cache and a single batch auth-meta request for missing slugs.
 */
export function prefetchOAuthIntegrations(
  slugs: string[],
  catalog?: OnboardingIntegrationEntry[],
): Promise<OnboardingIntegrationReady[]> {
  return prefetchOAuthIntegrationsWithBackfill(slugs, catalog);
}

/** Synchronous read when all slugs in the list are cached. */
export function getCachedOAuthIntegrations(
  slugs: string[],
): OnboardingIntegrationReady[] | null {
  if (!allSlugsResolved(slugs)) return null;
  return composeOAuthFromSlugs(slugs);
}

/** Whether every slug has a resolved cache entry (OAuth or not). */
export function areSlugsResolved(slugs: string[]): boolean {
  return allSlugsResolved(slugs);
}

/** Build display tiles from catalog entries, merging any cached auth metadata. */
export function buildIntegrationDisplayTiles(
  candidates: OnboardingIntegrationEntry[],
): OnboardingIntegrationDisplay[] {
  return candidates.map((entry) => {
    const cached = slugCache.get(normalizeSlug(entry.slug));
    if (cached && cached !== 'not_oauth') {
      return {
        slug: entry.slug,
        label: entry.label,
        tagline: entry.tagline,
        logoUrl: cached.logo,
        authPrefetch: cached.authPrefetch,
        authPending: false,
      };
    }
    return {
      ...entry,
      authPending: !allSlugsResolved([entry.slug]),
    };
  });
}

/** OAuth-ready integrations after all candidate slugs are resolved. */
export function resolveOAuthIntegrations(
  candidates: OnboardingIntegrationEntry[],
): OnboardingIntegrationReady[] | null {
  const slugs = candidates.map((c) => c.slug);
  if (!allSlugsResolved(slugs)) return null;
  return candidates
    .map((c) => slugCache.get(normalizeSlug(c.slug)))
    .filter((e): e is OnboardingIntegrationReady => Boolean(e && e !== 'not_oauth'));
}

/**
 * Keep toolkits that support Composio-managed OAuth, preserving input order, capped at 9.
 */
export async function filterOAuthToolkits(slugs: string[]): Promise<string[]> {
  const ready = await prefetchOAuthIntegrations(slugs);
  return ready.map((r) => r.slug);
}

/** Warm auth cache using full composio catalog slugs from session (idempotent). */
export function prefetchAllCatalogSlugs(): void {
  const sessionCatalog = typeof sessionStorage !== 'undefined'
    ? (() => {
        try {
          const raw = sessionStorage.getItem('construct-onboarding-composio-catalog');
          if (!raw) return null;
          const parsed = JSON.parse(raw) as { toolkits?: Array<{ slug: string; name: string; description?: string }> };
          return parsed.toolkits ?? null;
        } catch {
          return null;
        }
      })()
    : null;

  const catalog = (sessionCatalog ?? ONBOARDING_INTEGRATION_CATALOG).map((c) => {
    if ('label' in c) {
      return { slug: c.slug, label: c.label, tagline: c.tagline };
    }
    return { slug: c.slug, label: c.name, tagline: c.description ?? '' };
  });

  const slugs = catalog.map((c) => c.slug).slice(0, 15);
  void prefetchOAuthIntegrationsWithBackfill(slugs, catalog);
}

/** @internal Test helper — clears module prefetch cache. */
export function clearOnboardingIntegrationsCache(): void {
  slugCache.clear();
  inFlightBySlugs.clear();
}

export function getExpandSide(index: number, columnsPerRow: number): 'left' | 'right' {
  const col = index % columnsPerRow;
  if (col === 0) return 'right';
  if (col === columnsPerRow - 1) return 'left';
  return col >= columnsPerRow / 2 ? 'left' : 'right';
}

/** Index of the grid cell covered when `expandedIndex` opens its overlay, or -1. */
export function getCoveredNeighborIndex(
  expandedIndex: number,
  columnsPerRow: number,
  total: number,
): number {
  if (expandedIndex < 0 || expandedIndex >= total) return -1;
  const side = getExpandSide(expandedIndex, columnsPerRow);
  const neighbor = side === 'right' ? expandedIndex + 1 : expandedIndex - 1;
  if (neighbor < 0 || neighbor >= total) return -1;
  if (Math.floor(neighbor / columnsPerRow) !== Math.floor(expandedIndex / columnsPerRow)) return -1;
  return neighbor;
}
