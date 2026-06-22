import type { OnboardingGoal, OnboardingProfile, OnboardingRole } from '@/lib/onboarding';

export type TaxonomySignal = {
  slugs: readonly string[];
  categorySlugs: readonly string[];
  nameKeywords: readonly string[];
};

export type CatalogToolkit = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  auth_schemes?: string[];
  connectable?: boolean;
  tools_count?: number;
  categories?: Array<{ name: string; slug: string }>;
};

export type OnboardingIntegrationCandidate = {
  slug: string;
  label: string;
  tagline: string;
  logo: string;
  auth_schemes?: string[];
};

export const ONBOARDING_DISPLAY_LIMIT = 9;
export const ONBOARDING_CANDIDATE_POOL_LIMIT = 15;
export const MAX_APPS_PER_CATEGORY = 2;

const HIDDEN_TOOLKITS = new Set(['slack', 'telegram']);

const SLUG_BOOST = 4;
const CATEGORY_BOOST = 2;
const KEYWORD_BOOST = 1;
const MAX_KEYWORD_HITS = 4;

const DEFAULT_FALLBACK_SLUGS = [
  'gmail', 'notion', 'github', 'googlecalendar', 'googledocs',
  'googlesheets', 'linear', 'hubspot',
] as const;

export const ROLE_TAXONOMY: Record<OnboardingRole, TaxonomySignal> = {
  founder: {
    slugs: ['gmail', 'googlecalendar', 'notion', 'hubspot', 'stripe'],
    categorySlugs: ['productivity', 'crm', 'email', 'scheduling-&-booking'],
    nameKeywords: ['calendar', 'crm', 'sales', 'strategy'],
  },
  engineer: {
    slugs: ['github', 'gitlab', 'linear', 'sentry', 'vercel', 'supabase'],
    categorySlugs: ['developer-tools', 'ticketing', 'monitoring'],
    nameKeywords: ['code', 'deploy', 'repository', 'issue'],
  },
  ops: {
    slugs: ['asana', 'monday', 'googlesheets', 'airtable', 'zapier'],
    categorySlugs: ['productivity', 'project-management', 'workflow'],
    nameKeywords: ['workflow', 'process', 'spreadsheet', 'automation'],
  },
  marketing: {
    slugs: ['mailchimp', 'hubspot', 'googleads', 'metaads', 'linkedin'],
    categorySlugs: ['marketing', 'social-media', 'advertising'],
    nameKeywords: ['campaign', 'ads', 'marketing', 'content'],
  },
  sales: {
    slugs: ['hubspot', 'salesforce', 'gmail', 'calendly', 'linkedin', 'pipedrive'],
    categorySlugs: ['crm', 'sales-&-customer-support', 'email'],
    nameKeywords: ['crm', 'pipeline', 'outreach', 'lead'],
  },
  student: {
    slugs: ['notion', 'googledocs', 'googlecalendar', 'googledrive'],
    categorySlugs: ['productivity', 'education'],
    nameKeywords: ['notes', 'document', 'calendar', 'research'],
  },
  other: {
    slugs: ['gmail', 'notion', 'googlecalendar'],
    categorySlugs: ['productivity', 'email'],
    nameKeywords: [],
  },
};

export const GOAL_TAXONOMY: Record<OnboardingGoal, TaxonomySignal> = {
  research: {
    slugs: ['perplexity', 'firecrawl', 'exa', 'notion', 'gmail'],
    categorySlugs: ['artificial-intelligence', 'ai-web-scraping', 'productivity'],
    nameKeywords: ['search', 'research', 'scrape', 'brief', 'summarize'],
  },
  documents: {
    slugs: ['googledocs', 'notion', 'googledrive', 'confluence', 'googlesheets'],
    categorySlugs: ['productivity', 'file-management-&-storage'],
    nameKeywords: ['document', 'doc', 'write', 'report'],
  },
  email: {
    slugs: ['gmail', 'outlook', 'superhuman'],
    categorySlugs: ['email'],
    nameKeywords: ['email', 'inbox', 'mail'],
  },
  coding: {
    slugs: ['github', 'gitlab', 'linear', 'jira', 'sentry'],
    categorySlugs: ['developer-tools', 'ticketing'],
    nameKeywords: ['code', 'repository', 'pull', 'issue', 'deploy'],
  },
  scheduling: {
    slugs: ['googlecalendar', 'calendly', 'outlook'],
    categorySlugs: ['scheduling-&-booking', 'calendar'],
    nameKeywords: ['calendar', 'schedule', 'meeting', 'event'],
  },
  data: {
    slugs: ['googlesheets', 'airtable', 'postgres', 'snowflake'],
    categorySlugs: ['databases-&-storage', 'analytics'],
    nameKeywords: ['spreadsheet', 'data', 'table', 'analytics'],
  },
  integrations: {
    slugs: ['zapier', 'make', 'n8n'],
    categorySlugs: ['workflow', 'developer-tools'],
    nameKeywords: ['automation', 'workflow', 'integrate'],
  },
};

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function truncateTagline(description: string, max = 60): string {
  const trimmed = description.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 24 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

function qualityTiebreaker(item: CatalogToolkit): number {
  let score = 0;
  if (item.connectable !== false) score += 100;
  if (item.logo) score += 10;
  score += Math.min(item.tools_count ?? 0, 50);
  return score;
}

function applySignal(
  scores: Map<string, number>,
  signal: TaxonomySignal,
  catalogBySlug: Map<string, CatalogToolkit>,
): void {
  for (const slug of signal.slugs) {
    const key = normalizeSlug(slug);
    if (catalogBySlug.has(key)) {
      scores.set(key, (scores.get(key) ?? 0) + SLUG_BOOST);
    }
  }

  for (const [slug, item] of catalogBySlug) {
    const categorySet = new Set((item.categories ?? []).map((c) => c.slug.toLowerCase()));
    if (signal.categorySlugs.some((c) => categorySet.has(c.toLowerCase()))) {
      scores.set(slug, (scores.get(slug) ?? 0) + CATEGORY_BOOST);
    }

    const haystack = `${item.name} ${item.description}`.toLowerCase();
    let keywordHits = 0;
    for (const keyword of signal.nameKeywords) {
      if (haystack.includes(keyword.toLowerCase())) keywordHits += 1;
    }
    if (keywordHits > 0) {
      scores.set(slug, (scores.get(slug) ?? 0) + Math.min(keywordHits, MAX_KEYWORD_HITS) * KEYWORD_BOOST);
    }
  }
}

function primaryCategory(item: CatalogToolkit): string {
  return item.categories?.[0]?.slug?.toLowerCase() ?? 'uncategorized';
}

function pickWithCategoryCap(
  ranked: Array<{ slug: string; score: number; item: CatalogToolkit }>,
  limit: number,
): CatalogToolkit[] {
  const picked: CatalogToolkit[] = [];
  const categoryCounts = new Map<string, number>();

  for (const { item } of ranked) {
    const cat = primaryCategory(item);
    const count = categoryCounts.get(cat) ?? 0;
    if (count >= MAX_APPS_PER_CATEGORY) continue;
    picked.push(item);
    categoryCounts.set(cat, count + 1);
    if (picked.length >= limit) break;
  }

  return picked;
}

function toCandidate(item: CatalogToolkit): OnboardingIntegrationCandidate {
  return {
    slug: item.slug,
    label: item.name,
    tagline: truncateTagline(item.description || item.name),
    logo: item.logo,
    auth_schemes: item.auth_schemes,
  };
}

export function scoreCatalogForOnboarding(
  profile: OnboardingProfile,
  catalog: CatalogToolkit[],
  opts?: { displayLimit?: number; poolLimit?: number },
): { candidates: OnboardingIntegrationCandidate[]; rankedPool: string[] } {
  const displayLimit = opts?.displayLimit ?? ONBOARDING_DISPLAY_LIMIT;
  const poolLimit = opts?.poolLimit ?? ONBOARDING_CANDIDATE_POOL_LIMIT;

  if ((profile.goals?.length ?? 0) === 0) {
    return { candidates: [], rankedPool: [] };
  }

  const pool = catalog.filter(
    (t) => t.connectable !== false && !HIDDEN_TOOLKITS.has(normalizeSlug(t.slug)),
  );
  const catalogBySlug = new Map(pool.map((t) => [normalizeSlug(t.slug), t] as const));
  const scores = new Map<string, number>();

  if (profile.role && ROLE_TAXONOMY[profile.role]) {
    applySignal(scores, ROLE_TAXONOMY[profile.role], catalogBySlug);
  }
  for (const goal of profile.goals ?? []) {
    const signal = GOAL_TAXONOMY[goal];
    if (signal) applySignal(scores, signal, catalogBySlug);
  }

  const ranked = [...scores.entries()]
    .map(([slug, score]) => {
      const item = catalogBySlug.get(slug)!;
      return { slug, score: score + qualityTiebreaker(item) * 0.001, item };
    })
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  let picked = pickWithCategoryCap(ranked, poolLimit);

  if (picked.length === 0) {
    const fallbackSet = new Set<string>(DEFAULT_FALLBACK_SLUGS);
    picked = pool.filter((t) => fallbackSet.has(normalizeSlug(t.slug))).slice(0, poolLimit);
  }

  return {
    candidates: picked.slice(0, displayLimit).map(toCandidate),
    rankedPool: picked.slice(0, poolLimit).map((t) => t.slug),
  };
}
