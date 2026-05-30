import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/services/api';
import type { InstalledApp, LocalApp } from '@/services/api';

export type { InstalledApp, LocalApp };

// ── Types ──

export interface RegistryApp {
  id: string; name: string; description: string; latest_version: string;
  author: { name: string; url?: string }; category: string; tags: string[];
  repo_url: string; icon_url?: string; base_url?: string; has_ui: boolean;
  tools: Array<{ name: string; description: string }>; install_count: number;
  featured: boolean; verified?: boolean;
}

export interface CuratedDef {
  slug: string; name: string; description: string;
  category: Category;
}

// ── Unified App Model ──

export type Category =
  | 'all'
  | 'productivity'
  | 'communication'
  | 'dev-tools'
  | 'data'
  | 'search'
  | 'utilities'
  | 'shopping'
  | 'finance'
  | 'media'
  | 'ai-tools'
  | 'integrations'
  | 'games';

export interface UnifiedApp {
  id: string; name: string; description: string;
  icon?: string; category: string; tags: string[];
  source: 'registry' | 'composio' | 'installed' | 'local';
  tools: Array<{ name: string; description?: string | null }>;
  hasUi: boolean;
  status: 'available' | 'installed' | 'connected';
  featured?: boolean; verified?: boolean;
  popularity?: number; version?: string;
  author?: string; authorUrl?: string; sourceUrl?: string;
  registryApp?: RegistryApp;
  installedApp?: InstalledApp;
  localApp?: LocalApp;
  composioSlug?: string; composioLogo?: string;
  authSchemes?: string[];
  authConfig?: Array<{ mode: string; fields: Array<{ name: string; displayName: string; description?: string; required: boolean }> }>;
  composioManaged?: boolean;
  requiresUpgrade?: boolean;
  available?: boolean;
}

// ── Constants ──

export const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Communication' },
  { id: 'dev-tools', label: 'Developer Tools' },
  { id: 'data', label: 'Data & Files' },
  { id: 'search', label: 'Search & Web' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'finance', label: 'Finance' },
  { id: 'media', label: 'Media' },
  { id: 'ai-tools', label: 'AI Tools' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'games', label: 'Games' },
];

export const FALLBACK_CURATED: CuratedDef[] = [
  { slug: 'googlecalendar', name: 'Google Calendar', description: 'Manage events and scheduling.', category: 'productivity' },
  { slug: 'notion', name: 'Notion', description: 'Manage pages and databases.', category: 'productivity' },
  { slug: 'todoist', name: 'Todoist', description: 'Create and manage tasks.', category: 'productivity' },
  { slug: 'trello', name: 'Trello', description: 'Organize boards and cards.', category: 'productivity' },
  { slug: 'gmail', name: 'Gmail', description: 'Read and manage email.', category: 'communication' },
  { slug: 'hubspot', name: 'HubSpot', description: 'Manage contacts and CRM.', category: 'communication' },
  { slug: 'intercom', name: 'Intercom', description: 'Customer conversations.', category: 'communication' },
  { slug: 'mailchimp', name: 'Mailchimp', description: 'Email campaigns.', category: 'communication' },
  { slug: 'github', name: 'GitHub', description: 'Repos, issues, and PRs.', category: 'dev-tools' },
  { slug: 'linear', name: 'Linear', description: 'Track issues and sprints.', category: 'dev-tools' },
  { slug: 'jira', name: 'Jira', description: 'Project management.', category: 'dev-tools' },
  { slug: 'sentry', name: 'Sentry', description: 'Monitor errors.', category: 'dev-tools' },
  { slug: 'googledrive', name: 'Google Drive', description: 'Cloud files.', category: 'data' },
  { slug: 'googlesheets', name: 'Google Sheets', description: 'Spreadsheets.', category: 'data' },
  { slug: 'airtable', name: 'Airtable', description: 'Databases and views.', category: 'data' },
  { slug: 'dropbox', name: 'Dropbox', description: 'Cloud file storage.', category: 'data' },
];

export const HIDDEN_SLUGS = new Set(['slack', 'telegram']);
const SOURCE_PRIORITY: Record<string, number> = { local: 0, installed: 1, composio: 2, registry: 3 };

export const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Productivity', communication: 'Communication',
  'dev-tools': 'Developer Tools', data: 'Data & Files', search: 'Search & Web',
  utilities: 'Utilities', shopping: 'Shopping', finance: 'Finance',
  media: 'Media', 'ai-tools': 'AI Tools', integrations: 'Integrations',
  games: 'Games',
};

// ── Helpers ──

export function composioIconUrl(slug: string, logo?: string): string {
  return logo || `https://logos.composio.dev/api/${slug}`;
}

export function inferCategory(slug: string, name: string, desc: string, curated?: CuratedDef[]): Category {
  const known = (curated || FALLBACK_CURATED).find(f => f.slug === slug.toLowerCase());
  if (known) return known.category;
  const text = `${slug} ${name} ${desc}`.toLowerCase();
  if (text.match(/\b(shop|shopping|commerce|store|market|mercado|product|price|sku|catalog)\b/)) return 'shopping';
  if (text.match(/\b(finance|bank|payment|invoice|accounting|tax|budget|stripe)\b/)) return 'finance';
  if (text.match(/\b(image|video|audio|media|photo|music|transcript)\b/)) return 'media';
  if (text.match(/\b(ai|llm|model|prompt|embedding|agent)\b/)) return 'ai-tools';
  if (text.match(/\b(game|chess|puzzle)\b/)) return 'games';
  if (text.match(/\b(git|code|repo|deploy|dev|build|test|ide|docker|sentry|jira|linear)\b/)) return 'dev-tools';
  if (text.match(/\b(email|mail|chat|messag|slack|discord|sms|zoom)\b/)) return 'communication';
  if (text.match(/\b(file|drive|storage|sheet|data|database|csv|pdf|dropbox|airtable|notion)\b/)) return 'data';
  if (text.match(/\b(search|web|browse|scrape|crawl|seo|google|bing)\b/)) return 'search';
  if (text.match(/\b(util|format|convert|encode|decode|hash|uuid|timestamp|calculator)\b/)) return 'utilities';
  return 'productivity';
}

export function mapRegistryCategory(cat?: string): Category {
  if (!cat) return 'productivity';
  const l = cat.toLowerCase();
  if (l === 'developer-tools' || l === 'dev-tools' || l.includes('dev') || l.includes('code') || l.includes('git')) return 'dev-tools';
  if (l === 'shopping' || l.includes('shop') || l.includes('commerce') || l.includes('market')) return 'shopping';
  if (l === 'finance' || l.includes('financ') || l.includes('bank') || l.includes('payment')) return 'finance';
  if (l === 'media' || l.includes('media') || l.includes('image') || l.includes('video') || l.includes('audio')) return 'media';
  if (l === 'ai-tools' || l.includes('ai') || l.includes('model') || l.includes('llm')) return 'ai-tools';
  if (l === 'integrations' || l.includes('integration')) return 'integrations';
  if (l === 'games' || l.includes('game')) return 'games';
  if (l === 'utilities' || l.includes('util') || l.includes('tool')) return 'utilities';
  if (l === 'data' || l.includes('data') || l.includes('file') || l.includes('storage')) return 'data';
  if (l === 'search' || l.includes('search') || l.includes('web') || l.includes('browser')) return 'search';
  if (l === 'communication' || l.includes('comm') || l.includes('email') || l.includes('chat')) return 'communication';
  return 'productivity';
}

export function getHostname(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

export function deduplicateApps(apps: UnifiedApp[]): UnifiedApp[] {
  const normalize = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '')
      .replace(/(mcp|server|integration|tool|api|bot|app|plugin)$/g, '');
  const seen = new Map<string, { app: UnifiedApp; idx: number }>();
  const result: UnifiedApp[] = [];
  for (const app of apps) {
    const key = normalize(app.name);
    if (!key) { result.push(app); continue; }
    const existing = seen.get(key);
    if (existing) {
      const ePri = SOURCE_PRIORITY[existing.app.source] ?? 9;
      const nPri = SOURCE_PRIORITY[app.source] ?? 9;
      if (nPri < ePri) { result[existing.idx] = app; seen.set(key, { app, idx: existing.idx }); }
    } else {
      seen.set(key, { app, idx: result.length });
      result.push(app);
    }
  }
  return result;
}

// ── Normalizers ──

export function registryToUnified(app: RegistryApp, installed: boolean): UnifiedApp {
  return {
    id: `registry-${app.id}`, name: app.name, description: app.description,
    icon: app.icon_url, category: mapRegistryCategory(app.category),
    tags: app.tags || [], source: 'registry', tools: app.tools || [],
    hasUi: app.has_ui, status: installed ? 'installed' : 'available',
    featured: app.featured, verified: app.verified ?? app.featured,
    popularity: app.install_count, version: app.latest_version,
    author: app.author?.name, authorUrl: app.author?.url,
    sourceUrl: app.repo_url || undefined, registryApp: app,
  };
}

export function composioToUnified(def: CuratedDef, connected: boolean, _plan: string = 'free'): UnifiedApp {
  return {
    id: `composio-${def.slug}`, name: def.name, description: def.description,
    icon: composioIconUrl(def.slug), category: def.category,
    tags: ['integration'], source: 'composio', tools: [], hasUi: false,
    status: connected ? 'connected' : 'available', composioSlug: def.slug,
    verified: true, sourceUrl: `https://composio.dev/toolkits/${def.slug}`,
    available: true,
    requiresUpgrade: false,
  };
}

export function composioSearchToUnified(t: { 
  slug: string; 
  name: string; 
  description: string; 
  logo?: string; 
  auth_schemes?: string[];
  requiresUpgrade?: boolean;
  available?: boolean;
}, connected: boolean, curated?: CuratedDef[]): UnifiedApp {
  return {
    id: `composio-${t.slug}`, name: t.name, description: t.description || t.slug,
    icon: composioIconUrl(t.slug, t.logo),
    category: inferCategory(t.slug, t.name, t.description || '', curated),
    tags: ['integration'], source: 'composio', tools: [], hasUi: false,
    status: connected ? 'connected' : 'available',
    composioSlug: t.slug, composioLogo: t.logo, verified: true,
    authSchemes: Array.isArray(t.auth_schemes) ? t.auth_schemes.map((s: any) => typeof s === 'string' ? s : s?.mode || 'unknown') : [],
    requiresUpgrade: t.requiresUpgrade,
    available: t.available,
  };
}

export function installedToUnified(app: InstalledApp): UnifiedApp {
  const fromCustomUrl = app.registry_linked === false;
  return {
    id: app.id, name: app.name || app.id, description: app.description || '',
    icon: app.icon_url, category: 'productivity',
    tags: fromCustomUrl ? ['mcp', 'from-url'] : ['mcp'],
    source: 'installed', tools: app.tools || [], hasUi: !!app.has_ui,
    status: 'installed', installedApp: app,
  };
}

export function localToUnified(app: LocalApp): UnifiedApp {
  const manifest = app.manifest;
  return {
    id: app.id,
    name: manifest.name || app.id,
    description: manifest.description || '',
    icon: app.icon_url || manifest.icon,
    category: inferCategory(app.id, manifest.name || app.id, manifest.description || ''),
    tags: ['local', 'agent-created'],
    source: 'local',
    tools: manifest.tools || [],
    hasUi: manifest.ui?.renderer === 'construct-hosted',
    status: 'installed',
    localApp: app,
  };
}

// ── Hook ──

export function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function prettyAuthLabel(scheme?: string): string | undefined {
  if (!scheme) return undefined;
  const s = scheme.toUpperCase();
  if (s === 'OAUTH2' || s === 'OAUTH1') return 'OAuth';
  if (s === 'API_KEY') return 'API key';
  if (s === 'BEARER_TOKEN') return 'Bearer token';
  if (s === 'BASIC') return 'Basic auth';
  if (s === 'NO_AUTH') return 'No auth';
  return scheme;
}

export type Tab = 'discover' | 'installed' | 'from_url';

export function useAppDiscovery() {
  const [tab, setTab] = useState<Tab>('discover');
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRunIdRef = useRef(0);

  const [curatedApps, setCuratedApps] = useState<CuratedDef[]>(FALLBACK_CURATED);
  const [registryApps, setRegistryApps] = useState<RegistryApp[]>([]);
  const [composioResults, setComposioResults] = useState<Array<any>>([]);

  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [localApps, setLocalApps] = useState<LocalApp[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [connectedToolkits, setConnectedToolkits] = useState<Set<string>>(new Set());
  const [userPlan, setUserPlan] = useState<string>('free');

  const [loading, setLoading] = useState(true);

  const fetchInstalled = useCallback(async () => {
    try {
      const data = await api.listInstalledApps();
      const apps = data?.success && data?.data ? data.data.apps : [];
      setInstalledApps(apps);
      setInstalledIds(new Set(apps.map((a: any) => a.id)));
    } catch { /* ignore */ }
  }, []);

  const fetchLocal = useCallback(async () => {
    try {
      const data = await api.listLocalApps();
      const apps = data?.success && data?.data ? data.data.apps : [];
      setLocalApps(apps);
    } catch { /* ignore */ }
  }, []);

  const fetchConnected = useCallback(async () => {
    try {
      const data = await api.getComposioConnected();
      if (data?.success && data.data?.connected) {
        setConnectedToolkits(new Set(data.data.connected.map((a: any) => a.toolkit)));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchCurated = useCallback(async () => {
    try {
      const data = await api.getCuratedApps();
      if (data?.success && data.data?.apps?.length) {
        setCuratedApps(data.data.apps.map((a: any) => ({
          slug: a.slug, name: a.name, description: a.description,
          category: (a.category || 'productivity') as Category,
        })));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchRegistry = useCallback(async () => {
    try {
      const data = await api.searchRegistry();
      if (data?.success && data.data?.apps) setRegistryApps(data.data.apps as unknown as RegistryApp[]);
    } catch { /* ignore */ }
  }, []);

  const fetchSubscription = useCallback(async () => {
    try {
      const data = await api.getSubscription();
      if (data?.success && data.data?.plan) setUserPlan(data.data.plan);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchCurated(), fetchRegistry(), fetchInstalled(), fetchLocal(), fetchConnected(), fetchSubscription()])
      .finally(() => setLoading(false));
  }, [fetchCurated, fetchRegistry, fetchInstalled, fetchLocal, fetchConnected, fetchSubscription]);

  const executeSearch = useCallback(async (query: string) => {
    const runId = ++searchRunIdRef.current;
    if (query.length < 2) {
      setComposioResults([]);
      setSearching(false); return;
    }
    setSearching(true);
    const [composio] = await Promise.allSettled([
      api.searchComposioToolkits(query),
    ]);
    if (runId !== searchRunIdRef.current) return;
    if (composio.status === 'fulfilled' && composio.value?.success && composio.value.data) setComposioResults(composio.value.data.toolkits || []);
    setSearching(false);
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) {
      searchRunIdRef.current += 1;
      setComposioResults([]);
      setSearching(false); return;
    }
    searchTimerRef.current = setTimeout(() => executeSearch(query), 400);
  }, [executeSearch]);

  const isSearching = search.length >= 2;

  const suggested: UnifiedApp[] = curatedApps
    .filter(f => category === 'all' || f.category === category)
    .map(f => composioToUnified(f, connectedToolkits.has(f.slug), userPlan));

  const yourApps: UnifiedApp[] = [
    ...[...connectedToolkits].map(slug => {
      const known = curatedApps.find(f => f.slug === slug);
      if (known) return composioToUnified(known, true, userPlan);
      return { id: `composio-${slug}`, name: slug.charAt(0).toUpperCase() + slug.slice(1),
        description: 'Connected integration', icon: composioIconUrl(slug),
        category: 'productivity' as const, tags: ['integration'],
        source: 'composio' as const, tools: [], hasUi: false,
        status: 'connected' as const, composioSlug: slug, verified: true,
      } satisfies UnifiedApp;
    }),
    ...localApps.map(localToUnified),
    ...installedApps.map(installedToUnified),
  ].filter(a => category === 'all' || a.category === category);

  const suggestedByCategory = (() => {
    const order = ['productivity', 'communication', 'dev-tools', 'data', 'search', 'utilities', 'shopping', 'finance', 'media', 'ai-tools', 'integrations', 'games'];
    const groups = new Map<string, UnifiedApp[]>();
    for (const app of suggested) {
      const cat = app.category as string;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(app);
    }
    return order.filter(c => groups.has(c)).map(c => [c, groups.get(c)!] as const);
  })();

  const registryList: UnifiedApp[] = registryApps
    .filter(a => {
      if (search) { const q = search.toLowerCase(); return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q); }
      return true;
    })
    .filter(a => category === 'all' || mapRegistryCategory(a.category) === category)
    .map(a => registryToUnified(a, installedIds.has(a.id)));

  const searchResults: UnifiedApp[] = isSearching ? deduplicateApps([
    ...composioResults.filter(t => !HIDDEN_SLUGS.has(t.slug.toLowerCase())).map(t => composioSearchToUnified(t, connectedToolkits.has(t.slug), curatedApps)),
    ...registryList,
  ]).filter(a => category === 'all' || a.category === category)
    .sort((a, b) => {
      const q = search.toLowerCase().trim();
      if (q) { const ae = a.name.toLowerCase() === q ? 1 : 0; const be = b.name.toLowerCase() === q ? 1 : 0; if (ae !== be) return be - ae; }
      if (a.verified && !b.verified) return -1; if (!a.verified && b.verified) return 1;
      const aA = a.status !== 'available' ? 1 : 0; const bA = b.status !== 'available' ? 1 : 0;
      if (aA !== bA) return bA - aA;
      return (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9);
    })
  : [];

  const handleRefresh = () => {
    setLoading(true);
    return Promise.all([fetchRegistry(), fetchInstalled(), fetchLocal(), fetchConnected()]).finally(() => setLoading(false));
  };

  return {
    tab, setTab, category, setCategory, search, handleSearch, searching,
    loading, yourApps, suggestedByCategory, registryList, searchResults, isSearching,
    installedIds, connectedToolkits, handleRefresh, fetchInstalled, fetchConnected, userPlan
  };
}
