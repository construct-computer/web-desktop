/**
 * App Store — unified app discovery, installation, and management.
 *
 * Aggregates three sources into one seamless experience:
 *   Composio    — Managed third-party integrations (Google, GitHub, Notion, etc.)
 *   Smithery    — Community MCP servers from the Smithery marketplace
 *   Registry    — Curated Construct apps with custom UI capabilities
 *
 * Every integration appears as an "app" regardless of how it's delivered.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Package, Loader2, Play, Terminal,
  Check, X, AlertCircle, RefreshCw, ChevronLeft, Wrench, Monitor,
  User, Tag, KeyRound, Shield, ShieldAlert, Settings2, ExternalLink,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import type { InstalledApp } from '@/services/api';
import { useAppStore } from '@/stores/appStore';
import { useBillingStore } from '@/stores/billingStore';
import { useWindowStore } from '@/stores/windowStore';
import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';
import { openAuthRedirect } from '@/lib/utils';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

// ── Source-specific types (match backend API responses) ──

interface RegistryApp {
  id: string;
  name: string;
  description: string;
  latest_version: string;
  author: { name: string; url?: string };
  category: string;
  tags: string[];
  repo_url: string;
  icon_url?: string;
  base_url?: string;
  has_ui: boolean;
  tools: Array<{ name: string; description: string }>;
  install_count: number;
  featured: boolean;
  verified?: boolean;
}

interface SmitheryServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  useCount: number;
  verified: boolean;
  remote: boolean;
  isDeployed?: boolean;
}

interface SmitheryServerDetail {
  qualifiedName: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  remote: boolean;
  deploymentUrl: string | null;
  connections: Array<{
    type: 'stdio' | 'http';
    configSchema?: ConfigSchema;
    deploymentUrl?: string;
    bundleUrl?: string;
  }>;
  tools: Array<{
    name: string;
    description: string | null;
    inputSchema?: Record<string, unknown>;
  }> | null;
  security: { scanPassed: boolean } | null;
}

interface SmitherySkill {
  qualifiedName: string;
  displayName: string;
  description: string;
  namespace?: string;
  slug?: string;
  gitUrl?: string;
  categories?: string[];
  totalActivations?: number;
  uniqueUsers?: number;
  externalStars?: number;
  verified?: boolean;
  qualityScore?: number;
}

interface SmitherySkillDetail {
  qualifiedName: string;
  displayName: string;
  description: string;
  namespace?: string;
  slug?: string;
  prompt?: string;
  gitUrl?: string;
  categories?: string[];
  totalActivations?: number;
  uniqueUsers?: number;
  externalStars?: number;
  externalForks?: number;
  verified?: boolean;
  qualityScore?: number;
}

interface ConfigSchema {
  type: string;
  required?: string[];
  properties?: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
  }>;
}

// ── Unified app model ──

type Category = 'all' | 'productivity' | 'communication' | 'dev-tools' | 'data' | 'search';

interface UnifiedApp {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: Category | string;
  tags: string[];
  source: 'registry' | 'smithery' | 'composio' | 'installed' | 'skill';
  tools: Array<{ name: string; description?: string | null }>;
  hasUi: boolean;
  /** Whether this is a skill (prompt-based knowledge, not an MCP server). */
  isSkill?: boolean;
  status: 'available' | 'installed' | 'connected' | 'running' | 'error' | 'stopped' | 'starting';
  featured?: boolean;
  verified?: boolean;
  popularity?: number;
  version?: string;
  author?: string;
  authorUrl?: string;
  repoUrl?: string;
  sourceUrl?: string;
  transport?: string;
  runtime?: string;
  errorMessage?: string;
  /** Smithery OAuth: app is installed but requires authorization before use. */
  authRequired?: boolean;
  authorizationUrl?: string;
  /** Server has no usable connection (stub listing). */
  unavailable?: boolean;
  // Source-specific data (preserved for actions)
  registryApp?: RegistryApp;
  smitheryServer?: SmitheryServer;
  smitheryDetail?: SmitheryServerDetail;
  installedApp?: InstalledApp;
  composioSlug?: string;
  composioLogo?: string;
  configSchema?: ConfigSchema;
  /** Smithery skill data. */
  smitherySkill?: SmitherySkill;
  smitherySkillDetail?: SmitherySkillDetail;
  /** Skill content preview (SKILL.md body). */
  skillContent?: string;
  /** Auth schemes required (e.g. ["OAUTH2"], ["API_KEY"]). */
  authSchemes?: string[];
  /** Detailed auth field requirements from Composio. */
  authConfig?: Array<{
    mode: string;
    fields: Array<{ name: string; displayName: string; description?: string; required: boolean }>;
  }>;
  /** True if Composio handles auth natively (managed OAuth — just click to connect). */
  composioManaged?: boolean;
}

// ── Categories ──

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Communication' },
  { id: 'dev-tools', label: 'Developer' },
  { id: 'data', label: 'Data & Files' },
  { id: 'search', label: 'Search & Web' },
];

// ── Curated integrations (fetched from registry, with hardcoded fallback) ──

interface CuratedDef {
  slug: string;
  name: string;
  description: string;
  category: Exclude<Category, 'all'>;
  source?: string;
}

/** Hardcoded fallback — used when the registry API is unavailable. */
const FALLBACK_CURATED: CuratedDef[] = [
  { slug: 'googlecalendar', name: 'Google Calendar', description: 'Manage events and scheduling.', category: 'productivity' },
  { slug: 'notion', name: 'Notion', description: 'Manage pages and databases.', category: 'productivity' },
  { slug: 'todoist', name: 'Todoist', description: 'Create and manage tasks and projects.', category: 'productivity' },
  { slug: 'trello', name: 'Trello', description: 'Organize boards, lists, and cards.', category: 'productivity' },
  { slug: 'gmail', name: 'Gmail', description: 'Read, compose, and manage email.', category: 'communication' },
  { slug: 'hubspot', name: 'HubSpot', description: 'Manage contacts, deals, and CRM.', category: 'communication' },
  { slug: 'intercom', name: 'Intercom', description: 'Manage customer conversations.', category: 'communication' },
  { slug: 'mailchimp', name: 'Mailchimp', description: 'Create and manage email campaigns.', category: 'communication' },
  { slug: 'github', name: 'GitHub', description: 'Manage repos, issues, and PRs.', category: 'dev-tools' },
  { slug: 'linear', name: 'Linear', description: 'Track issues and plan sprints.', category: 'dev-tools' },
  { slug: 'jira', name: 'Jira', description: 'Manage projects, sprints, and boards.', category: 'dev-tools' },
  { slug: 'sentry', name: 'Sentry', description: 'Monitor errors and performance.', category: 'dev-tools' },
  { slug: 'googledrive', name: 'Google Drive', description: 'Access and organize cloud files.', category: 'data' },
  { slug: 'googlesheets', name: 'Google Sheets', description: 'Create and manage spreadsheets.', category: 'data' },
  { slug: 'airtable', name: 'Airtable', description: 'Manage databases, views, and records.', category: 'data' },
  { slug: 'dropbox', name: 'Dropbox', description: 'Store and share files in the cloud.', category: 'data' },
];

/** Slugs hidden from Composio/Smithery results — we have custom integrations for these. */
const HIDDEN_SLUGS = new Set(['slack', 'telegram']);

const CATEGORY_SECTION_LABELS: Record<string, string> = {
  productivity: 'Productivity',
  communication: 'Communication',
  'dev-tools': 'Developer Tools',
  data: 'Data & Files',
  search: 'Search & Web',
};

/** Group apps by category, preserving a fixed category order. */
function groupByCategory(apps: UnifiedApp[]): Array<[string, UnifiedApp[]]> {
  const order = ['productivity', 'communication', 'dev-tools', 'data', 'search'];
  const groups = new Map<string, UnifiedApp[]>();
  for (const app of apps) {
    const cat = app.category as string;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(app);
  }
  return order.filter(c => groups.has(c)).map(c => [c, groups.get(c)!]);
}

// ── Helpers ──

function getInstalledAppIconUrl(appId: string, hasIcon: boolean): string | undefined {
  if (!hasIcon) return undefined;
  const token = localStorage.getItem(STORAGE_KEYS.token) || '';
  return `${API_BASE_URL}/apps/${encodeURIComponent(appId)}/icon?token=${encodeURIComponent(token)}`;
}

function isSensitiveField(name: string): boolean {
  const lower = name.toLowerCase();
  return ['key', 'secret', 'token', 'password', 'api_key', 'apikey', 'auth'].some(s => lower.includes(s));
}

function composioIconUrl(slug: string, logo?: string): string {
  return logo || `https://logos.composio.dev/api/${slug}`;
}

function mapRegistryCategory(cat?: string): Exclude<Category, 'all'> {
  if (!cat) return 'productivity';
  const lower = cat.toLowerCase();
  if (lower.includes('dev') || lower.includes('code') || lower.includes('git')) return 'dev-tools';
  if (lower.includes('data') || lower.includes('file') || lower.includes('storage')) return 'data';
  if (lower.includes('search') || lower.includes('web') || lower.includes('browser')) return 'search';
  if (lower.includes('comm') || lower.includes('email') || lower.includes('chat') || lower.includes('message')) return 'communication';
  return 'productivity';
}

/** Infer a category from an app's slug, name, and description. */
function inferCategory(slug: string, name: string, description: string, curatedApps?: CuratedDef[]): Exclude<Category, 'all'> {
  // Known curated app → use its curated category
  const list = curatedApps || FALLBACK_CURATED;
  const curated = list.find(f => f.slug === slug.toLowerCase());
  if (curated) return curated.category;

  const text = `${slug} ${name} ${description}`.toLowerCase();
  if (text.match(/\b(git|code|repo|ci\/cd|deploy|dev|build|test|debug|ide|lint|npm|docker|jenkins|vercel|netlify|sentry|jira|linear)\b/)) return 'dev-tools';
  if (text.match(/\b(email|mail|chat|messag|slack|discord|teams|telegram|sms|voice|zoom|meet|call|video)\b/)) return 'communication';
  if (text.match(/\b(file|drive|storage|document|sheet|data|database|csv|excel|pdf|dropbox|airtable|notion|docs|s3|bucket|upload)\b/)) return 'data';
  if (text.match(/\b(search|web|browse|scrape|crawl|seo|google|bing|fetch|http|url)\b/)) return 'search';
  return 'productivity';
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'composio': return 'Integration';
    case 'smithery': return 'MCP Server';
    case 'registry': return 'Construct App';
    case 'skill': return 'Skill';
    default: return '';
  }
}

/** Show a compact green tick for verified sources. */
function VerifiedTick({ app }: { app: { source: string; verified?: boolean } }) {
  if (app.source === 'composio' || app.verified) {
    return (
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500/15 flex-shrink-0" title="Verified">
        <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
      </span>
    );
  }
  return null;
}

function getHostname(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

/** Priority: installed > composio > registry > skill > smithery (lower = better). */
const SOURCE_PRIORITY: Record<string, number> = { installed: 0, composio: 1, registry: 2, skill: 3, smithery: 4 };

/**
 * Deduplicate apps that refer to the same service across sources.
 * Normalises names to a canonical key (strips noise words, punctuation,
 * common suffixes like "mcp", "server", "integration") then keeps the
 * highest-priority source per key.
 */
function deduplicateApps(apps: UnifiedApp[]): UnifiedApp[] {
  const normalize = (name: string): string =>
    name.toLowerCase()
      .replace(/[^a-z0-9]/g, '')                       // strip punctuation/spaces
      .replace(/(mcp|server|integration|tool|api|bot|app|plugin)$/g, ''); // strip noise suffixes

  const seen = new Map<string, { app: UnifiedApp; idx: number }>();
  const result: UnifiedApp[] = [];

  for (const app of apps) {
    const key = normalize(app.name);
    if (!key) { result.push(app); continue; }

    const existing = seen.get(key);
    if (existing) {
      const existingPri = SOURCE_PRIORITY[existing.app.source] ?? 9;
      const newPri = SOURCE_PRIORITY[app.source] ?? 9;
      if (newPri < existingPri) {
        // Replace: new source is higher priority
        result[existing.idx] = app;
        seen.set(key, { app, idx: existing.idx });
      }
      // Otherwise skip the lower-priority duplicate
    } else {
      const idx = result.length;
      result.push(app);
      seen.set(key, { app, idx });
    }
  }

  return result;
}

// ── Normalizers (source → UnifiedApp) ──

function registryToUnified(app: RegistryApp, installed: boolean): UnifiedApp {
  return {
    id: `registry-${app.id}`, name: app.name, description: app.description,
    icon: app.icon_url, category: mapRegistryCategory(app.category),
    tags: app.tags || [], source: 'registry', tools: app.tools || [],
    hasUi: app.has_ui, status: installed ? 'installed' : 'available',
    featured: app.featured, verified: app.verified ?? app.featured, popularity: app.install_count,
    version: app.latest_version, author: app.author?.name,
    authorUrl: app.author?.url, repoUrl: app.repo_url,
    sourceUrl: app.repo_url || undefined,
    registryApp: app,
  };
}

function smitheryToUnified(srv: SmitheryServer, installed: boolean, curated?: CuratedDef[]): UnifiedApp {
  // Normalize ID to match backend's effectiveId format
  const normalizedId = `smithery-${srv.qualifiedName}`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  // A server with isDeployed explicitly false is a stub listing (no usable connection)
  const isStub = srv.isDeployed === false;
  return {
    id: normalizedId,
    name: srv.displayName || srv.qualifiedName,
    description: srv.description, icon: srv.iconUrl,
    category: inferCategory(srv.qualifiedName, srv.displayName, srv.description, curated),
    tags: ['mcp', srv.remote ? 'remote' : 'local'],
    source: 'smithery', tools: [], hasUi: false,
    status: installed ? 'installed' : 'available',
    verified: srv.verified, popularity: srv.useCount || 0,
    sourceUrl: `https://smithery.ai/server/${srv.qualifiedName}`,
    smitheryServer: srv,
    unavailable: isStub || undefined,
  };
}

function composioToUnified(def: CuratedDef, connected: boolean): UnifiedApp {
  return {
    id: `composio-${def.slug}`, name: def.name, description: def.description,
    icon: composioIconUrl(def.slug), category: def.category,
    tags: ['integration'], source: 'composio', tools: [], hasUi: false,
    status: connected ? 'connected' : 'available', composioSlug: def.slug,
    verified: true,
    sourceUrl: `https://composio.dev/toolkits/${def.slug}`,
  };
}

function composioSearchToUnified(
  t: { slug: string; name: string; description: string; logo?: string; auth_schemes?: string[]; no_auth?: boolean },
  connected: boolean,
  curated?: CuratedDef[],
): UnifiedApp {
  return {
    id: `composio-${t.slug}`, name: t.name, description: t.description || t.slug,
    icon: composioIconUrl(t.slug, t.logo),
    category: inferCategory(t.slug, t.name, t.description || '', curated),
    tags: ['integration'], source: 'composio', tools: [], hasUi: false,
    status: connected ? 'connected' : 'available',
    composioSlug: t.slug, composioLogo: t.logo, verified: true,
    sourceUrl: `https://composio.dev/toolkits/${t.slug}`,
    authSchemes: Array.isArray(t.auth_schemes)
      ? t.auth_schemes.map((s: any) => typeof s === 'string' ? s : s?.mode || s?.auth_mode || 'unknown')
      : [],
  };
}

function installedToUnified(app: InstalledApp): UnifiedApp {
  return {
    id: app.id,
    name: app.name || app.id,
    description: app.description || '',
    icon: app.icon_url || getInstalledAppIconUrl(app.id, !!app.icon_url),
    category: mapRegistryCategory(undefined),
    tags: ['mcp'],
    source: 'installed',
    tools: app.tools || [],
    hasUi: !!app.has_ui,
    status: 'installed',
    installedApp: app,
  };
}

/** GitHub avatar URL from a Smithery namespace (namespace = GitHub org/user). */
function skillAvatarUrl(namespace?: string): string | undefined {
  if (!namespace) return undefined;
  return `https://avatars.githubusercontent.com/${encodeURIComponent(namespace)}?s=64`;
}

function smitherySkillToUnified(skill: SmitherySkill, installed: boolean): UnifiedApp {
  const ns = skill.namespace || skill.qualifiedName?.split('/')[0];
  return {
    id: `skill-${skill.qualifiedName}`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase(),
    name: skill.qualifiedName || skill.displayName,
    description: skill.description || 'Smithery Skill',
    icon: skillAvatarUrl(ns),
    category: inferCategory(skill.qualifiedName, skill.displayName, skill.description || ''),
    tags: skill.categories || ['skill'],
    source: 'skill',
    tools: [],
    hasUi: false,
    isSkill: true,
    status: installed ? 'installed' : 'available',
    author: ns,
    verified: skill.verified || false,
    popularity: skill.totalActivations || 0,
    sourceUrl: `https://smithery.ai/skills/${skill.qualifiedName}`,
    smitherySkill: skill,
  };
}

// ── Main Component ──

type Tab = 'discover' | 'installed';

export function AppRegistryWindow({ config: _config }: { config: WindowConfig }) {
  const openWindow = useWindowStore((s) => s.openWindow);
  const [tab, setTab] = useState<Tab>('discover');
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  // Source data
  const [curatedApps, setCuratedApps] = useState<CuratedDef[]>(FALLBACK_CURATED);
  const [registryApps, setRegistryApps] = useState<RegistryApp[]>([]);
  const [smitheryResults, setSmitheryResults] = useState<SmitheryServer[]>([]);
  const [composioResults, setComposioResults] = useState<Array<{ slug: string; name: string; description: string; logo?: string; auth_schemes?: string[]; no_auth?: boolean }>>([]);
  const [skillResults, setSkillResults] = useState<SmitherySkill[]>([]);

  // Installed / connected
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [connectedToolkits, setConnectedToolkits] = useState<Set<string>>(new Set());

  // Loading / errors
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail view
  const [detail, setDetail] = useState<UnifiedApp | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  // Plan limits
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const maxApps = (subscription?.planLimits as Record<string, number> | undefined)?.maxInstalledApps ?? -1;
  const atAppLimit = maxApps > 0 && installedApps.length >= maxApps;

  // Actions
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);
  const [uninstallConfirm, setUninstallConfirm] = useState<{ appId: string; appName: string } | null>(null);

  // Refs
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Launchpad sync + cross-window reactivity
  const syncLaunchpad = useAppStore((s) => s.fetchApps);
  const globalInstalledApps = useAppStore((s) => s.installedApps);
  const globalConnectedToolkits = useAppStore((s) => s.connectedToolkits);

  // ── Data fetching ──

  const fetchInstalled = useCallback(async () => {
    try {
      const result = await api.listInstalledApps();
      if (result.success && result.data) {
        const apps = result.data.apps || [];
        setInstalledApps(apps);
        setInstalledIds(new Set(apps.map((a) => a.id)));
      }
    } catch (err) {
      console.warn('[AppStore] Failed to list installed apps:', err);
    }
    syncLaunchpad();
  }, [syncLaunchpad]);

  const fetchConnected = useCallback(async () => {
    try {
      const r = await api.getComposioConnected();
      if (r.success && r.data.connected) {
        setConnectedToolkits(new Set(r.data.connected.map((a) => a.toolkit)));
        // Also sync global store so other windows see the update
        syncLaunchpad();
      }
    } catch { /* ignore */ }
  }, [syncLaunchpad]);

  const fetchCurated = useCallback(async () => {
    try {
      const result = await api.getCuratedApps();
      if (result.success && result.data?.apps?.length) {
        const mapped: CuratedDef[] = result.data.apps.map(a => ({
          slug: a.slug,
          name: a.name,
          description: a.description,
          category: (a.category || 'productivity') as Exclude<Category, 'all'>,
          source: a.source,
        }));
        setCuratedApps(mapped);
      }
      // If API fails or returns empty, FALLBACK_CURATED remains active via initial state
    } catch { /* registry unavailable — fallback stays */ }
  }, []);

  const fetchRegistry = useCallback(async () => {
    try {
      const result = await api.searchRegistry();
      if (result.success && result.data) {
        setRegistryApps(result.data.apps || []);
      }
    } catch { /* registry unavailable */ }
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([fetchCurated(), fetchRegistry(), fetchInstalled(), fetchConnected()])
      .finally(() => setLoading(false));
  }, [fetchCurated, fetchRegistry, fetchInstalled, fetchConnected]);

  // Sync from global store when another window (e.g. AppWindow) modifies installed apps or disconnects a toolkit
  useEffect(() => {
    setInstalledApps(globalInstalledApps);
    setInstalledIds(new Set(globalInstalledApps.map((a) => a.id)));
  }, [globalInstalledApps]);

  useEffect(() => {
    setConnectedToolkits(new Set(globalConnectedToolkits.map((t) => t.toolkit)));
  }, [globalConnectedToolkits]);

  // Detect auth completion when user returns from OAuth popup
  useEffect(() => {
    if (!connectingToolkit) return;
    const focusHandler = () => {
      setTimeout(async () => {
        await fetchConnected();
        setConnectingToolkit(null);
      }, 500);
    };
    const messageHandler = (e: MessageEvent) => {
      if (e.data?.type === 'composio:connected') {
        fetchConnected();
        syncLaunchpad();
        setConnectingToolkit(null);
      }
    };
    window.addEventListener('focus', focusHandler);
    window.addEventListener('message', messageHandler);
    return () => {
      window.removeEventListener('focus', focusHandler);
      window.removeEventListener('message', messageHandler);
    };
  }, [connectingToolkit, fetchConnected]);

  // ── Search ──

  const executeSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSmitheryResults([]);
      setComposioResults([]);
      setSkillResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const [smithery, composio, skills] = await Promise.allSettled([
      api.searchSmithery(query),
      api.searchComposioToolkits(query),
      api.searchSmitherySkills(query),
    ]);
    if (smithery.status === 'fulfilled' && smithery.value.success && smithery.value.data) {
      setSmitheryResults(smithery.value.data.servers || []);
    }
    if (composio.status === 'fulfilled' && composio.value.success && composio.value.data) {
      setComposioResults(composio.value.data.toolkits || []);
    }
    if (skills.status === 'fulfilled' && skills.value.success && skills.value.data) {
      setSkillResults(skills.value.data.skills || []);
    }
    setSearching(false);
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) {
      setSmitheryResults([]);
      setComposioResults([]);
      setSkillResults([]);
      setSearching(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => executeSearch(query), 400);
  }, [executeSearch]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.length >= 2) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      executeSearch(search);
    }
  };

  // ── Computed lists ──

  const isSearching = search.length >= 2;

  // Your Apps = installed (registry/smithery) + connected Composio
  const yourApps: UnifiedApp[] = [
    ...[...connectedToolkits].map(slug => {
      const known = curatedApps.find(f => f.slug === slug);
      if (known) return composioToUnified(known, true);
      return {
        id: `composio-${slug}`, name: slug.charAt(0).toUpperCase() + slug.slice(1),
        description: 'Connected integration', icon: composioIconUrl(slug),
        category: 'productivity' as Category, tags: ['integration'],
        source: 'composio' as const, tools: [], hasUi: false,
        status: 'connected' as const, composioSlug: slug, verified: true,
      };
    }),
    ...installedApps.map(installedToUnified),
  ].filter(a => category === 'all' || a.category === category);

  // Suggested integrations (curated — connected ones show with "Added" badge)
  const suggested: UnifiedApp[] = curatedApps
    .filter(f => category === 'all' || f.category === category)
    .map(f => composioToUnified(f, connectedToolkits.has(f.slug)));

  // Group suggested by category for section rendering
  const suggestedByCategory = groupByCategory(suggested);

  // Registry apps (filtered by search + category)
  const registryList: UnifiedApp[] = registryApps
    .filter(a => {
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
      }
      return true;
    })
    .filter(a => category === 'all' || mapRegistryCategory(a.category) === category)
    .map(a => registryToUnified(a, installedIds.has(a.id)));

  // Merged search results across all sources (deduplicated, filtered, sorted)
  const searchResults: UnifiedApp[] = isSearching ? deduplicateApps([
    ...composioResults
      .filter(t => !HIDDEN_SLUGS.has(t.slug.toLowerCase()))
      .map(t => composioSearchToUnified(t, connectedToolkits.has(t.slug), curatedApps)),
    ...registryList,
    ...smitheryResults
      .filter(srv => !srv.remote) // Only show local MCPs from Smithery
      .filter(srv => !HIDDEN_SLUGS.has((srv.qualifiedName || '').split('/').pop()?.toLowerCase() || '') && !HIDDEN_SLUGS.has((srv.displayName || '').toLowerCase()))
      .map(srv => {
        // smitheryToUnified already normalizes the ID to match backend
        const app = smitheryToUnified(srv, false, curatedApps);
        return { ...app, status: installedIds.has(app.id) ? 'installed' as const : 'available' as const };
      }),
    ...[...skillResults]
      .sort((a, b) => (b.totalActivations || 0) - (a.totalActivations || 0))
      .map(sk => {
        const app = smitherySkillToUnified(sk, false);
        return { ...app, status: installedIds.has(app.id) ? 'installed' as const : 'available' as const };
      }),
  ])
    .filter(a => !(a.unavailable && !a.verified)) // Hide unverified unavailable stubs
    .filter(a => category === 'all' || a.category === category)
    .sort((a, b) => {
      // Exact name match with search query gets top priority
      const q = search.toLowerCase().trim();
      if (q) {
        const aExact = a.name.toLowerCase() === q ? 1 : 0;
        const bExact = b.name.toLowerCase() === q ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      // Verified first
      if (a.verified && !b.verified) return -1;
      if (!a.verified && b.verified) return 1;
      // Connected / installed first
      const aActive = a.status !== 'available' ? 1 : 0;
      const bActive = b.status !== 'available' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      // Higher source priority first (composio > registry > smithery)
      const aPri = SOURCE_PRIORITY[a.source] ?? 9;
      const bPri = SOURCE_PRIORITY[b.source] ?? 9;
      return aPri - bPri;
    })
  : [];

  // ── Actions ──

  const openDetail = useCallback((app: UnifiedApp) => {
    setDetail(app);
    setConfigValues({});
    setError(null);

    // Smithery: fetch full detail (tools, configSchema, usage stats)
    if (app.source === 'smithery' && app.smitheryServer) {
      setDetailLoading(true);
      api.getSmitheryServerDetail(app.smitheryServer.qualifiedName).then(result => {
        if (result.success && result.data) {
          const d = result.data;
          const conn = d.connections?.find(c => c.type === 'http') || d.connections?.[0];
          setDetail(prev => prev ? {
            ...prev,
            tools: d.tools?.map(t => ({ name: t.name, description: t.description })) || prev.tools,
            description: d.description || prev.description,
            smitheryDetail: d,
            configSchema: conn?.configSchema,
            // Refresh metadata from live Smithery data
            verified: prev.verified,
            sourceUrl: prev.sourceUrl || `https://smithery.ai/server/${app.smitheryServer!.qualifiedName}`,
          } : null);
          // Pre-fill config defaults
          const props = conn?.configSchema?.properties || {};
          const defaults: Record<string, string> = {};
          for (const [key, prop] of Object.entries(props)) {
            if (prop.default !== undefined && prop.default !== '') {
              defaults[key] = String(prop.default);
            }
          }
          setConfigValues(defaults);
        }
        setDetailLoading(false);
      }).catch(() => setDetailLoading(false));
    }

    // Skill: fetch skill detail + SKILL.md content
    if (app.isSkill && app.smitherySkill) {
      setDetailLoading(true);
      api.getSmitherySkillDetail(app.smitherySkill.qualifiedName).then(result => {
        if (result.success && result.data) {
          const d = result.data;
          setDetail(prev => prev ? {
            ...prev,
            description: d.description || prev.description,
            smitherySkillDetail: d,
            skillContent: d.skillContent || d.prompt || undefined,
            sourceUrl: prev.sourceUrl || `https://smithery.ai/skills/${app.smitherySkill!.qualifiedName}`,
            tags: d.categories?.length ? d.categories : prev.tags,
          } : null);
        }
        setDetailLoading(false);
      }).catch(() => setDetailLoading(false));
    }

    // Composio: fetch toolkit detail (tools list, description, categories)
    if (app.source === 'composio' && app.composioSlug) {
      setDetailLoading(true);
      api.getComposioToolkitDetail(app.composioSlug).then(result => {
        if (result.success && result.data) {
          const d = result.data;
          setDetail(prev => prev ? {
            ...prev,
            description: d.description || prev.description,
            icon: d.logo || prev.icon,
            composioLogo: d.logo || prev.composioLogo,
            tools: d.tools?.map(t => ({ name: t.name, description: t.description })) || prev.tools,
            tags: d.categories?.map(c => c.name).filter(Boolean) || prev.tags,
            // Composio auth_schemes is an array of objects: [{mode: "OAUTH2", fields: [...], ...}]
            // Parse into both authSchemes (string labels) and authConfig (full objects)
            authSchemes: Array.isArray(d.auth_schemes)
              ? d.auth_schemes.map((s: any) => typeof s === 'string' ? s : s?.mode || s?.auth_mode || 'unknown')
              : prev.authSchemes,
            authConfig: Array.isArray(d.auth_schemes)
              ? d.auth_schemes
                  .filter((s: any) => typeof s === 'object' && s !== null)
                  .map((s: any) => ({
                    mode: s.mode || s.auth_mode || '',
                    fields: Array.isArray(s.fields) ? s.fields.map((f: any) => ({
                      name: f.name || f.expected_from_customer || '',
                      displayName: f.displayName || f.display_name || f.name || '',
                      description: f.description || '',
                      required: f.required !== false,
                    })) : [],
                  }))
              : prev.authConfig,
            composioManaged: d.composio_managed ?? prev.composioManaged,
          } : null);
        }
        setDetailLoading(false);
      }).catch(() => setDetailLoading(false));
    }
  }, []);

  /** After install, refresh installed list and sync real status into detail view. */
  const refreshDetailAfterInstall = useCallback(async (appId: string) => {
    const result = await api.listInstalledApps();
    if (result.success && result.data) {
      const apps = result.data.apps || [];
      setInstalledApps(apps);
      setInstalledIds(new Set(apps.map((a) => a.id)));

      const installed = apps.find(a => a.id === appId);
      if (installed) {
        setDetail(prev => prev ? {
          ...prev,
          status: 'installed',
          installedApp: installed,
        } : null);
      } else {
        setDetail(prev => prev ? { ...prev, status: 'installed' } : null);
      }
    }
    syncLaunchpad();
  }, [syncLaunchpad]);

  const handleInstallRegistry = async (app: UnifiedApp) => {
    if (!app.registryApp?.repo_url) return;
    if (atAppLimit && !installedIds.has(app.id)) {
      setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade to Pro.`);
      return;
    }
    setError(null);
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    try {
      const result = await api.installApp(app.registryApp.id, {
        name: app.registryApp.name,
        description: app.registryApp.description,
        icon_url: app.registryApp.icon_url,
        base_url: app.registryApp.base_url,
        has_ui: app.registryApp.has_ui,
      });
      if (!result.success) throw new Error((!result.success && result.error) || 'Install failed');
      await refreshDetailAfterInstall(app.registryApp.id);
    } catch (err) {
      setError(`Install failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSmithery = async (app: UnifiedApp) => {
    if (!app.smitheryServer) return;
    if (atAppLimit && !installedIds.has(app.id)) {
      setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade to Pro.`);
      return;
    }
    const qn = app.smitheryServer.qualifiedName;
    const required = new Set(app.configSchema?.required || []);
    for (const field of required) {
      if (!configValues[field]?.trim()) {
        setError(`Required field "${field}" is empty`);
        return;
      }
    }
    setError(null);
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    try {
      const result = await api.installSmitheryServer(qn, configValues, app.name);
      if (!result.success) throw new Error((!result.success && result.error) || 'Install failed');
      if (result.data?.warning) setError(result.data.warning);

      if (result.data?.authRequired && result.data.authorizationUrl) {
        // App requires OAuth — show auth state in detail view
        await fetchInstalled();
        setDetail(prev => prev ? {
          ...prev,
          status: 'installed',
          authRequired: true,
          authorizationUrl: result.data!.authorizationUrl,
        } : null);
      } else {
        await refreshDetailAfterInstall(app.id);
      }
    } catch (err) {
      setError(`Install failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSkill = async (app: UnifiedApp) => {
    if (!app.smitherySkill) return;
    if (atAppLimit && !installedIds.has(app.id)) {
      setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade to Pro.`);
      return;
    }
    const sk = app.smitherySkill;
    setError(null);
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    try {
      const gitUrl = app.smitherySkillDetail?.gitUrl || sk.gitUrl;
      const result = await api.installSmitherySkill(
        sk.qualifiedName,
        sk.displayName,
        app.description,
        gitUrl,
      );
      if (!result.success) throw new Error((!result.success && result.error) || 'Install failed');
      if (result.data?.warning) setError(result.data.warning);
      await refreshDetailAfterInstall(app.id);
    } catch (err) {
      setError(`Install failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleUninstall = async (appId: string, _appName: string) => {
    setError(null);
    setPendingActions(prev => ({ ...prev, [appId]: true }));
    try {
      const result = await api.uninstallApp(appId);
      if (!result.success) throw new Error((!result.success && result.error) || 'Uninstall failed');
      await fetchInstalled();
      setDetail(null);
    } catch (err) {
      setError(`Uninstall failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions(prev => { const n = { ...prev }; delete n[appId]; return n; });
  };

  const handleConnect = async (toolkit: string) => {
    setConnectingToolkit(toolkit);
    try {
      const r = await api.getComposioAuthUrl(toolkit);
      if (r.success && r.data?.url) {
        const connectedAccountId = r.data.connected_account_id || '';
        openAuthRedirect(r.data.url);
        // Listen for the popup's postMessage when OAuth completes
        const onMessage = async (e: MessageEvent) => {
          if (e.data?.type === 'composio:connected') {
            window.removeEventListener('message', onMessage);
            // Finalize the connection (polls Composio until ACTIVE, updates D1)
            if (connectedAccountId) {
              await api.composioFinalize(connectedAccountId);
            } else {
              await api.composioFinalize();
            }
            // Now refresh connected toolkits
            await fetchConnected();
            setConnectingToolkit(null);
            setDetail(prev => prev?.composioSlug === toolkit ? { ...prev, status: 'installed' } : prev);
          }
        };
        window.addEventListener('message', onMessage);
        setTimeout(() => {
          window.removeEventListener('message', onMessage);
          setConnectingToolkit(null);
        }, 300_000);
      } else {
        const msg = (r.success && r.data?.error) || (!r.success && r.error) || `Failed to connect ${toolkit}`;
        setError(typeof msg === 'string' ? msg : `Failed to connect ${toolkit}`);
        setConnectingToolkit(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${toolkit}`);
      setConnectingToolkit(null);
    }
  };

  const handleDisconnect = async (toolkit: string) => {
    setPendingActions(prev => ({ ...prev, [`composio-${toolkit}`]: true }));
    await api.disconnectComposio(toolkit);
    setConnectedToolkits(prev => { const next = new Set(prev); next.delete(toolkit); return next; });
    setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
    setDetail(prev => prev?.composioSlug === toolkit ? { ...prev, status: 'available' } : prev);
  };

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([fetchRegistry(), fetchInstalled(), fetchConnected()])
      .finally(() => setLoading(false));
  };

  // Helper: check if an app is installed/connected (must match list view's "added" check)
  const isAppInstalled = (app: UnifiedApp): boolean => {
    if (app.status !== 'available') return true; // installed, running, connected, error, stopped, starting
    if (app.registryApp && installedIds.has(app.registryApp.id)) return true;
    // Smithery IDs are already normalized to match backend's effectiveId
    if (app.composioSlug && connectedToolkits.has(app.composioSlug)) return true;
    // Installed source apps from "Your Apps" that haven't matched above
    if (app.source === 'installed') return true;
    if (installedIds.has(app.id)) return true;
    return false;
  };

  // ── Render ──

  if (detail) {
    return (
      <div className="relative flex flex-col h-full text-[var(--color-text)] select-none">
        <AppDetailView
          app={detail}
          detailLoading={detailLoading}
          isInstalled={isAppInstalled(detail)}
          isPending={!!pendingActions[detail.id] || connectingToolkit === detail.composioSlug}
          atAppLimit={atAppLimit}
          maxApps={maxApps}
          configValues={configValues}
          onConfigChange={(key, value) => setConfigValues(prev => ({ ...prev, [key]: value }))}
          onBack={() => { setDetail(null); setConfigValues({}); }}
          onInstallRegistry={detail.registryApp ? () => handleInstallRegistry(detail) : undefined}
          onInstallSmithery={detail.smitheryServer && (!detail.smitheryDetail || detail.smitheryDetail.connections.length > 0) ? () => handleInstallSmithery(detail) : undefined}
          onInstallSkill={detail.isSkill && detail.smitherySkill ? () => handleInstallSkill(detail) : undefined}
          onUninstall={(() => {
            // Direct installed app (from "Your Apps")
            if (detail.installedApp && detail.installedApp.id !== 'app-registry') {
              return () => handleUninstall(detail.installedApp!.id, detail.name);
            }
            // Registry app that was installed (from search/browse)
            if (detail.registryApp && installedIds.has(detail.registryApp.id)) {
              return () => handleUninstall(detail.registryApp!.id, detail.name);
            }
            // Smithery app — ID is already normalized to match backend
            if (detail.smitheryServer && installedIds.has(detail.id)) {
              return () => handleUninstall(detail.id, detail.name);
            }
            // Fallback: any app whose ID is in installedIds
            if (installedIds.has(detail.id) && detail.id !== 'app-registry') {
              return () => handleUninstall(detail.id, detail.name);
            }
            return undefined;
          })()}
          onConnect={detail.composioSlug ? () => handleConnect(detail.composioSlug!) : undefined}
          onDisconnect={
            detail.composioSlug && connectedToolkits.has(detail.composioSlug)
              ? () => handleDisconnect(detail.composioSlug!)
              : undefined
          }
          onOpen={isAppInstalled(detail) && !detail.isSkill ? () => {
            // Determine the effective app ID and metadata for opening
            const appId = detail.installedApp?.id
              || detail.registryApp?.id
              || (detail.composioSlug ? detail.id : null)
              || detail.id;
            openWindow('app', {
              title: detail.name,
              icon: detail.icon,
              metadata: {
                appId,
                ...(detail.composioSlug && { composioSlug: detail.composioSlug }),
              },
            } as Partial<WindowConfig>);
          } : undefined}
          error={error}
          onDismissError={() => setError(null)}
        />
      </div>
    );
  }

  // Installed tab count badge
  const installedCount = yourApps.length;

  return (
    <div className="flex flex-col h-full text-[var(--color-text)] select-none">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">Apps</h1>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors text-black/40 dark:text-white/40"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 mb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <button
            onClick={() => { setTab('discover'); setSearch(''); }}
            className={`px-4 py-2 text-xs font-semibold transition-colors relative ${
              tab === 'discover'
                ? 'text-[var(--color-accent)]'
                : 'text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60'
            }`}
          >
            Discover
            {tab === 'discover' && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-accent)] rounded-full" />
            )}
          </button>
          <button
            onClick={() => { setTab('installed'); setSearch(''); }}
            className={`px-4 py-2 text-xs font-semibold transition-colors relative ${
              tab === 'installed'
                ? 'text-[var(--color-accent)]'
                : 'text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60'
            }`}
          >
            Installed
            {installedCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-black/50 dark:text-white/50">
                {installedCount}
              </span>
            )}
            {tab === 'installed' && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-accent)] rounded-full" />
            )}
          </button>
        </div>

        {/* Search bar — always visible */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30 dark:text-white/30 pointer-events-none" />
          <input
            type="text"
            className={`w-full pl-9 ${search ? 'pr-8' : 'pr-4'} py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-sm outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-black/30 dark:placeholder:text-white/25`}
            placeholder={tab === 'installed' ? 'Filter installed apps...' : 'Search apps and integrations...'}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {search && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category pills — only on Discover tab */}
      {tab === 'discover' && (
        <div className="flex-shrink-0 flex gap-1.5 px-5 pt-3 pb-2 overflow-x-auto">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                category === c.id
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-black/60 dark:text-white/50 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 mx-5 mt-1 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 dark:border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-black/25 dark:text-white/30">
            <Loader2 className="w-7 h-7 animate-spin" />
            <p className="text-sm">Loading...</p>
          </div>
        ) : tab === 'installed' ? (
          /* ── Installed Tab ── */
          <InstalledTab
            apps={yourApps}
            search={search}
            onAppClick={openDetail}
            connectingToolkit={connectingToolkit}
            onRefresh={fetchInstalled}
          />
        ) : isSearching ? (
          /* ── Search Results ── */
          <div className="space-y-3">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-black/30 dark:text-white/30">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching all sources...
              </div>
            ) : searchResults.length === 0 ? (
              <EmptyState icon={<Search className="w-8 h-8" />} message={`No results for "${search}"`} sub="Try a different search term or press Enter to search Smithery." />
            ) : (
              <div>
                {searchResults.map((app, i) => (
                  <AppListItem key={app.id} app={app} onClick={() => openDetail(app)} showDivider={i < searchResults.length - 1} connecting={connectingToolkit === app.composioSlug} />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Discover Browse View ── */
          <div className="space-y-6">
            {/* Made for Construct — first-party apps */}
            {registryList.length > 0 && (
              <section>
                <SectionHeader label="Made for Construct" />
                <div className="mt-1">
                  {registryList.map((app, i) => (
                    <AppListItem key={app.id} app={app} onClick={() => openDetail(app)} showDivider={i < registryList.length - 1} />
                  ))}
                </div>
              </section>
            )}

            {/* Integrations — grouped by category, 2-column */}
            {suggestedByCategory.map(([cat, apps]) => (
              <section key={cat}>
                <SectionHeader label={CATEGORY_SECTION_LABELS[cat] || cat} />
                <TwoColumnList apps={apps} onAppClick={openDetail} />
              </section>
            ))}

            {/* Empty */}
            {suggested.length === 0 && registryList.length === 0 && (
              <EmptyState icon={<Package className="w-8 h-8" />} message="No apps available" sub="Try refreshing or searching for something." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Installed Tab ──

function InstalledTab({
  apps,
  search,
  onAppClick,
  connectingToolkit,
  onRefresh,
}: {
  apps: UnifiedApp[];
  search: string;
  onAppClick: (app: UnifiedApp) => void;
  connectingToolkit: string | null;
  onRefresh: () => Promise<void>;
}) {
  // Local filter — filter by name/description matching the search bar
  const query = search.toLowerCase().trim();
  const filtered = query
    ? apps.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.composioSlug?.toLowerCase().includes(query) ||
        a.id.toLowerCase().includes(query)
      )
    : apps;

  // Split into groups: MCP apps, Skills, and Composio integrations
  const mcpApps = filtered.filter(a => a.source !== 'composio' && !a.isSkill);
  const skillApps = filtered.filter(a => a.isSkill);
  const composioApps = filtered.filter(a => a.source === 'composio');

  if (filtered.length === 0) {
    if (query) {
      return (<div><EmptyState icon={<Search className="w-8 h-8" />} message={`No installed apps matching "${search}"`} /><DevInstallSection onRefresh={onRefresh} /></div>);
    }
    return (<div><EmptyState icon={<Package className="w-8 h-8" />} message="No apps installed" sub="Browse the Discover tab to find and install apps." /><DevInstallSection onRefresh={onRefresh} /></div>);
  }

  const hasMultipleSections = [mcpApps.length, skillApps.length, composioApps.length].filter(n => n > 0).length > 1;

  return (
    <div className="space-y-6">
      {mcpApps.length > 0 && (
        <section>
          {hasMultipleSections && <SectionHeader label="MCP Apps" count={mcpApps.length} />}
          <div className="mt-1">
            {mcpApps.map((app, i) => (
              <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} showDivider={i < mcpApps.length - 1} />
            ))}
          </div>
        </section>
      )}
      {skillApps.length > 0 && (
        <section>
          {hasMultipleSections && <SectionHeader label="Skills" count={skillApps.length} />}
          <div className="mt-1">
            {skillApps.map((app, i) => (
              <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} showDivider={i < skillApps.length - 1} />
            ))}
          </div>
        </section>
      )}
      {composioApps.length > 0 && (
        <section>
          {hasMultipleSections && <SectionHeader label="Integrations" count={composioApps.length} />}
          <div className="mt-1">
            {composioApps.map((app, i) => (
              <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} showDivider={i < composioApps.length - 1} connecting={connectingToolkit === app.composioSlug} />
            ))}
          </div>
        </section>
      )}

      <DevInstallSection onRefresh={onRefresh} />
    </div>
  );
}

// ── Developer Install Section ──

function DevInstallSection({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const syncLaunchpad = useAppStore((s) => s.fetchApps);

  const handleInstall = async () => {
    if (!url.trim() || !name.trim()) return;
    setInstalling(true);
    setFeedback(null);
    try {
      const appId = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const result = await api.installApp(appId, { name: name.trim(), base_url: url.trim(), has_ui: false });
      if (result.success) {
        setFeedback({ ok: true, msg: `Installed "${name.trim()}" successfully` });
        setUrl('');
        setName('');
        await onRefresh();
        syncLaunchpad();
      } else {
        setFeedback({ ok: false, msg: result.error || 'Installation failed' });
      }
    } catch (e: unknown) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : 'Installation failed' });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[13px] font-medium text-black/40 dark:text-white/30 hover:text-black/60 dark:hover:text-white/50 transition-colors"
      >
        <Terminal className="w-3.5 h-3.5" />
        Developer Tools
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            placeholder="My Custom App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-1.5 text-[13px] rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/25 outline-none focus:border-black/20 dark:focus:border-white/20"
          />
          <input
            type="text"
            placeholder="https://my-app.workers.dev"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
            className="w-full px-3 py-1.5 text-[13px] rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/25 outline-none focus:border-black/20 dark:focus:border-white/20"
          />
          <button
            onClick={handleInstall}
            disabled={installing || !url.trim() || !name.trim()}
            className="px-3 py-1.5 text-[13px] font-medium rounded-lg bg-black/10 dark:bg-white/10 text-black/70 dark:text-white/70 hover:bg-black/15 dark:hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
            Install from URL
          </button>
          {feedback && (
            <p className={`text-[12px] ${feedback.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {feedback.ok ? <Check className="w-3 h-3 inline mr-1" /> : <AlertCircle className="w-3 h-3 inline mr-1" />}
              {feedback.msg}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ── App Detail View ──

function AppDetailView({
  app, detailLoading, isInstalled, isPending, atAppLimit, maxApps, configValues, onConfigChange,
  onBack, onInstallRegistry, onInstallSmithery, onInstallSkill, onUninstall, onConnect, onDisconnect,
  onOpen, error, onDismissError,
}: {
  app: UnifiedApp;
  detailLoading: boolean;
  isInstalled: boolean;
  isPending: boolean;
  atAppLimit?: boolean;
  maxApps?: number;
  configValues: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  onBack: () => void;
  onInstallRegistry?: () => void;
  onInstallSmithery?: () => void;
  onInstallSkill?: () => void;
  onUninstall?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onOpen?: () => void;
  error: string | null;
  onDismissError: () => void;
}) {
  const toolCount = app.tools?.length || 0;
  const hasConfigSchema = !!(app.configSchema?.properties && Object.keys(app.configSchema.properties).length > 0);
  const isComposio = app.source === 'composio';
  const isSmithery = app.source === 'smithery';
  const isRegistry = app.source === 'registry';
  const isSkill = !!app.isSkill;

  // Confirmation dialog states
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  // Unverified install warning state
  const [showUnverifiedWarning, setShowUnverifiedWarning] = useState(false);

  // Determine action button — unified across all sources
  const canRemove = isInstalled && (
    onUninstall || onDisconnect
  );
  const rawGetAction = onConnect || onInstallRegistry || onInstallSmithery || onInstallSkill;

  // Gate unverified installs behind a warning confirmation
  const onGetAction = rawGetAction ? () => {
    if (!app.verified && !isComposio) {
      setShowUnverifiedWarning(true);
    } else {
      rawGetAction();
    }
  } : undefined;

  let actionButton: React.ReactNode = null;

  if (isPending) {
    // Loading state — universal spinner
    actionButton = (
      <button disabled className="inline-flex items-center justify-center w-[72px] h-[32px] text-xs font-semibold rounded-full bg-[var(--color-accent)] text-white opacity-60 cursor-not-allowed">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </button>
    );
  } else if (isInstalled) {
    // Installed — show Open button + Remove
    actionButton = (
      <div className="flex items-center gap-2.5">
        {onOpen ? (
          <button onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-5 py-1.5 rounded-full bg-[var(--color-accent)] text-white shadow-[0_1px_3px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.15)] hover:brightness-110 active:brightness-95 active:shadow-[0_0px_1px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(0,0,0,0.1)] transition-all">
            <Play className="w-3 h-3 fill-current" /> Open
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-1.5 rounded-full text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/15">
            <Check className="w-3.5 h-3.5" /> Added
          </span>
        )}
        {canRemove && (
          <button onClick={() => setShowUninstallConfirm(true)} disabled={isPending}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-full text-black/35 dark:text-white/30 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/8 dark:hover:bg-red-500/10 transition-all disabled:opacity-40">
            Remove
          </button>
        )}
      </div>
    );
  } else if (onGetAction) {
    // Not installed — "Get" button (disabled if at app limit)
    actionButton = atAppLimit ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/15">
        {maxApps} app limit
      </span>
    ) : (
      <button onClick={onGetAction}
        className="inline-flex items-center justify-center text-xs font-bold px-6 py-1.5 rounded-full bg-[var(--color-accent)] text-white shadow-[0_1px_3px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.15)] hover:brightness-110 active:brightness-95 active:shadow-[0_0px_1px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(0,0,0,0.1)] transition-all">
        Get
      </button>
    );
  } else if (isSmithery && app.smitheryDetail && app.smitheryDetail.connections.length === 0) {
    // Smithery stub — no usable connection method
    actionButton = (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full text-black/25 dark:text-white/20 bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.04]">
        <AlertCircle className="w-3 h-3" /> Unavailable
      </span>
    );
  }

  return (
    <>
      {/* Unverified install warning overlay */}
      {showUnverifiedWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm rounded-xl">
          <div className="mx-6 max-w-sm w-full bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            {/* Warning header */}
            <div className="flex flex-col items-center pt-6 pb-4 px-6">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center mb-3">
                <ShieldAlert className="w-6 h-6 text-amber-500" />
              </div>
              <h3 className="text-sm font-semibold text-black/90 dark:text-white/90 text-center">
                Unverified Publisher
              </h3>
              <p className="mt-2 text-xs text-black/50 dark:text-white/45 text-center leading-relaxed">
                <span className="font-medium text-black/70 dark:text-white/60">{app.name}</span> is published by an unverified
                {isSkill ? ' author' : ' developer'}. It has not been reviewed for safety or quality. Use at your own risk.
              </p>
            </div>
            {/* Buttons */}
            <div className="flex border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                onClick={() => setShowUnverifiedWarning(false)}
                className="flex-1 py-3 text-xs font-semibold text-[var(--color-accent)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors border-r border-black/[0.06] dark:border-white/[0.08]"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowUnverifiedWarning(false); rawGetAction?.(); }}
                className="flex-1 py-3 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-colors"
              >
                Continue Installing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uninstall confirmation overlay */}
      {showUninstallConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm rounded-xl">
          <div className="mx-6 max-w-sm w-full bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <div className="flex flex-col items-center pt-6 pb-4 px-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 dark:bg-red-500/15 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-sm font-semibold text-black/90 dark:text-white/90 text-center">
                Uninstall {app.name}?
              </h3>
              <p className="mt-2 text-xs text-black/50 dark:text-white/45 text-center leading-relaxed">
                This will remove <span className="font-medium text-black/70 dark:text-white/60">{app.name}</span> and
                all its data. This action cannot be undone.
              </p>
            </div>
            <div className="flex border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                onClick={() => setShowUninstallConfirm(false)}
                className="flex-1 py-3 text-xs font-semibold text-[var(--color-accent)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors border-r border-black/[0.06] dark:border-white/[0.08]"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowUninstallConfirm(false); (onUninstall || onDisconnect)?.(); }}
                className="flex-1 py-3 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/5 dark:hover:bg-red-500/10 transition-colors"
              >
                Uninstall
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back bar */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mx-5 mb-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 dark:border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">{error}</p>
          <button onClick={onDismissError} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* Hero */}
        <div className="flex items-start gap-4 mb-5">
          {isComposio ? (
            <div className="w-16 h-16 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
              <ToolkitLogo slug={app.composioSlug || ''} logo={app.composioLogo} size={32} />
            </div>
          ) : (
            <AppIcon url={app.icon} fallback={isSmithery ? '🔮' : '📦'} size="lg" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold leading-tight">{app.name}</h2>
              <VerifiedTick app={app} />
            </div>
            <span className="text-[10px] text-black/35 dark:text-white/35 font-medium mt-0.5 block">
              {app.author && (
                <>{app.authorUrl ? (
                  <a href={app.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-accent)] transition-colors">{app.author}</a>
                ) : app.author}</>
              )}
              {app.sourceUrl && (
                <>{app.author ? ' · ' : ''}<a href={app.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="hover:text-[var(--color-accent)] transition-colors inline-flex items-center gap-0.5">
                  {getHostname(app.sourceUrl)} <ExternalLink className="w-2.5 h-2.5 inline" />
                </a></>
              )}
              {!app.author && !app.sourceUrl && (
                <>{isComposio ? 'Integration' : isSkill ? 'Skill' : isSmithery ? 'MCP Server' : isRegistry ? 'Construct App' : ''}</>
              )}
            </span>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {isSkill && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/15">
                  ✦ Skill
                </span>
              )}
              {app.version && app.version !== '0.0.0' && <Badge>v{app.version}</Badge>}
              {app.hasUi && <Badge>GUI</Badge>}
              {!isSkill && (isSmithery || app.id.startsWith('smithery-')) && (
                app.transport === 'http' || app.smitheryServer?.remote
                  ? <Badge>Remote MCP</Badge>
                  : <Badge>Local MCP</Badge>
              )}
              {/* Source badge shown in header instead */}
              {isSmithery && app.smitheryDetail?.security?.scanPassed && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500"><Shield className="w-2.5 h-2.5" /> Scan Passed</span>
              )}
              {(app.status === 'running' || app.status === 'starting') && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium">
                  <span className={`w-1.5 h-1.5 rounded-full ${app.status === 'running' ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                  <span className="text-black/40 dark:text-white/40">{app.status === 'running' ? 'Running' : 'Starting'}</span>
                </span>
              )}
              {app.authRequired && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-500">
                  <KeyRound className="w-2.5 h-2.5" /> OAuth Required
                </span>
              )}
              {isComposio && !detailLoading && app.authSchemes && app.authSchemes.length > 0 && app.authSchemes.filter(Boolean).map((s, idx) => {
                // authSchemes can be strings ("OAUTH2") or objects ({mode: "OAUTH2", ...})
                const schemeName = typeof s === 'string' ? s : (s as any)?.mode || (s as any)?.auth_mode || (s as any)?.name || 'unknown';
                const upper = String(schemeName).toUpperCase();
                const isOAuth = upper.startsWith('OAUTH');
                const label = AUTH_MODE_LABELS[upper]?.label || schemeName;
                return (
                  <span key={idx} className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                    isOAuth ? 'text-blue-500' : 'text-amber-500'
                  }`}>
                    {isOAuth ? <Shield className="w-2.5 h-2.5" /> : <KeyRound className="w-2.5 h-2.5" />}
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="flex-shrink-0 pt-0.5">{actionButton}</div>
        </div>

        {/* Runtime error */}
        {app.status === 'error' && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 mb-4 rounded-xl bg-red-500/5 dark:bg-red-500/10 border border-red-500/15 dark:border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">Failed to start</p>
              {app.errorMessage && (
                <p className="text-[11px] text-red-500/70 dark:text-red-400/60 mt-0.5 break-words leading-relaxed">{app.errorMessage}</p>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-1.5">About</h3>
          <div className="text-sm text-black/70 dark:text-white/70 leading-relaxed">
            {app.description && app.description.length > 80 ? (
              <Markdown
                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                components={markdownComponents}
              >
                {app.description}
              </Markdown>
            ) : (
              <p>{app.description || 'No description available.'}</p>
            )}
          </div>
        </div>

        {/* Auth requirements — show for non-managed Composio apps that are not yet connected */}
        {isComposio && !isInstalled && !app.composioManaged && !detailLoading && (app.authConfig?.length || app.authSchemes?.length) ? (
          <AuthRequirements authSchemes={app.authSchemes} authConfig={app.authConfig} composioManaged={app.composioManaged} />
        ) : isComposio && !isInstalled && !app.composioManaged && detailLoading ? (
          <div className="flex items-center gap-2 py-3 mb-5 text-black/30 dark:text-white/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Loading auth details...</span>
          </div>
        ) : null}

        {/* Available tools section removed — the existing TOOLS section below handles this */}

        {/* Smithery config form — only show for not-yet-installed apps */}
        {isSmithery && !isInstalled && (
          <div className="mb-5">
            {detailLoading ? (
              <div className="flex items-center gap-2 py-4 text-black/30 dark:text-white/30">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading server details...</span>
              </div>
            ) : hasConfigSchema ? (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-2.5">
                  <Settings2 className="w-3 h-3" /> Configuration
                </h3>
                <div className="space-y-3 p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
                  <ConfigForm schema={app.configSchema!} values={configValues} onChange={onConfigChange} />
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Skill explainer — show for skills instead of tools */}
        {isSkill && (
          <div className="mb-5 px-3.5 py-3 rounded-xl bg-purple-500/5 dark:bg-purple-500/8 border border-purple-500/10 dark:border-purple-500/15">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">How Skills Work</span>
            </div>
            <p className="text-[11px] text-black/50 dark:text-white/45 leading-relaxed">
              Skills are prompt-based knowledge that teach your agent specialized abilities. Unlike MCP apps, skills don&apos;t run a process — they inject expert knowledge directly into the agent&apos;s context so it can perform domain-specific tasks.
            </p>
          </div>
        )}

        {/* Skill content — full SKILL.md rendered as markdown */}
        {isSkill && app.skillContent && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Skill Content</h3>
            <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] p-3 max-h-72 overflow-y-auto">
              <div className="text-[11px] text-black/60 dark:text-white/50 leading-relaxed">
                <Markdown
                  rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                  components={markdownComponents}
                >
                  {app.skillContent}
                </Markdown>
              </div>
            </div>
          </div>
        )}
        {isSkill && detailLoading && !app.skillContent && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Skill Content</h3>
            <div className="flex items-center gap-2 py-4 text-black/30 dark:text-white/30">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading skill content...</span>
            </div>
          </div>
        )}

        {/* Info cards */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {isSkill && <InfoCard icon={<span className="text-[11px]">✦</span>} label="Type" value="Prompt Skill" />}
          {!isSkill && toolCount > 0 && <InfoCard icon={<Wrench className="w-3.5 h-3.5" />} label="Tools" value={`${toolCount} tool${toolCount !== 1 ? 's' : ''}`} />}
          {app.hasUi && <InfoCard icon={<Monitor className="w-3.5 h-3.5" />} label="Interface" value="Has GUI" />}
          {app.sourceUrl && (
            <InfoCard icon={<ExternalLink className="w-3.5 h-3.5" />} label="Source" value={
              <a href={app.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:opacity-80 transition-opacity truncate inline-flex items-center gap-0.5">
                {getHostname(app.sourceUrl)}
              </a>
            } />
          )}
          {app.popularity !== undefined && app.popularity > 0 && (
            <InfoCard icon={<User className="w-3.5 h-3.5" />} label="Installs" value={`${app.popularity >= 1000 ? `${(app.popularity / 1000).toFixed(1)}K` : app.popularity}`} />
          )}
          {isSkill && app.smitherySkill?.externalStars !== undefined && app.smitherySkill.externalStars > 0 && (
            <InfoCard icon={<span className="text-xs">⭐</span>} label="GitHub Stars" value={`${app.smitherySkill.externalStars >= 1000 ? `${(app.smitherySkill.externalStars / 1000).toFixed(1)}K` : app.smitherySkill.externalStars}`} />
          )}
        </div>

        {/* Tools list — hidden for skills */}
        {!isSkill && detailLoading && toolCount === 0 && (isComposio || isSmithery) ? (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Tools</h3>
            <div className="flex items-center gap-2 py-4 text-black/30 dark:text-white/30">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading tools...</span>
            </div>
          </div>
        ) : !isSkill && toolCount > 0 ? (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Tools</h3>
            <div className="space-y-1">
              {app.tools.map((tool) => (
                <div key={tool.name} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
                  <Wrench className="w-3 h-3 text-black/30 dark:text-white/25 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold font-mono text-black/70 dark:text-white/70">{tool.name}</span>
                    {tool.description && <p className="text-[11px] text-black/40 dark:text-white/35 mt-0.5 leading-relaxed line-clamp-2">{tool.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Tags / Categories */}
        {app.tags.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">{isComposio ? 'Categories' : 'Tags'}</h3>
            <div className="flex flex-wrap gap-1.5">
              {app.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/40 border border-black/[0.06] dark:border-white/[0.06]">
                  <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Auth Requirements Display ──

const AUTH_MODE_LABELS: Record<string, { label: string; description: string }> = {
  OAUTH2: { label: 'OAuth 2.0', description: 'Sign in with your account — you\'ll be redirected to authorize.' },
  OAUTH1: { label: 'OAuth 1.0', description: 'Sign in with your account — you\'ll be redirected to authorize.' },
  API_KEY: { label: 'API Key', description: 'You\'ll need to provide credentials from your account settings.' },
  BEARER_TOKEN: { label: 'Bearer Token', description: 'You\'ll need a bearer token from the service.' },
  BASIC: { label: 'Username & Password', description: 'You\'ll need your account username and password.' },
};

function AuthRequirements({ authSchemes, authConfig, composioManaged }: {
  authSchemes?: string[];
  authConfig?: Array<{ mode: string; fields: Array<{ name: string; displayName: string; description?: string; required: boolean }> }>;
  composioManaged?: boolean;
}) {
  // Determine effective auth mode and fields to show
  const configs = authConfig?.filter(c => c.mode) || [];
  const hasFields = configs.some(c => c.fields.length > 0);

  // If no auth info at all, don't render
  if (!configs.length && !authSchemes?.length) return null;

  return (
    <div className="mb-5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
        <KeyRound className="w-3 h-3" /> Setup Required
      </h3>
      <div className="p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
        {configs.map((config, i) => {
          const mode = typeof config.mode === 'string' ? config.mode : '';
          const modeInfo = AUTH_MODE_LABELS[mode.toUpperCase()] || { label: mode || 'Unknown', description: '' };
          const isOAuth = mode.toUpperCase().startsWith('OAUTH');
          const requiredFields = config.fields.filter(f => f.required);
          const optionalFields = config.fields.filter(f => !f.required);

          return (
            <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.06]' : ''}>
              {/* Auth mode badge */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                  isOAuth
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/15'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15'
                }`}>
                  {isOAuth ? <Shield className="w-2.5 h-2.5" /> : <KeyRound className="w-2.5 h-2.5" />}
                  {modeInfo.label}
                </span>
                {composioManaged && isOAuth && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Managed</span>
                )}
              </div>
              <p className="text-[11px] text-black/45 dark:text-white/40 leading-relaxed mb-2">{modeInfo.description}</p>

              {/* Required fields the user must provide */}
              {requiredFields.length > 0 && (
                <div className="space-y-1.5">
                  {requiredFields.map((field) => (
                    <div key={field.name} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]">
                      <div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-black/60 dark:text-white/55">{field.displayName}</span>
                        {field.description && (
                          <p className="text-[10px] text-black/35 dark:text-white/30 leading-relaxed mt-0.5 line-clamp-2">{field.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Optional fields */}
              {optionalFields.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {optionalFields.map((field) => (
                    <div key={field.name} className="flex items-center gap-2 px-2.5 py-1">
                      <div className="w-1 h-1 rounded-full bg-black/15 dark:bg-white/15 flex-shrink-0" />
                      <span className="text-[10px] text-black/35 dark:text-white/30">{field.displayName} <span className="opacity-60">(optional)</span></span>
                    </div>
                  ))}
                </div>
              )}

              {/* OAuth with no user fields — just a note */}
              {isOAuth && !hasFields && (
                <p className="text-[10px] text-black/30 dark:text-white/25 italic">Click "Get" to sign in — no manual setup needed.</p>
              )}
            </div>
          );
        })}

        {/* Fallback: show auth_schemes as badges if no detailed config */}
        {!configs.length && authSchemes && authSchemes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {authSchemes.map((scheme) => {
              const s = typeof scheme === 'string' ? scheme : '';
              const modeInfo = AUTH_MODE_LABELS[s.toUpperCase()] || { label: s || 'Unknown', description: '' };
              const isOAuth = s.toUpperCase().startsWith('OAUTH');
              return (
                <span key={scheme} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                  isOAuth
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/15'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15'
                }`}>
                  {isOAuth ? <Shield className="w-2.5 h-2.5" /> : <KeyRound className="w-2.5 h-2.5" />}
                  {modeInfo.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dynamic Config Form (Smithery JSON Schema) ──

function ConfigForm({
  schema, values, onChange,
}: {
  schema: ConfigSchema;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);

  return (
    <>
      {Object.entries(properties).map(([key, prop]) => {
        const isRequired = required.has(key);
        const isSensitive = isSensitiveField(key);
        const hasEnum = prop.enum && prop.enum.length > 0;
        const value = values[key] || '';

        return (
          <div key={key}>
            <label className="flex items-center gap-1 text-xs font-medium text-black/60 dark:text-white/50 mb-1">
              {isSensitive && <KeyRound className="w-3 h-3 text-amber-500/60" />}
              {key}
              {isRequired && <span className="text-red-400 text-[10px]">*</span>}
            </label>
            {hasEnum ? (
              <select
                className="w-full px-3 py-1.5 rounded-md bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-sm outline-none focus:border-[var(--color-accent)]"
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
              >
                <option value="">Select...</option>
                {prop.enum!.map((opt: unknown) => (
                  <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
                ))}
              </select>
            ) : (
              <input
                type={isSensitive ? 'password' : 'text'}
                className="w-full px-3 py-1.5 rounded-md bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-sm outline-none focus:border-[var(--color-accent)] placeholder:text-black/20 dark:placeholder:text-white/15"
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={prop.default !== undefined ? String(prop.default) : isRequired ? 'Required' : 'Optional'}
              />
            )}
            {prop.description && (
              <p className="text-[10px] text-black/35 dark:text-white/25 mt-0.5 leading-relaxed">{prop.description}</p>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Unified App List Item (used everywhere: browse, search, 2-col) ──

function AppListItem({ app, onClick, showDivider = true, connecting = false }: {
  app: UnifiedApp; onClick: () => void; showDivider?: boolean; connecting?: boolean;
}) {
  const added = app.status === 'connected' || app.status === 'running' || app.status === 'installed'
    || app.status === 'error' || app.status === 'stopped' || app.status === 'starting';
  const isComposio = app.source === 'composio';
  const hostName = app.sourceUrl ? getHostname(app.sourceUrl) : '';
  const attribution = app.author
    ? (hostName ? `${app.author} · ${hostName}` : app.author)
    : (hostName || sourceLabel(app.source));

  return (
    <div className="flex items-center gap-3 cursor-pointer group" onClick={onClick}>
      {/* Icon */}
      {isComposio ? (
        <div className="w-11 h-11 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {connecting ? (
            <Loader2 className="w-5 h-5 animate-spin text-black/30 dark:text-white/30" />
          ) : (
            <ToolkitLogo slug={app.composioSlug || ''} logo={app.composioLogo} size={24} />
          )}
        </div>
      ) : (
        <AppIcon url={app.icon} fallback={app.isSkill ? '✦' : app.source === 'smithery' ? '🔮' : '📦'} />
      )}

      {/* Content — divider starts after icon (macOS style) */}
      <div className={`flex-1 flex items-center gap-2 min-w-0 py-2 ${showDivider ? 'border-b border-black/[0.06] dark:border-white/[0.06]' : ''}`}>
        <div className="flex-1 min-w-0">
          {/* Row 1: Name + verified tick */}
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-semibold truncate leading-tight">{app.name}</span>
            <VerifiedTick app={app} />
          </div>
          {/* Row 2: Description */}
          <span className="text-[11px] text-black/40 dark:text-white/35 block truncate leading-tight mt-0.5">
            {app.description}
          </span>
          {/* Row 3: Author · source · installs (transparency) */}
          <span className="text-[10px] text-black/25 dark:text-white/20 block truncate leading-tight mt-0.5">
            {app.isSkill && <span className="text-purple-500 dark:text-purple-400 font-medium">Skill</span>}
            {app.isSkill && attribution && ' · '}
            {attribution}
            {app.popularity !== undefined && app.popularity > 0 && (
              <> · ↓ {app.popularity >= 1000 ? `${(app.popularity / 1000).toFixed(1)}K` : app.popularity} installs</>
            )}
          </span>
        </div>
        {/* CTA */}
        <div className="flex-shrink-0 ml-1">
          {connecting ? (
            <span className="inline-flex items-center justify-center w-[60px] h-[26px] rounded-full bg-[var(--color-accent)]/10">
              <Loader2 className="w-3 h-3 animate-spin text-[var(--color-accent)]" />
            </span>
          ) : added ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3.5 py-[4px] rounded-full text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/10 shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] group-hover:bg-[var(--color-accent)]/15 group-hover:shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all">
              Open
            </span>
          ) : app.unavailable ? (
            <span className="inline-flex text-[10px] font-medium px-3 py-[4px] rounded-full text-black/25 dark:text-white/20 bg-black/[0.03] dark:bg-white/[0.04]">
              Unavailable
            </span>
          ) : (
            <span className="inline-flex text-[11px] font-bold px-4 py-[4px] rounded-full text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/10 shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] group-hover:bg-[var(--color-accent)]/15 group-hover:shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:shadow-none transition-all">
              Get
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Two-column grid with dividers within each column. */
function TwoColumnList({ apps, onAppClick }: { apps: UnifiedApp[]; onAppClick: (app: UnifiedApp) => void }) {
  const left = apps.filter((_, i) => i % 2 === 0);
  const right = apps.filter((_, i) => i % 2 === 1);

  return (
    <div className="grid grid-cols-2 gap-x-5 mt-1">
      <div>
        {left.map((app, i) => (
          <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} showDivider={i < left.length - 1} />
        ))}
      </div>
      <div>
        {right.map((app, i) => (
          <AppListItem key={app.id} app={app} onClick={() => onAppClick(app)} showDivider={i < right.length - 1} />
        ))}
      </div>
    </div>
  );
}

// ── Shared UI Components ──

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <h2 className="text-[15px] font-bold text-black/80 dark:text-white/80">
      {label}
      {count !== undefined && <span className="text-black/25 dark:text-white/20 font-semibold text-[13px] ml-1.5">{count}</span>}
    </h2>
  );
}

function AppIcon({ url, fallback, size = 'md' }: { url?: string | null; fallback: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dim = size === 'lg' ? 'w-16 h-16' : size === 'sm' ? 'w-8 h-8' : 'w-11 h-11';
  const textSize = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl';
  const rounded = size === 'sm' ? 'rounded-lg' : 'rounded-xl';

  if (!url || failed) {
    return (
      <div className={`${dim} ${rounded} bg-black/[0.06] dark:bg-white/[0.08] flex items-center justify-center ${textSize} flex-shrink-0`}>
        {fallback}
      </div>
    );
  }
  return (
    <img src={url} alt="" className={`${dim} ${rounded} bg-black/[0.06] dark:bg-white/[0.08] object-cover flex-shrink-0`} onError={() => setFailed(true)} />
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
      <div className="text-black/30 dark:text-white/30">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] text-black/35 dark:text-white/30 uppercase tracking-wide">{label}</div>
        <div className="text-xs font-medium text-black/70 dark:text-white/60 truncate">{value}</div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-px rounded bg-black/[0.05] dark:bg-white/[0.08] text-black/50 dark:text-white/40">
      {children}
    </span>
  );
}

function EmptyState({ icon, message, sub }: { icon: React.ReactNode; message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2 text-black/25 dark:text-white/25 px-8">
      <div className="opacity-40">{icon}</div>
      <p className="text-sm text-center">{message}</p>
      {sub && <p className="text-xs text-black/30 dark:text-white/20 text-center">{sub}</p>}
    </div>
  );
}

function ToolkitLogo({ slug, logo, size = 20 }: { slug: string; logo?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = logo || `https://logos.composio.dev/api/${slug}`;
  if (failed) {
    const char = (slug || '?')[0].toUpperCase();
    return (
      <div className="flex items-center justify-center rounded-md font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.5, backgroundColor: '#6366f1' }}>
        {char}
      </div>
    );
  }
  return (
    <img src={url} alt={slug} width={size} height={size} className="object-contain"
      onError={() => setFailed(true)} referrerPolicy="no-referrer" />
  );
}

// ── Markdown / HTML rendering ──

/** Sanitize schema — extends defaults to allow layout attributes on common README HTML. */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), 'src', 'alt', 'width', 'height', 'align'],
    a: [...(defaultSchema.attributes?.a || []), 'href', 'target', 'rel'],
    p: ['align'],
    h1: ['align'],
    h2: ['align'],
    div: ['align'],
  },
};

const markdownComponents = {
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-sm font-bold text-black/80 dark:text-white/80 mt-4 mb-1.5" {...props}>{children}</h3>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="text-sm font-semibold text-black/80 dark:text-white/80 mt-3 mb-1" {...props}>{children}</h4>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 className="text-[13px] font-semibold text-black/70 dark:text-white/70 mt-2.5 mb-1" {...props}>{children}</h5>
  ),
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-2 last:mb-0" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-4 mb-2 space-y-0.5" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-4 mb-2 space-y-0.5" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-sm" {...props}>{children}</li>
  ),
  a: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-[var(--color-accent)] hover:opacity-80 underline underline-offset-2 transition-opacity" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
  ),
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-black/80 dark:text-white/80" {...props}>{children}</strong>
  ),
  code: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <code className="text-xs bg-black/[0.04] dark:bg-white/[0.06] px-1 py-0.5 rounded font-mono" {...props}>{children}</code>
  ),
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="bg-black/[0.04] dark:bg-white/[0.06] rounded-lg p-3 mb-2 overflow-x-auto text-xs" {...props}>{children}</pre>
  ),
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-2 border-black/15 dark:border-white/15 pl-3 italic text-black/50 dark:text-white/50 mb-2" {...props}>{children}</blockquote>
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="border-black/[0.08] dark:border-white/[0.08] my-3" {...props} />
  ),
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="max-w-full h-auto rounded-lg my-2 max-h-48" alt="" loading="lazy" {...props} />
  ),
} as const;
