import type { OnboardingProfile } from '@/lib/onboarding';
import type { CatalogToolkit, OnboardingIntegrationCandidate } from '@/lib/onboardingIntegrationTaxonomy';

const CATALOG_STORAGE_KEY = 'construct-onboarding-composio-catalog';
const RECS_STORAGE_PREFIX = 'construct-onboarding-recs:';

let memoryCatalog: CatalogToolkit[] | null = null;

export function profileRecommendationsKey(profile: OnboardingProfile): string {
  const goals = [...(profile.goals ?? [])].sort().join(',');
  return `${RECS_STORAGE_PREFIX}${profile.role ?? ''}:${goals}`;
}

export function getMemoryCatalog(): CatalogToolkit[] | null {
  return memoryCatalog;
}

export function setMemoryCatalog(toolkits: CatalogToolkit[]): void {
  memoryCatalog = toolkits;
}

export function readCatalogFromSession(): CatalogToolkit[] | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { toolkits?: CatalogToolkit[] };
    return Array.isArray(parsed.toolkits) ? parsed.toolkits : null;
  } catch {
    return null;
  }
}

export function writeCatalogToSession(toolkits: CatalogToolkit[]): void {
  memoryCatalog = toolkits;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify({ toolkits, at: Date.now() }));
  } catch {
    // best-effort
  }
}

export type CachedRecommendations = {
  candidates: OnboardingIntegrationCandidate[];
  rankedPool: string[];
  at: number;
};

export function readRecommendationsFromSession(profile: OnboardingProfile): CachedRecommendations | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(profileRecommendationsKey(profile));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRecommendations;
    if (!Array.isArray(parsed.candidates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRecommendationsToSession(
  profile: OnboardingProfile,
  data: Omit<CachedRecommendations, 'at'>,
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      profileRecommendationsKey(profile),
      JSON.stringify({ ...data, at: Date.now() }),
    );
  } catch {
    // best-effort
  }
}

export function clearOnboardingCatalogSessionCache(): void {
  memoryCatalog = null;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CATALOG_STORAGE_KEY);
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(RECS_STORAGE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // best-effort
  }
}
