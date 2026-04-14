/**
 * AppStoreScreen — Unified app discovery, installation, and management.
 * Mobile version of the desktop AppRegistryWindow with 1:1 feature parity.
 *
 * Two tabs (matches desktop):
 *   Discover  — Browse curated integrations + cross-source search
 *   Installed — View and manage installed apps grouped by type
 *
 * Sources: Composio (integrations), Smithery (MCP servers + skills), Registry (first-party)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Package, Loader2, Check, X, AlertCircle,
  RefreshCw, ChevronLeft, Wrench, ExternalLink,
  Shield, ShieldAlert, KeyRound, Settings2, Tag,
} from 'lucide-react';
import {
  MiniHeader, Card, Badge, IconBtn, Spinner, SkeletonList, EmptyState,
  ConfirmDialog, SectionLabel, useToast, haptic,
  api, apiJSON, accent, textColor, bg2,
} from '../ui';

// ── Types ──

interface RegistryApp {
  id: string; name: string; description: string; latest_version: string;
  author: { name: string; url?: string }; category: string; tags: string[];
  repo_url: string; icon_url?: string; base_url?: string; has_ui: boolean;
  tools: Array<{ name: string; description: string }>; install_count: number;
  featured: boolean; verified?: boolean;
}

interface SmitheryServer {
  qualifiedName: string; displayName: string; description: string;
  iconUrl?: string; useCount: number; verified: boolean; remote: boolean;
  isDeployed?: boolean;
}

interface SmitheryServerDetail {
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

interface SmitherySkill {
  qualifiedName: string; displayName: string; description: string;
  namespace?: string; gitUrl?: string; categories?: string[];
  totalActivations?: number; externalStars?: number;
  verified?: boolean; qualityScore?: number;
}

interface SmitherySkillDetail extends SmitherySkill {
  prompt?: string; skillContent?: string;
}

interface ConfigSchema {
  type: string; required?: string[];
  properties?: Record<string, { type: string; description?: string; default?: unknown; enum?: unknown[] }>;
}

interface InstalledApp {
  id: string; name: string; description: string;
  icon_url?: string; has_ui: boolean;
  tools: Array<{ name: string; description?: string }>;
  installed_at: number;
}

interface CuratedDef {
  slug: string; name: string; description: string;
  category: Category;
}

// ── Unified App Model (matches desktop) ──

type Category = 'all' | 'productivity' | 'communication' | 'dev-tools' | 'data' | 'search';

interface UnifiedApp {
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

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Communication' },
  { id: 'dev-tools', label: 'Developer' },
  { id: 'data', label: 'Data & Files' },
  { id: 'search', label: 'Search & Web' },
];

// Free tier Composio tools (must match worker/src/config.ts)
const FREE_TIER_COMPOSIO_TOOLS: string[] = [
  'googledrive', 'googlecalendar', 'gmail', 'slack',
  'notion', 'github', 'linear', 'discord',
];

const FALLBACK_CURATED: CuratedDef[] = [
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

const HIDDEN_SLUGS = new Set(['slack', 'telegram']);
const SOURCE_PRIORITY: Record<string, number> = { installed: 0, composio: 1, registry: 2, skill: 3, smithery: 4 };
const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Productivity', communication: 'Communication',
  'dev-tools': 'Developer Tools', data: 'Data & Files', search: 'Search & Web',
};

// ── Helpers ──

function composioIconUrl(slug: string, logo?: string): string {
  return logo || `https://logos.composio.dev/api/${slug}`;
}

function inferCategory(slug: string, name: string, desc: string, curated?: CuratedDef[]): Category {
  const known = (curated || FALLBACK_CURATED).find(f => f.slug === slug.toLowerCase());
  if (known) return known.category;
  const text = `${slug} ${name} ${desc}`.toLowerCase();
  if (text.match(/\b(git|code|repo|deploy|dev|build|test|ide|docker|sentry|jira|linear)\b/)) return 'dev-tools';
  if (text.match(/\b(email|mail|chat|messag|slack|discord|sms|zoom)\b/)) return 'communication';
  if (text.match(/\b(file|drive|storage|sheet|data|database|csv|pdf|dropbox|airtable|notion)\b/)) return 'data';
  if (text.match(/\b(search|web|browse|scrape|crawl|seo|google|bing)\b/)) return 'search';
  return 'productivity';
}

function mapRegistryCategory(cat?: string): Category {
  if (!cat) return 'productivity';
  const l = cat.toLowerCase();
  if (l.includes('dev') || l.includes('code') || l.includes('git')) return 'dev-tools';
  if (l.includes('data') || l.includes('file') || l.includes('storage')) return 'data';
  if (l.includes('search') || l.includes('web') || l.includes('browser')) return 'search';
  if (l.includes('comm') || l.includes('email') || l.includes('chat')) return 'communication';
  return 'productivity';
}

function isSensitiveField(name: string): boolean {
  const l = name.toLowerCase();
  return ['key', 'secret', 'token', 'password', 'api_key', 'apikey', 'auth'].some(s => l.includes(s));
}

function getHostname(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function deduplicateApps(apps: UnifiedApp[]): UnifiedApp[] {
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

function skillAvatarUrl(ns?: string): string | undefined {
  return ns ? `https://avatars.githubusercontent.com/${encodeURIComponent(ns)}?s=64` : undefined;
}

// ── Normalizers ──

function registryToUnified(app: RegistryApp, installed: boolean): UnifiedApp {
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

function smitheryToUnified(srv: SmitheryServer, installed: boolean, curated?: CuratedDef[]): UnifiedApp {
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

function composioToUnified(def: CuratedDef, connected: boolean, plan: string = 'free'): UnifiedApp {
  const isFreeTier = FREE_TIER_COMPOSIO_TOOLS.includes(def.slug.toLowerCase());
  const isPaidPlan = plan === 'starter' || plan === 'pro';
  const isAvailable = isPaidPlan || isFreeTier;
  return {
    id: `composio-${def.slug}`, name: def.name, description: def.description,
    icon: composioIconUrl(def.slug), category: def.category,
    tags: ['integration'], source: 'composio', tools: [], hasUi: false,
    status: connected ? 'connected' : 'available', composioSlug: def.slug,
    verified: true, sourceUrl: `https://composio.dev/toolkits/${def.slug}`,
    available: isAvailable,
    requiresUpgrade: !isAvailable && plan === 'free',
  };
}

function composioSearchToUnified(t: { 
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

function installedToUnified(app: InstalledApp): UnifiedApp {
  return {
    id: app.id, name: app.name || app.id, description: app.description || '',
    icon: app.icon_url, category: 'productivity', tags: ['mcp'],
    source: 'installed', tools: app.tools || [], hasUi: !!app.has_ui,
    status: 'installed', installedApp: app,
  };
}

function skillToUnified(sk: SmitherySkill, installed: boolean): UnifiedApp {
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

// ── Main Component ──

type Tab = 'discover' | 'installed';

export function AppStoreScreen() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('discover');
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Source data
  const [curatedApps, setCuratedApps] = useState<CuratedDef[]>(FALLBACK_CURATED);
  const [registryApps, setRegistryApps] = useState<RegistryApp[]>([]);
  const [smitheryResults, setSmitheryResults] = useState<SmitheryServer[]>([]);
  const [composioResults, setComposioResults] = useState<Array<{ slug: string; name: string; description: string; logo?: string; auth_schemes?: string[] }>>([]);
  const [skillResults, setSkillResults] = useState<SmitherySkill[]>([]);

  // Installed / connected
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [connectedToolkits, setConnectedToolkits] = useState<Set<string>>(new Set());
  const [userPlan, setUserPlan] = useState<string>('free');

  // Loading / errors / detail
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnifiedApp | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

  // ── Data fetching ──

  const fetchInstalled = useCallback(async () => {
    const data = await apiJSON<any>('/apps');
    const apps = Array.isArray(data) ? data : data?.apps || [];
    setInstalledApps(apps);
    setInstalledIds(new Set(apps.map((a: any) => a.id)));
  }, []);

  const fetchConnected = useCallback(async () => {
    const data = await apiJSON<any>('/composio/connected');
    if (data?.connected) {
      setConnectedToolkits(new Set(data.connected.map((a: any) => a.toolkit)));
    }
  }, []);

  const fetchCurated = useCallback(async () => {
    const data = await apiJSON<any>('/apps/curated');
    if (data?.apps?.length) {
      setCuratedApps(data.apps.map((a: any) => ({
        slug: a.slug, name: a.name, description: a.description,
        category: (a.category || 'productivity') as Category,
      })));
    }
  }, []);

  const fetchRegistry = useCallback(async () => {
    const data = await apiJSON<any>('/apps/registry');
    if (data?.apps) setRegistryApps(data.apps);
  }, []);

  const fetchSubscription = useCallback(async () => {
    const data = await apiJSON<any>('/billing/subscription');
    if (data?.plan) {
      setUserPlan(data.plan);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchCurated(), fetchRegistry(), fetchInstalled(), fetchConnected(), fetchSubscription()])
      .finally(() => setLoading(false));
  }, [fetchCurated, fetchRegistry, fetchInstalled, fetchConnected, fetchSubscription]);

  // ── Search ──

  const executeSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSmitheryResults([]); setComposioResults([]); setSkillResults([]);
      setSearching(false); return;
    }
    setSearching(true);
    const [smithery, composio, skills] = await Promise.allSettled([
      apiJSON<any>(`/apps/smithery?q=${encodeURIComponent(query)}`),
      apiJSON<any>(`/composio/search?q=${encodeURIComponent(query)}`),
      apiJSON<any>(`/apps/skills/search?q=${encodeURIComponent(query)}`),
    ]);
    if (smithery.status === 'fulfilled' && smithery.value) setSmitheryResults(smithery.value.servers || []);
    if (composio.status === 'fulfilled' && composio.value) setComposioResults(composio.value.toolkits || []);
    if (skills.status === 'fulfilled' && skills.value) setSkillResults(skills.value.skills || []);
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

  // ── Computed lists ──

  const isSearching = search.length >= 2;

  // Curated (discover browse)
  const suggested: UnifiedApp[] = curatedApps
    .filter(f => category === 'all' || f.category === category)
    .map(f => composioToUnified(f, connectedToolkits.has(f.slug), userPlan));

  // Your Apps (installed tab)
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

  // Registry apps filtered
  const registryList: UnifiedApp[] = registryApps
    .filter(a => {
      if (search) { const q = search.toLowerCase(); return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q); }
      return true;
    })
    .filter(a => category === 'all' || mapRegistryCategory(a.category) === category)
    .map(a => registryToUnified(a, installedIds.has(a.id)));

  // Cross-source search results
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

  // ── Actions ──

  const isAppInstalled = (app: UnifiedApp): boolean => {
    if (app.status !== 'available') return true;
    if (app.registryApp && installedIds.has(app.registryApp.id)) return true;
    if (app.composioSlug && connectedToolkits.has(app.composioSlug)) return true;
    if (app.source === 'installed') return true;
    if (installedIds.has(app.id)) return true;
    return false;
  };

  const refreshAfterInstall = async () => {
    await fetchInstalled();
    setDetail(prev => prev ? { ...prev, status: 'installed' } : null);
  };

  const openDetail = useCallback((app: UnifiedApp) => {
    setDetail(app); setConfigValues({}); setError(null);

    if (app.source === 'smithery' && app.smitheryServer) {
      setDetailLoading(true);
      apiJSON<any>(`/apps/smithery/detail?name=${encodeURIComponent(app.smitheryServer.qualifiedName)}`).then(d => {
        if (d) {
          const conn = d.connections?.find((c: any) => c.type === 'http') || d.connections?.[0];
          setDetail(prev => prev ? {
            ...prev, tools: d.tools?.map((t: any) => ({ name: t.name, description: t.description })) || prev.tools,
            smitheryDetail: d, configSchema: conn?.configSchema,
          } : null);
          const props = conn?.configSchema?.properties || {};
          const defaults: Record<string, string> = {};
          for (const [key, prop] of Object.entries(props)) { if ((prop as any).default !== undefined) defaults[key] = String((prop as any).default); }
          setConfigValues(defaults);
        }
        setDetailLoading(false);
      }).catch(() => setDetailLoading(false));
    }

    if (app.isSkill && app.smitherySkill) {
      setDetailLoading(true);
      apiJSON<any>(`/apps/skills/detail?name=${encodeURIComponent(app.smitherySkill.qualifiedName)}`).then(d => {
        if (d) setDetail(prev => prev ? { ...prev, smitherySkillDetail: d, skillContent: d.skillContent || d.prompt, tags: d.categories?.length ? d.categories : prev.tags } : null);
        setDetailLoading(false);
      }).catch(() => setDetailLoading(false));
    }

    if (app.source === 'composio' && app.composioSlug) {
      setDetailLoading(true);
      apiJSON<any>(`/composio/${encodeURIComponent(app.composioSlug)}/detail`).then(d => {
        if (d) setDetail(prev => prev ? {
          ...prev, description: d.description || prev.description,
          icon: d.logo || prev.icon, composioLogo: d.logo || prev.composioLogo,
          tools: d.tools?.map((t: any) => ({ name: t.name, description: t.description })) || prev.tools,
          tags: d.categories?.map((c: any) => c.name).filter(Boolean) || prev.tags,
          authSchemes: Array.isArray(d.auth_schemes) ? d.auth_schemes.map((s: any) => typeof s === 'string' ? s : s?.mode || 'unknown') : prev.authSchemes,
          authConfig: Array.isArray(d.auth_schemes) ? d.auth_schemes.filter((s: any) => typeof s === 'object').map((s: any) => ({
            mode: s.mode || '', fields: Array.isArray(s.fields) ? s.fields.map((f: any) => ({
              name: f.name || '', displayName: f.displayName || f.display_name || f.name || '',
              description: f.description || '', required: f.required !== false,
            })) : [],
          })) : prev.authConfig,
          composioManaged: d.composio_managed ?? prev.composioManaged,
        } : null);
        setDetailLoading(false);
      }).catch(() => setDetailLoading(false));
    }
  }, []);

  const handleInstallRegistry = async (app: UnifiedApp) => {
    if (!app.registryApp) return;
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    const res = await api('/apps/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: app.registryApp.id, name: app.registryApp.name, description: app.registryApp.description, icon_url: app.registryApp.icon_url, base_url: app.registryApp.base_url, has_ui: app.registryApp.has_ui }),
    });
    if (res.ok) { haptic('success'); toast.show(`${app.name} installed`, 'success'); await refreshAfterInstall(); }
    else { haptic('error'); setError('Install failed'); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSmithery = async (app: UnifiedApp) => {
    if (!app.smitheryServer) return;
    const required = new Set(app.configSchema?.required || []);
    for (const field of required) { if (!configValues[field]?.trim()) { setError(`Required field "${field}" is empty`); return; } }
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    const res = await api('/apps/smithery/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qualifiedName: app.smitheryServer.qualifiedName, config: configValues, displayName: app.name }),
    });
    if (res.ok) { haptic('success'); toast.show(`${app.name} installed`, 'success'); await refreshAfterInstall(); }
    else { haptic('error'); setError('Install failed'); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSkill = async (app: UnifiedApp) => {
    if (!app.smitherySkill) return;
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    const gitUrl = app.smitherySkillDetail?.gitUrl || app.smitherySkill.gitUrl;
    const res = await api('/apps/skills/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qualifiedName: app.smitherySkill.qualifiedName, displayName: app.smitherySkill.displayName, description: app.description, gitUrl }),
    });
    if (res.ok) { haptic('success'); toast.show(`${app.name} installed`, 'success'); await refreshAfterInstall(); }
    else { haptic('error'); setError('Install failed'); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleUninstall = async (appId: string, appName: string) => {
    setPendingActions(prev => ({ ...prev, [appId]: true }));
    const res = await api(`/apps/${encodeURIComponent(appId)}`, { method: 'DELETE' });
    if (res.ok) { haptic('success'); toast.show(`${appName} uninstalled`, 'success'); await fetchInstalled(); setDetail(null); }
    else { haptic('error'); setError('Uninstall failed'); }
    setPendingActions(prev => { const n = { ...prev }; delete n[appId]; return n; });
  };

  const handleConnect = async (toolkit: string) => {
    setPendingActions(prev => ({ ...prev, [`composio-${toolkit}`]: true }));
    const data = await apiJSON<any>(`/composio/${encodeURIComponent(toolkit)}/auth-url`);
    if (data?.url) {
      window.open(data.url, '_blank');
      toast.show('Complete authorization in the new tab', 'info');
      // Poll for connection completion
      const pollInterval = setInterval(async () => {
        await fetchConnected();
        setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
        clearInterval(pollInterval);
      }, 5000);
      setTimeout(() => clearInterval(pollInterval), 120_000);
    } else {
      haptic('error'); setError('Failed to get auth URL');
      setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
    }
  };

  const handleDisconnect = async (toolkit: string) => {
    setPendingActions(prev => ({ ...prev, [`composio-${toolkit}`]: true }));
    const res = await api(`/composio/${encodeURIComponent(toolkit)}/disconnect`, { method: 'DELETE' });
    if (res.ok) {
      haptic('success'); toast.show('Disconnected', 'success');
      setConnectedToolkits(prev => { const n = new Set(prev); n.delete(toolkit); return n; });
      setDetail(prev => prev?.composioSlug === toolkit ? { ...prev, status: 'available' } : prev);
    } else { haptic('error'); setError('Disconnect failed'); }
    setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
  };

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([fetchRegistry(), fetchInstalled(), fetchConnected()]).finally(() => setLoading(false));
  };

  // ── Detail View ──

  if (detail) {
    const installed = isAppInstalled(detail);
    const isPending = !!pendingActions[detail.id] || !!pendingActions[`composio-${detail.composioSlug}`];
    const isComposio = detail.source === 'composio';
    const isSmithery = detail.source === 'smithery';
    const isSkill = !!detail.isSkill;
    const toolCount = detail.tools?.length || 0;
    const hasConfig = !!(detail.configSchema?.properties && Object.keys(detail.configSchema.properties).length > 0);

    const getUninstallTarget = (): string | null => {
      if (detail.installedApp && detail.installedApp.id !== 'app-registry') return detail.installedApp.id;
      if (detail.registryApp && installedIds.has(detail.registryApp.id)) return detail.registryApp.id;
      if (detail.smitheryServer && installedIds.has(detail.id)) return detail.id;
      if (installedIds.has(detail.id) && detail.id !== 'app-registry') return detail.id;
      return null;
    };
    const uninstallTarget = getUninstallTarget();

    const getAction = detail.registryApp ? () => handleInstallRegistry(detail)
      : detail.smitheryServer && (!detail.smitheryDetail || detail.smitheryDetail.connections.length > 0) ? () => handleInstallSmithery(detail)
      : isSkill && detail.smitherySkill ? () => handleInstallSkill(detail)
      : isComposio && detail.composioSlug && !installed ? () => handleConnect(detail.composioSlug!)
      : null;

    return (
      <div className="flex flex-col h-full" style={{ color: textColor() }}>
        <MiniHeader
          title=""
          onBack={() => { setDetail(null); setConfigValues({}); setError(null); }}
        />
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl mb-3" style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}>
              <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: '#f59e0b' }} />
              <p className="text-[12px] flex-1" style={{ color: '#f59e0b' }}>{error}</p>
              <button onClick={() => setError(null)}><X size={12} style={{ color: '#f59e0b' }} /></button>
            </div>
          )}

          {/* Hero */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              {detail.icon ? (
                <img src={detail.icon} alt="" className="w-10 h-10 rounded-lg object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <Package size={24} className="opacity-30" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[16px] font-bold leading-tight truncate">{detail.name}</h2>
                {(isComposio || detail.verified) && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                    <Check size={10} style={{ color: '#22c55e' }} strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="text-[11px] opacity-30 mt-0.5">
                {detail.author && <>{detail.author}</>}
                {detail.sourceUrl && <>{detail.author ? ' · ' : ''}{getHostname(detail.sourceUrl)}</>}
                {!detail.author && !detail.sourceUrl && (isComposio ? 'Integration' : isSkill ? 'Skill' : isSmithery ? 'MCP Server' : 'Construct App')}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {isSkill && <Badge color="#a855f7">Skill</Badge>}
                {detail.version && detail.version !== '0.0.0' && <Badge>v{detail.version}</Badge>}
                {detail.hasUi && <Badge color="#60A5FA">GUI</Badge>}
              </div>
            </div>
          </div>

          {/* Upgrade banner for paid integrations */}
          {detail.requiresUpgrade && (
            <div className="flex items-start gap-2 px-3 py-3 rounded-xl mb-4" style={{ backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <span className="text-[14px]">🔒</span>
              <div className="flex-1">
                <p className="text-[12px] font-medium" style={{ color: '#fbbf24' }}>Upgrade to connect</p>
                <p className="text-[11px] opacity-60 mt-0.5">This integration requires a Starter or Pro plan. Upgrade to unlock access.</p>
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="mb-4">
            {isPending ? (
              <button disabled className="w-full py-2.5 rounded-xl text-[14px] font-medium opacity-50 flex items-center justify-center" style={{ backgroundColor: accent(), color: '#fff' }}>
                <Loader2 size={16} className="animate-spin" />
              </button>
            ) : installed ? (
              <div className="flex gap-2">
                <span className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-center" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                  <Check size={14} className="inline mr-1" />Added
                </span>
                {(uninstallTarget || (isComposio && connectedToolkits.has(detail.composioSlug!))) && (
                  <button
                    onClick={() => {
                      if (isComposio && detail.composioSlug) handleDisconnect(detail.composioSlug);
                      else if (uninstallTarget) handleUninstall(uninstallTarget, detail.name);
                    }}
                    className="px-4 py-2.5 rounded-xl text-[13px] font-medium"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : detail.requiresUpgrade ? (
              <button
                onClick={() => window.location.href = '/?settings=subscription'}
                className="w-full py-2.5 rounded-xl text-[14px] font-medium"
                style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
              >
                Upgrade to Starter
              </button>
            ) : getAction ? (
              <button
                onClick={() => {
                  if (!detail.verified && !isComposio) {
                    // Show unverified warning inline
                    if (confirm(`${detail.name} is from an unverified publisher. Install anyway?`)) getAction();
                  } else { getAction(); }
                }}
                className="w-full py-2.5 rounded-xl text-[14px] font-medium"
                style={{ backgroundColor: accent(), color: '#fff' }}
              >
                Get
              </button>
            ) : isSmithery && detail.smitheryDetail && detail.smitheryDetail.connections.length === 0 ? (
              <span className="block w-full py-2.5 rounded-xl text-[14px] font-medium text-center opacity-30">Unavailable</span>
            ) : null}
          </div>

          {/* About */}
          <SectionLabel>About</SectionLabel>
          <p className="text-[13px] opacity-60 leading-relaxed mb-4">{detail.description || 'No description available.'}</p>

          {/* Smithery config form */}
          {isSmithery && !installed && hasConfig && (
            <div className="mb-4">
              <SectionLabel>Configuration</SectionLabel>
              <Card>
                <div className="space-y-3">
                  {Object.entries(detail.configSchema!.properties!).map(([key, prop]) => {
                    const isRequired = detail.configSchema!.required?.includes(key);
                    const sensitive = isSensitiveField(key);
                    const hasEnum = prop.enum && prop.enum.length > 0;
                    return (
                      <div key={key}>
                        <label className="flex items-center gap-1 text-[11px] font-medium opacity-50 mb-1">
                          {sensitive && <KeyRound size={10} className="text-amber-500" />}
                          {key}{isRequired && <span className="text-red-400">*</span>}
                        </label>
                        {hasEnum ? (
                          <select
                            value={configValues[key] || ''}
                            onChange={e => setConfigValues(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-full text-[13px] px-3 py-2 rounded-lg outline-none"
                            style={{ backgroundColor: bg2(), color: textColor() }}
                          >
                            <option value="">Select...</option>
                            {prop.enum!.map((opt: unknown) => <option key={String(opt)} value={String(opt)}>{String(opt)}</option>)}
                          </select>
                        ) : (
                          <input
                            type={sensitive ? 'password' : 'text'}
                            value={configValues[key] || ''}
                            onChange={e => setConfigValues(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={prop.default !== undefined ? String(prop.default) : isRequired ? 'Required' : 'Optional'}
                            className="w-full text-[13px] px-3 py-2 rounded-lg outline-none"
                            style={{ backgroundColor: bg2(), color: textColor() }}
                          />
                        )}
                        {prop.description && <p className="text-[10px] opacity-30 mt-0.5">{prop.description}</p>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {isSmithery && !installed && detailLoading && (
            <div className="flex items-center gap-2 py-4 opacity-30 mb-4">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[12px]">Loading server details...</span>
            </div>
          )}

          {/* Skill explainer */}
          {isSkill && (
            <Card className="mb-4">
              <p className="text-[11px] opacity-40 leading-relaxed">
                Skills inject expert knowledge directly into the agent's context — they don't run a process like MCP apps.
              </p>
            </Card>
          )}

          {/* Skill content */}
          {isSkill && detail.skillContent && (
            <div className="mb-4">
              <SectionLabel>Skill Content</SectionLabel>
              <Card>
                <div className="max-h-60 overflow-y-auto">
                  <pre className="text-[11px] opacity-50 whitespace-pre-wrap leading-relaxed">{detail.skillContent}</pre>
                </div>
              </Card>
            </div>
          )}

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {isSkill && (
              <Card><div className="text-[10px] opacity-30 uppercase">Type</div><div className="text-[12px] font-medium opacity-70">Prompt Skill</div></Card>
            )}
            {!isSkill && toolCount > 0 && (
              <Card><div className="text-[10px] opacity-30 uppercase">Tools</div><div className="text-[12px] font-medium opacity-70">{toolCount} tool{toolCount !== 1 ? 's' : ''}</div></Card>
            )}
            {detail.hasUi && (
              <Card><div className="text-[10px] opacity-30 uppercase">Interface</div><div className="text-[12px] font-medium opacity-70">Has GUI</div></Card>
            )}
            {detail.popularity !== undefined && detail.popularity > 0 && (
              <Card><div className="text-[10px] opacity-30 uppercase">Installs</div><div className="text-[12px] font-medium opacity-70">{detail.popularity >= 1000 ? `${(detail.popularity / 1000).toFixed(1)}K` : detail.popularity}</div></Card>
            )}
            {detail.sourceUrl && (
              <Card>
                <div className="text-[10px] opacity-30 uppercase">Source</div>
                <div className="text-[12px] font-medium truncate" style={{ color: accent() }}>{getHostname(detail.sourceUrl)}</div>
              </Card>
            )}
          </div>

          {/* Tools list */}
          {!isSkill && detailLoading && toolCount === 0 ? (
            <div className="flex items-center gap-2 py-4 opacity-30">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[12px]">Loading tools...</span>
            </div>
          ) : !isSkill && toolCount > 0 ? (
            <div className="mb-4">
              <SectionLabel>Tools</SectionLabel>
              <div className="space-y-1.5">
                {detail.tools.map(tool => (
                  <Card key={tool.name}>
                    <div className="flex items-start gap-2">
                      <Wrench size={11} className="opacity-20 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-mono font-medium opacity-70">{tool.name}</p>
                        {tool.description && <p className="text-[11px] opacity-30 line-clamp-2">{tool.description}</p>}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          {/* Tags */}
          {detail.tags.length > 0 && (
            <div>
              <SectionLabel>{isComposio ? 'Categories' : 'Tags'}</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md opacity-40" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <Tag size={10} /> {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main View ──

  const installedCount = yourApps.length;

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      <MiniHeader
        title="Apps"
        actions={
          <IconBtn onClick={() => { handleRefresh(); haptic(); }}>
            <RefreshCw size={16} className="opacity-40" />
          </IconBtn>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-0 mx-4 mb-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => { setTab('discover'); setSearch(''); haptic(); }}
          className="px-4 py-2 text-[12px] font-semibold transition-colors relative"
          style={{ color: tab === 'discover' ? accent() : 'rgba(255,255,255,0.4)' }}
        >
          Discover
          {tab === 'discover' && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ backgroundColor: accent() }} />}
        </button>
        <button
          onClick={() => { setTab('installed'); setSearch(''); haptic(); }}
          className="px-4 py-2 text-[12px] font-semibold transition-colors relative"
          style={{ color: tab === 'installed' ? accent() : 'rgba(255,255,255,0.4)' }}
        >
          Installed
          {installedCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              {installedCount}
            </span>
          )}
          {tab === 'installed' && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ backgroundColor: accent() }} />}
        </button>
      </div>

      {/* Search bar */}
      <div className="px-4 mb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-25 pointer-events-none" />
          <input
            type="text"
            className="w-full text-[13px] pl-8 pr-8 py-2.5 rounded-xl outline-none"
            style={{ backgroundColor: bg2(), color: textColor() }}
            placeholder={tab === 'installed' ? 'Filter installed apps...' : 'Search apps and integrations...'}
            value={search}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && search.length >= 2) { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); executeSearch(search); } }}
          />
          {search && (
            <button onClick={() => handleSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 opacity-30">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category pills — Discover tab only */}
      {tab === 'discover' && (
        <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto shrink-0 no-scrollbar">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => { setCategory(c.id); haptic(); }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0"
              style={{
                backgroundColor: category === c.id ? accent() : 'rgba(255,255,255,0.06)',
                color: category === c.id ? '#fff' : textColor(),
                opacity: category === c.id ? 1 : 0.5,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 mx-4 mb-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}>
          <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: '#f59e0b' }} />
          <p className="text-[12px] flex-1" style={{ color: '#f59e0b' }}>{error}</p>
          <button onClick={() => setError(null)}><X size={12} style={{ color: '#f59e0b' }} /></button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <SkeletonList count={6} />
        ) : tab === 'installed' ? (
          <InstalledTabContent
            apps={yourApps}
            search={search}
            onAppClick={openDetail}
          />
        ) : isSearching ? (
          <div className="space-y-1">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-12 opacity-30">
                <Loader2 size={14} className="animate-spin" /> <span className="text-[12px]">Searching all sources...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <EmptyState icon={Search} message={`No results for "${search}"`} />
            ) : (
              searchResults.map(app => (
                <AppListItem key={app.id} app={app} onClick={() => openDetail(app)} />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Made for Construct */}
            {registryList.length > 0 && (
              <section>
                <p className="text-[14px] font-bold opacity-80 mb-1">Made for Construct</p>
                {registryList.map(app => (
                  <AppListItem key={app.id} app={app} onClick={() => openDetail(app)} />
                ))}
              </section>
            )}

            {/* Integrations by category */}
            {suggestedByCategory.map(([cat, apps]) => (
              <section key={cat}>
                <p className="text-[14px] font-bold opacity-80 mb-1">{CATEGORY_LABELS[cat] || cat}</p>
                {apps.map(app => (
                  <AppListItem key={app.id} app={app} onClick={() => openDetail(app)} />
                ))}
              </section>
            ))}

            {suggested.length === 0 && registryList.length === 0 && (
              <EmptyState icon={Package} message="No apps available" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Installed Tab ──

function InstalledTabContent({ apps, search, onAppClick }: {
  apps: UnifiedApp[]; search: string;
  onAppClick: (app: UnifiedApp) => void;
}) {
  const query = search.toLowerCase().trim();
  const filtered = query
    ? apps.filter(a => a.name.toLowerCase().includes(query) || a.description.toLowerCase().includes(query) || a.composioSlug?.includes(query) || a.id.includes(query))
    : apps;

  const mcpApps = filtered.filter(a => a.source !== 'composio' && !a.isSkill);
  const skillApps = filtered.filter(a => a.isSkill);
  const composioApps = filtered.filter(a => a.source === 'composio');

  if (filtered.length === 0) {
    return query
      ? <EmptyState icon={Search} message={`No installed apps matching "${search}"`} />
      : <EmptyState icon={Package} message="No apps installed" />;
  }

  const hasMultiple = [mcpApps.length, skillApps.length, composioApps.length].filter(n => n > 0).length > 1;

  return (
    <div className="space-y-5">
      {mcpApps.length > 0 && (
        <section>
          {hasMultiple && <p className="text-[14px] font-bold opacity-80 mb-1">MCP Apps <span className="opacity-30 text-[13px] font-semibold">{mcpApps.length}</span></p>}
          {mcpApps.map(app => <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} />)}
        </section>
      )}
      {skillApps.length > 0 && (
        <section>
          {hasMultiple && <p className="text-[14px] font-bold opacity-80 mb-1">Skills <span className="opacity-30 text-[13px] font-semibold">{skillApps.length}</span></p>}
          {skillApps.map(app => <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} />)}
        </section>
      )}
      {composioApps.length > 0 && (
        <section>
          {hasMultiple && <p className="text-[14px] font-bold opacity-80 mb-1">Integrations <span className="opacity-30 text-[13px] font-semibold">{composioApps.length}</span></p>}
          {composioApps.map(app => <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} />)}
        </section>
      )}
    </div>
  );
}

// ── App List Item ──

function AppListItem({ app, onClick }: { app: UnifiedApp; onClick: () => void }) {
  const added = app.status !== 'available';
  const isComposio = app.source === 'composio';
  const isSkill = !!app.isSkill;

  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 py-2 text-left active:bg-white/5 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        {app.icon ? (
          <img src={app.icon} alt="" className="w-7 h-7 rounded-md object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <span className="text-[16px]">{isSkill ? '✦' : app.source === 'smithery' ? '🔮' : isComposio ? '🔗' : '📦'}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-semibold truncate" style={{ color: textColor() }}>{app.name}</span>
          {(isComposio || app.verified) && (
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
              <Check size={8} style={{ color: '#22c55e' }} strokeWidth={3} />
            </span>
          )}
        </div>
        <p className="text-[11px] opacity-35 truncate">{app.description}</p>
        <p className="text-[10px] opacity-20 truncate">
          {isSkill && <span style={{ color: '#a855f7' }}>Skill</span>}
          {isSkill && app.author && ' · '}
          {app.author || (app.sourceUrl ? getHostname(app.sourceUrl) : '')}
          {app.popularity !== undefined && app.popularity > 0 && ` · ${app.popularity >= 1000 ? `${(app.popularity / 1000).toFixed(1)}K` : app.popularity} installs`}
        </p>
      </div>

      {/* CTA */}
      <div className="shrink-0">
        {added ? (
          <span className="text-[11px] font-bold px-3 py-1 rounded-full" style={{ backgroundColor: `${accent()}15`, color: accent() }}>
            Open
          </span>
        ) : app.unavailable ? (
          <span className="text-[10px] font-medium px-3 py-1 rounded-full opacity-20">
            N/A
          </span>
        ) : app.requiresUpgrade ? (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
            Pro
          </span>
        ) : (
          <span className="text-[11px] font-bold px-3.5 py-1 rounded-full" style={{ backgroundColor: `${accent()}15`, color: accent() }}>
            Get
          </span>
        )}
      </div>
    </button>
  );
}
