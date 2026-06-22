import * as api from '@/services/api';
import type { OnboardingIntegrationEntry, OnboardingProfile } from '@/lib/onboarding';
import {
  readCatalogFromSession,
  readRecommendationsFromSession,
  setMemoryCatalog,
  writeCatalogToSession,
  writeRecommendationsToSession,
  getMemoryCatalog,
} from '@/lib/onboardingCatalogCache';
import {
  scoreCatalogForOnboarding,
  type CatalogToolkit,
  type OnboardingIntegrationCandidate,
} from '@/lib/onboardingIntegrationTaxonomy';
import { prefetchOAuthIntegrationsWithBackfill } from '@/lib/onboardingIntegrations';

function mapCandidateToEntry(c: OnboardingIntegrationCandidate): OnboardingIntegrationEntry {
  return { slug: c.slug, label: c.label, tagline: c.tagline };
}

const FALLBACK_ENTRIES: OnboardingIntegrationEntry[] = [
  { slug: 'gmail', label: 'Gmail', tagline: 'Read and triage your inbox' },
  { slug: 'googlecalendar', label: 'Google Calendar', tagline: 'Schedule and manage events' },
  { slug: 'github', label: 'GitHub', tagline: 'Repos, issues, and PRs' },
  { slug: 'linear', label: 'Linear', tagline: 'Track issues and projects' },
  { slug: 'notion', label: 'Notion', tagline: 'Notes and docs in one place' },
  { slug: 'googledocs', label: 'Google Docs', tagline: 'Draft and edit docs' },
  { slug: 'googlesheets', label: 'Google Sheets', tagline: 'Spreadsheets and data' },
  { slug: 'googledrive', label: 'Google Drive', tagline: 'Files and folders' },
  { slug: 'outlook', label: 'Outlook', tagline: 'Microsoft email and calendar' },
];

function fallbackCatalogEntries(): OnboardingIntegrationEntry[] {
  return FALLBACK_ENTRIES;
}

function catalogToolkitFromApi(item: api.ComposioToolkitSummary): CatalogToolkit {
  return {
    slug: item.slug,
    name: item.name,
    description: item.description,
    logo: item.logo ?? '',
    auth_schemes: item.auth_schemes,
    connectable: item.connectable,
    tools_count: item.tools_count,
    categories: item.categories,
  };
}

/** Load composio catalog into memory/session (idempotent). */
export async function ensureComposioCatalogCached(): Promise<CatalogToolkit[]> {
  const mem = getMemoryCatalog();
  if (mem?.length) return mem;

  const session = readCatalogFromSession();
  if (session?.length) {
    setMemoryCatalog(session);
    return session;
  }

  const res = await api.listComposioCatalog();
  if (res.success && res.data?.toolkits?.length) {
    const toolkits = res.data.toolkits.map(catalogToolkitFromApi);
    writeCatalogToSession(toolkits);
    return toolkits;
  }

  return [];
}

/** Synchronous recommendations from cached catalog; falls back to static list. */
export function recommendIntegrationsSync(profile: OnboardingProfile): {
  candidates: OnboardingIntegrationEntry[];
  rankedPool: string[];
} {
  const cachedRecs = readRecommendationsFromSession(profile);
  if (cachedRecs?.candidates.length) {
    return {
      candidates: cachedRecs.candidates.map(mapCandidateToEntry),
      rankedPool: cachedRecs.rankedPool,
    };
  }

  const catalog = getMemoryCatalog() ?? readCatalogFromSession() ?? [];
  if (catalog.length > 0 && (profile.goals?.length ?? 0) > 0) {
    const scored = scoreCatalogForOnboarding(profile, catalog);
    if (scored.candidates.length > 0) {
      return {
        candidates: scored.candidates.map(mapCandidateToEntry),
        rankedPool: scored.rankedPool,
      };
    }
  }

  const fallback = fallbackCatalogEntries().slice(0, 9);
  return { candidates: fallback, rankedPool: fallback.map((c) => c.slug) };
}

/** Background reconcile: server recommendations + OAuth prefetch with backfill. */
export async function refreshOnboardingRecommendations(profile: OnboardingProfile): Promise<void> {
  if ((profile.goals?.length ?? 0) === 0) return;

  await ensureComposioCatalogCached();

  const apiRes = await api.recommendOnboardingIntegrations(profile);
  let candidates: OnboardingIntegrationEntry[];
  let rankedPool: string[];

  if (apiRes.success && apiRes.data?.candidates?.length) {
    candidates = apiRes.data.candidates.map(mapCandidateToEntry);
    rankedPool = apiRes.data.rankedPool ?? candidates.map((c) => c.slug);
    writeRecommendationsToSession(profile, {
      candidates: apiRes.data.candidates,
      rankedPool,
    });
  } else {
    const sync = recommendIntegrationsSync(profile);
    candidates = sync.candidates;
    rankedPool = sync.rankedPool;
  }

  await prefetchOAuthIntegrationsWithBackfill(rankedPool, candidates);
}
