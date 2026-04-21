import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/services/api';

// ── Types ──

export interface RegistryApp {
  id: string; name: string; description: string; latest_version: string;
  author: { name: string; url?: string }; category: string; tags: string[];
  repo_url: string; icon_url?: string; base_url?: string; has_ui: boolean;
  tools: Array<{ name: string; description: string }>; install_count: number;
  featured: boolean; verified?: boolean;
}

export interface SmitheryServer {
  qualifiedName: string; displayName: string; description: string;
  iconUrl?: string; useCount: number; verified: boolean; remote: boolean;
  isDeployed?: boolean;
}

export interface SmitheryServerDetail {
  qualifiedName: string; displayName: string; description: string;
  iconUrl: string | null; remote: boolean;
  connections: Array<{
    type: 'stdio' | 'http';
    configSchema?: ConfigSchema;
    deploymentUrl?: string;
  }>;
  tools: Array<{ name: string; description: string | null }> | null;
  security: { scanPassed: boolean } | null;
}

export interface SmitherySkill {
  qualifiedName: string; displayName: string; description: string;
  namespace?: string; gitUrl?: string; categories?: string[];
  totalActivations?: number; externalStars?: number;
  verified?: boolean; qualityScore?: number;
}

export interface SmitherySkillDetail extends SmitherySkill {
  prompt?: string; skillContent?: string;
}

export interface ConfigSchema {
  type: string; required?: string[];
  properties?: Record<string, { type: string; description?: string; default?: unknown; enum?: unknown[] }>;
}

export interface InstalledApp {
  id: string; name: string; description: string;
  icon_url?: string; has_ui: boolean;
  tools: Array<{ name: string; description?: string }>;
  installed_at: number;
  base_url?: string;
}

export interface CuratedDef {
  slug: string; name: string; description: string;
  category: Category;
}

// ── Unified App Model ──

export type Category = 'all' | 'productivity' | 'communication' | 'dev-tools' | 'data' | 'search';

export interface UnifiedApp {
  id: string; name: string; description: string;
  icon?: string; category: string; tags: string[];
  source: 'registry' | 'smithery' | 'composio' | 'installed' | 'skill';
  tools: Array<{ name: string; description?: string | null }>;
  hasUi: boolean; isSkill?: boolean;
  status: 'available' | 'installed' | 'connected';
  featured?: boolean; verified?: boolean;
  popularity?: number; version?: string;
  author?: string; authorUrl?: string; sourceUrl?: string;
  registryApp?: RegistryApp;
  smitheryServer?: SmitheryServer;
  smitheryDetail?: SmitheryServerDetail;
  installedApp?: InstalledApp;
  composioSlug?: string; composioLogo?: string;
  configSchema?: ConfigSchema;
  smitherySkill?: SmitherySkill;
  smitherySkillDetail?: SmitherySkillDetail;
  skillContent?: string;
  authSchemes?: string[];
  authConfig?: Array<{ mode: string; fields: Array<{ name: string; displayName: string; description?: string; required: boolean }> }>;
  composioManaged?: boolean;
  unavailable?: boolean;
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
const SOURCE_PRIORITY: Record<string, number> = { installed: 0, composio: 1, registry: 2, skill: 3, smithery: 4 };

export const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Productivity', communication: 'Communication',
  'dev-tools': 'Developer Tools', data: 'Data & Files', search: 'Search & Web',
};

// ── Helpers ──

export function composioIconUrl(slug: string, logo?: string): string {
  return logo || `https://logos.composio.dev/api/${slug}`;
}

export function inferCategory(slug: string, name: string, desc: string, curated?: CuratedDef[]): Category {
  const known = (curated || FALLBACK_CURATED).find(f => f.slug === slug.toLowerCase());
  if (known) return known.category;
  const text = `${slug} ${name} ${desc}`.toLowerCase();
  if (text.match(/\b(git|code|repo|deploy|dev|build|test|ide|docker|sentry|jira|linear)\b/)) return 'dev-tools';
  if (text.match(/\b(email|mail|chat|messag|slack|discord|sms|zoom)\b/)) return 'communication';
  if (text.match(/\b(file|drive|storage|sheet|data|database|csv|pdf|dropbox|airtable|notion)\b/)) return 'data';
  if (text.match(/\b(search|web|browse|scrape|crawl|seo|google|bing)\b/)) return 'search';
  return 'productivity';
}

export function mapRegistryCategory(cat?: string): Category {
  if (!cat) return 'productivity';
  const l = cat.toLowerCase();
  if (l.includes('dev') || l.includes('code') || l.includes('git')) return 'dev-tools';
  if (l.includes('data') || l.includes('file') || l.includes('storage')) return 'data';
  if (l.includes('search') || l.includes('web') || l.includes('browser')) return 'search';
  if (l.includes('comm') || l.includes('email') || l.includes('chat')) return 'communication';
  return 'productivity';
}

export function isSensitiveField(name: string): boolean {
  const l = name.toLowerCase();
  return ['key', 'secret', 'token', 'password', 'api_key', 'apikey', 'auth'].some(s => l.includes(s));
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

export function skillAvatarUrl(ns?: string): string | undefined {
  return ns ? `https://avatars.githubusercontent.com/${encodeURIComponent(ns)}?s=64` : undefined;
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

export function smitheryToUnified(srv: SmitheryServer, installed: boolean, curated?: CuratedDef[]): UnifiedApp {
  const normalizedId = `smithery-${srv.qualifiedName}`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return {
    id: normalizedId, name: srv.displayName || srv.qualifiedName,
    description: srv.description, icon: srv.iconUrl,
    category: inferCategory(srv.qualifiedName, srv.displayName, srv.description, curated),
    tags: ['mcp'], source: 'smithery', tools: [], hasUi: false,
    status: installed ? 'installed' : 'available',
    verified: srv.verified, popularity: srv.useCount || 0,
    sourceUrl: `https://smithery.ai/server/${srv.qualifiedName}`,
    smitheryServer: srv, unavailable: srv.isDeployed === false || undefined,
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
  return {
    id: app.id, name: app.name || app.id, description: app.description || '',
    icon: app.icon_url, category: 'productivity', tags: ['mcp'],
    source: 'installed', tools: app.tools || [], hasUi: !!app.has_ui,
    status: 'installed', installedApp: app,
  };
}

export function skillToUnified(sk: SmitherySkill, installed: boolean): UnifiedApp {
  const ns = sk.namespace || sk.qualifiedName?.split('/')[0];
  return {
    id: `skill-${sk.qualifiedName}`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase(),
    name: sk.qualifiedName || sk.displayName,
    description: sk.description || 'Smithery Skill',
    icon: skillAvatarUrl(ns), category: inferCategory(sk.qualifiedName, sk.displayName, sk.description || ''),
    tags: sk.categories || ['skill'], source: 'skill', tools: [], hasUi: false,
    isSkill: true, status: installed ? 'installed' : 'available',
    author: ns, verified: sk.verified || false,
    popularity: sk.totalActivations || 0,
    sourceUrl: `https://smithery.ai/skills/${sk.qualifiedName}`,
    smitherySkill: sk,
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

export type Tab = 'discover' | 'installed';

export function useAppDiscovery() {
  const [tab, setTab] = useState<Tab>('discover');
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [curatedApps, setCuratedApps] = useState<CuratedDef[]>(FALLBACK_CURATED);
  const [registryApps, setRegistryApps] = useState<RegistryApp[]>([]);
  const [smitheryResults, setSmitheryResults] = useState<SmitheryServer[]>([]);
  const [composioResults, setComposioResults] = useState<Array<any>>([]);
  const [skillResults, setSkillResults] = useState<SmitherySkill[]>([]);

  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
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
    Promise.all([fetchCurated(), fetchRegistry(), fetchInstalled(), fetchConnected(), fetchSubscription()])
      .finally(() => setLoading(false));
  }, [fetchCurated, fetchRegistry, fetchInstalled, fetchConnected, fetchSubscription]);

  const executeSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSmitheryResults([]); setComposioResults([]); setSkillResults([]);
      setSearching(false); return;
    }
    setSearching(true);
    const [smithery, composio, skills] = await Promise.allSettled([
      api.searchSmithery(query),
      api.searchComposioToolkits(query),
      api.searchSmitherySkills(query),
    ]);
    if (smithery.status === 'fulfilled' && smithery.value?.success && smithery.value.data) setSmitheryResults((smithery.value.data.servers || []) as unknown as SmitheryServer[]);
    if (composio.status === 'fulfilled' && composio.value?.success && composio.value.data) setComposioResults(composio.value.data.toolkits || []);
    if (skills.status === 'fulfilled' && skills.value?.success && skills.value.data) setSkillResults((skills.value.data.skills || []) as unknown as SmitherySkill[]);
    setSearching(false);
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) {
      setSmitheryResults([]); setComposioResults([]); setSkillResults([]);
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
    ...installedApps.map(installedToUnified),
  ].filter(a => category === 'all' || a.category === category);

  const suggestedByCategory = (() => {
    const order = ['productivity', 'communication', 'dev-tools', 'data', 'search'];
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
    ...smitheryResults.filter(srv => !srv.remote).filter(srv => !HIDDEN_SLUGS.has((srv.qualifiedName || '').split('/').pop()?.toLowerCase() || '')).map(srv => {
      const app = smitheryToUnified(srv, false, curatedApps);
      return { ...app, status: installedIds.has(app.id) ? 'installed' as const : 'available' as const };
    }),
    ...[...skillResults].sort((a, b) => (b.totalActivations || 0) - (a.totalActivations || 0)).map(sk => {
      const app = skillToUnified(sk, false);
      return { ...app, status: installedIds.has(app.id) ? 'installed' as const : 'available' as const };
    }),
  ]).filter(a => !(a.unavailable && !a.verified))
    .filter(a => category === 'all' || a.category === category)
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
    Promise.all([fetchRegistry(), fetchInstalled(), fetchConnected()]).finally(() => setLoading(false));
  };

  return {
    tab, setTab, category, setCategory, search, handleSearch, searching,
    loading, yourApps, suggestedByCategory, registryList, searchResults, isSearching,
    installedIds, connectedToolkits, handleRefresh, fetchInstalled, fetchConnected, userPlan
  };
}
