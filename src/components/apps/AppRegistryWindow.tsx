/**
 * App Registry — discovery and management of Construct apps.
 * Now Unified with all sources (Registry, Smithery, Composio, Skills).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Loader2, RefreshCw, ChevronLeft, X, Check,
  AlertCircle, ExternalLink, Upload, Wrench, Shield,
  Globe, Download, BadgeCheck, Sparkles,
  Lock, KeyRound, Package, Link2, Server, Eye,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import { useAppStore } from '@/stores/appStore';
import { useBillingStore } from '@/stores/billingStore';
import { useWindowStore } from '@/stores/windowStore';
import { ComposioAuthPanel } from './ComposioAuthPanel';
import {
  AppHeroHeader, HeaderIconButton, InfoCard, ToolsList
} from './AppShared';
import { useAppDiscovery, CATEGORY_LABELS, CATEGORIES, getHostname } from '@/hooks/useAppDiscovery';
import type { UnifiedApp } from '@/hooks/useAppDiscovery';

const PUBLISH_URL = 'https://registry.construct.computer/publish';

function getIntegrationExamples(app: UnifiedApp): string[] {
  const slug = (app.composioSlug || app.id || app.name).toLowerCase();
  const text = `${slug} ${app.name} ${app.description}`.toLowerCase();

  if (text.includes('github') || text.includes('git hub')) {
    return [
      'List my open GitHub pull requests',
      'Create a GitHub issue from this summary',
      'Review the latest failing PR checks',
      'Search my repos for recent issues',
    ];
  }
  if (text.includes('google') && text.includes('drive')) {
    return [
      'Find the latest file about the launch plan',
      'Summarize this Google Drive document',
      'Create a project folder in Drive',
      'List recently modified Drive files',
    ];
  }
  if (text.includes('gmail') || text.includes('mail')) {
    return [
      'Summarize emails from today',
      'Draft a reply to the latest customer email',
      'Find invoices in my mailbox',
      'Send a follow-up email',
    ];
  }
  if (text.includes('calendar')) {
    return [
      'List my meetings tomorrow',
      'Schedule a 30 minute follow-up',
      'Find open time this week',
      'Create a calendar event from this plan',
    ];
  }
  if (text.includes('notion')) {
    return [
      'Search my Notion workspace',
      'Create a Notion page from this summary',
      'Find notes about the roadmap',
      'Add these action items to Notion',
    ];
  }
  if (text.includes('linear') || text.includes('jira')) {
    return [
      'List my assigned issues',
      'Create a bug from this report',
      'Move this issue to in progress',
      'Summarize open project work',
    ];
  }
  if (app.source === 'installed' || app.source === 'smithery' || text.includes('mcp') || text.includes('pipedream')) {
    return [
      `Check what ${app.name} can do`,
      `Call a read-only ${app.name} tool`,
      `Use ${app.name} for this task`,
      `Show me the tools available in ${app.name}`,
    ];
  }
  if (app.source === 'composio') {
    return [
      `Use ${app.name} to help with this task`,
      `Search ${app.name} for relevant items`,
      `Create something in ${app.name}`,
      `Show me what ${app.name} tools are available`,
    ];
  }
  return [];
}

// ── Main Component ──

export function AppRegistryWindow({ config }: { config: WindowConfig }) {
  const openWindow = useWindowStore((s) => s.openWindow);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'integrations'>('all');
  const deepLinkRef = useRef<string | null>(null);
  const targetComposioSlugRef = useRef<string | null>(null);
  
  // Use the unified app discovery hook
  const {
    tab, setTab, category, setCategory, search, handleSearch, searching,
    loading, yourApps, suggestedByCategory, registryList, searchResults, isSearching,
    installedIds, connectedToolkits, handleRefresh, fetchInstalled, fetchConnected
  } = useAppDiscovery();

  useEffect(() => {
    const meta = (config.metadata || {}) as { view?: string; category?: string; search?: string; tab?: string; composioSlug?: string };
    const key = JSON.stringify(meta);
    if (deepLinkRef.current === key) return;
    deepLinkRef.current = key;

    if (meta.view === 'integrations') {
      targetComposioSlugRef.current = meta.composioSlug?.toLowerCase() || null;
      setSourceFilter('integrations');
      setTab('discover');
      setCategory((meta.category as any) || 'all');
      handleSearch(meta.search || meta.composioSlug || '');
    }
  }, [config.metadata, handleSearch, setCategory, setTab]);

  const [error, setError] = useState<string | null>(null);

  // Install from URL (MCP / self-hosted)
  const [fromUrl, setFromUrl] = useState('');
  const [fromMcpPath, setFromMcpPath] = useState('/mcp');
  const [fromDisplayName, setFromDisplayName] = useState('');
  const [fromHasUi, setFromHasUi] = useState(false);
  const [probeTools, setProbeTools] = useState<Array<{ name: string; description?: string }> | null>(null);
  const [probeMeta, setProbeMeta] = useState<{
    origin: string;
    mcp_path: string;
    transport?: 'json' | 'sse';
    content_type?: string;
    has_ui_guess?: boolean;
  } | null>(null);
  const [probeAttempted, setProbeAttempted] = useState(false);
  const [lastInstalledName, setLastInstalledName] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [installingUrl, setInstallingUrl] = useState(false);
  const probeSeqRef = useRef(0);

  // Detail view
  const [detail, setDetail] = useState<UnifiedApp | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

  // Plan limits
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const maxApps = (subscription?.planLimits as Record<string, number> | undefined)?.maxInstalledApps ?? -1;
  const atAppLimit = maxApps > 0 && yourApps.length >= maxApps;

  // Sync with global app store
  const syncLaunchpad = useAppStore((s) => s.fetchApps);

  // ── Detail open / close ──

  const openDetail = async (app: UnifiedApp) => {
    setDetail(app);
    setConfigValues({});
    setError(null);

    if (app.source === 'smithery' && app.smitheryServer) {
      setDetailLoading(true);
      const res = await api.getSmitheryServerDetail(app.smitheryServer.qualifiedName);
      if (res.success && res.data) {
        const d = res.data;
        const conn = d.connections?.find((c: any) => c.type === 'http') || d.connections?.[0];
        setDetail(prev => prev ? {
          ...prev, tools: d.tools?.map((t: any) => ({ name: t.name, description: t.description })) || prev.tools,
          smitheryDetail: d as any, configSchema: conn?.configSchema as any,
        } : null);
        const props = conn?.configSchema?.properties || {};
        const defaults: Record<string, string> = {};
        for (const [key, prop] of Object.entries(props)) { if ((prop as any).default !== undefined) defaults[key] = String((prop as any).default); }
        setConfigValues(defaults);
      }
      setDetailLoading(false);
    }

    if (app.isSkill && app.smitherySkill) {
      setDetailLoading(true);
      const res = await api.getSmitherySkillDetail(app.smitherySkill.qualifiedName);
      if (res.success && res.data) {
        const d = res.data;
        setDetail(prev => prev ? { ...prev, smitherySkillDetail: d as any, skillContent: d.skillContent || d.prompt, tags: d.categories?.length ? d.categories : prev.tags } : null);
      }
      setDetailLoading(false);
    }

    if (app.source === 'composio' && app.composioSlug) {
      setDetailLoading(true);
      const res = await api.getComposioToolkitDetail(app.composioSlug);
      if (res.success && res.data) {
        const d = res.data;
        setDetail(prev => prev ? {
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
      }
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailLoading(false);
    setError(null);
  };

  useEffect(() => {
    const targetSlug = targetComposioSlugRef.current;
    if (!targetSlug || loading || searching) return;

    const match = searchResults.find((app) =>
      app.source === 'composio' && app.composioSlug?.toLowerCase() === targetSlug
    );
    if (!match) return;

    targetComposioSlugRef.current = null;
    void openDetail(match);
  }, [loading, searchResults, searching]);

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
    syncLaunchpad();
    setDetail(prev => prev ? { ...prev, status: 'installed' } : null);
  };

  const resetFromUrlProbe = () => {
    setProbeTools(null);
    setProbeMeta(null);
    setProbeAttempted(false);
  };

  const runProbeFromUrl = useCallback(async (mode: 'auto' | 'manual' = 'manual') => {
    if (!fromUrl.trim()) {
      if (mode === 'manual') setError('Enter a URL first.');
      return false;
    }
    if (!isProbeableUrl(fromUrl)) {
      if (mode === 'manual') setError('Enter a valid https:// URL.');
      return false;
    }
    const seq = ++probeSeqRef.current;
    setError(null);
    setProbeAttempted(true);
    setProbeTools(null);
    setProbeMeta(null);
    setProbing(true);
    try {
      const res = await api.probeMcpFromUrl(fromUrl.trim(), fromMcpPath.trim() || '/mcp');
      if (seq !== probeSeqRef.current) return false;
      if (res.success && res.data?.ok) {
        const origin = res.data.origin || '';
        setProbeMeta({
          origin,
          mcp_path: res.data.mcp_path || '/mcp',
          transport: res.data.transport,
          content_type: res.data.content_type,
          has_ui_guess: res.data.has_ui_guess,
        });
        setProbeTools((res.data.tools || []).map((t) => ({ name: t.name, description: t.description || undefined })));
        if (res.data.has_ui_guess) setFromHasUi(true);
        setFromDisplayName(prev => prev.trim() ? prev : getHostname(origin || fromUrl.trim()));
        if (seq === probeSeqRef.current) setProbing(false);
        return true;
      } else {
        const msg =
          (res.success && res.data && 'error' in res.data && (res.data as { error?: string }).error) ||
          (!res.success ? res.error : 'Probe failed');
        setError(typeof msg === 'string' ? msg : 'Probe failed');
      }
    } catch (err) {
      if (seq !== probeSeqRef.current) return false;
      setError(err instanceof Error ? err.message : 'Probe failed');
    }
    if (seq === probeSeqRef.current) setProbing(false);
    return false;
  }, [fromMcpPath, fromUrl]);

  const handleProbeFromUrl = () => {
    void runProbeFromUrl('manual');
  };

  useEffect(() => {
    if (tab !== 'from_url') return;
    if (!fromUrl.trim() || !isProbeableUrl(fromUrl)) return;
    const timer = window.setTimeout(() => {
      void runProbeFromUrl('auto');
    }, 750);
    return () => window.clearTimeout(timer);
  }, [fromMcpPath, fromUrl, runProbeFromUrl, tab]);

  const handleInstallFromUrl = async () => {
    if (!fromUrl.trim()) {
      setError('Enter a URL first.');
      return;
    }
    if (!probeMeta) {
      setError('Run “Check URL” first so we can reach your MCP server.');
      return;
    }
    if (atAppLimit) {
      setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade.`);
      return;
    }
    setInstallingUrl(true);
    setError(null);
    try {
      const res = await api.installAppFromUrl({
        url: fromUrl.trim(),
        mcp_path: fromMcpPath.trim() || '/mcp',
        name: fromDisplayName.trim() || undefined,
        has_ui: fromHasUi,
      });
      if (res.success && res.data?.ok && res.data.app) {
        setLastInstalledName(res.data.app.name);
        setFromUrl('');
        setFromMcpPath('/mcp');
        setFromDisplayName('');
        setFromHasUi(false);
        resetFromUrlProbe();
        await refreshAfterInstall();
      } else {
        setError(!res.success ? res.error : 'Install failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    }
    setInstallingUrl(false);
  };

  const handleInstallRegistry = async (app: UnifiedApp) => {
    if (!app.registryApp) return;
    if (atAppLimit && !installedIds.has(app.registryApp.id)) { setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade.`); return; }
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    try {
      const res = await api.installApp(app.registryApp.id, { name: app.registryApp.name, description: app.registryApp.description, icon_url: app.registryApp.icon_url, base_url: app.registryApp.base_url, has_ui: app.registryApp.has_ui });
      if (res.success) await refreshAfterInstall();
      else setError('Install failed: ' + res.error);
    } catch (err) { setError(`Install failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSmithery = async (app: UnifiedApp) => {
    if (!app.smitheryServer) return;
    if (atAppLimit && !installedIds.has(app.id)) { setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade.`); return; }
    const required = new Set(app.configSchema?.required || []);
    for (const field of required) { if (!configValues[field]?.trim()) { setError(`Required field "${field}" is empty`); return; } }
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    try {
      const res = await api.installSmitheryServer(app.smitheryServer.qualifiedName, configValues, app.name);
      if (res.success) await refreshAfterInstall();
      else setError('Install failed: ' + res.error);
    } catch (err) { setError(`Install failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSkill = async (app: UnifiedApp) => {
    if (!app.smitherySkill) return;
    if (atAppLimit && !installedIds.has(app.id)) { setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade.`); return; }
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    const gitUrl = app.smitherySkillDetail?.gitUrl || app.smitherySkill.gitUrl;
    try {
      const res = await api.installSmitherySkill(app.smitherySkill.qualifiedName, app.smitherySkill.displayName, app.description, gitUrl);
      if (res.success) await refreshAfterInstall();
      else setError('Install failed: ' + res.error);
    } catch (err) { setError(`Install failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleUninstall = async (appId: string) => {
    setPendingActions(prev => ({ ...prev, [appId]: true }));
    try {
      const res = await api.uninstallApp(appId);
      if (res.success) { await fetchInstalled(); syncLaunchpad(); setDetail(null); }
      else setError('Uninstall failed: ' + res.error);
    } catch (err) { setError(`Uninstall failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[appId]; return n; });
  };

  const handleToggleEnabled = async (appId: string, next: boolean) => {
    setPendingActions(prev => ({ ...prev, [`toggle-${appId}`]: true }));
    try {
      const res = await api.toggleAppEnabled(appId, next);
      if (res.success) {
        await fetchInstalled();
        setDetail(prev =>
          prev?.installedApp?.id === appId
            ? { ...prev, installedApp: { ...prev.installedApp, enabled: next } }
            : prev,
        );
      } else {
        setError('Toggle failed: ' + res.error);
      }
    } catch (err) {
      setError(`Toggle failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions(prev => { const n = { ...prev }; delete n[`toggle-${appId}`]; return n; });
  };

  const handleRefreshTools = async (appId: string) => {
    setPendingActions(prev => ({ ...prev, [`refresh-${appId}`]: true }));
    try {
      const res = await api.refreshAppTools(appId);
      if (res.success) {
        await fetchInstalled();
      } else {
        setError('Refresh failed: ' + res.error);
      }
    } catch (err) {
      setError(`Refresh failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions(prev => { const n = { ...prev }; delete n[`refresh-${appId}`]; return n; });
  };

  const handleDisconnect = async (toolkit: string) => {
    setPendingActions(prev => ({ ...prev, [`composio-${toolkit}`]: true }));
    try {
      const res = await api.disconnectComposio(toolkit);
      if (res.success) {
        await fetchConnected();
        setDetail(prev => prev?.composioSlug === toolkit ? { ...prev, status: 'available' } : prev);
      } else { setError('Disconnect failed: ' + res.error); }
    } catch (err) { setError(`Disconnect failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
  };

  const handleOpenInstalled = (app: UnifiedApp) => {
    // Prefer ids from this panel's install list (`installedIds` from fetchInstalled on mount).
    // useAppStore.installedApps is often still empty after a hard refresh until fetchApps()
    // runs elsewhere (e.g. Launchpad), so do not rely on it for registry opens alone.
    let appId =
      app.installedApp?.id ??
      (app.registryApp && installedIds.has(app.registryApp.id) ? app.registryApp.id : undefined);
    if (!appId && installedIds.has(app.id) && app.id !== 'app-registry') {
      appId = app.id;
    }
    if (!appId) {
      const row =
        (app.registryApp &&
          useAppStore.getState().installedApps.find((a) => a.id === app.registryApp!.id)) ??
        useAppStore.getState().installedApps.find((a) => a.id === app.id);
      appId = row?.id;
    }
    if (!appId) return;
    openWindow('app', {
      title: app.name,
      icon: app.icon,
      metadata: { appId },
    } as Partial<WindowConfig>);
  };

  const visibleSearchResults = sourceFilter === 'integrations'
    ? searchResults.filter((app) => app.source === 'composio')
    : searchResults;
  const visibleRegistryList = sourceFilter === 'integrations' ? [] : registryList;

  // ── Detail view ──

  if (detail) {
    const installed = isAppInstalled(detail);
    const isPending = !!pendingActions[detail.id] || !!pendingActions[`composio-${detail.composioSlug}`];
    const isComposio = detail.source === 'composio';
    const isSmithery = detail.source === 'smithery';
    const isSkill = !!detail.isSkill;
    const toolCount = detail.tools?.length || 0;
    const hasConfig = !!(detail.configSchema?.properties && Object.keys(detail.configSchema.properties).length > 0);
    const examples = getIntegrationExamples(detail);

    const getUninstallTarget = (): string | null => {
      if (detail.installedApp && detail.installedApp.id !== 'app-registry') return detail.installedApp.id;
      if (detail.registryApp && installedIds.has(detail.registryApp.id)) return detail.registryApp.id;
      if (detail.smitheryServer && installedIds.has(detail.id)) return detail.id;
      if (installedIds.has(detail.id) && detail.id !== 'app-registry') return detail.id;
      return null;
    };
    const uninstallTarget = getUninstallTarget();

    // For Composio apps the connect UI lives in the body (ComposioAuthPanel),
    // so we don't surface a top-level "Connect" button — the panel's per-scheme
    // buttons handle OAuth / API key / etc.
    const getAction = detail.registryApp ? () => handleInstallRegistry(detail)
      : detail.smitheryServer && (!detail.smitheryDetail || detail.smitheryDetail.connections.length > 0) ? () => handleInstallSmithery(detail)
      : isSkill && detail.smitherySkill ? () => handleInstallSkill(detail)
      : null;

    const isCustomUrlInstall =
      detail.source === 'installed' && detail.installedApp && detail.installedApp.registry_linked === false;
    const sourceLabel =
      detail.author ||
      (isCustomUrlInstall
        ? 'Custom URL'
        : isComposio
          ? 'Integration'
          : isSkill
            ? 'Skill'
            : isSmithery
              ? 'MCP Server'
              : 'Construct App');
    const sourceBadge = isComposio ? 'Integration' : isSkill ? 'Skill' : isCustomUrlInstall ? 'From URL' : 'App';

    return (
      <div className="flex flex-col h-full text-[var(--color-text)] select-none bg-[var(--color-bg-secondary)]">
        {/* Detail header */}
        <div className="flex-shrink-0 px-5 pt-4 pb-0 border-b border-black/[0.06] dark:border-white/[0.06] bg-[var(--color-bg-secondary)] z-10">
          <button
            onClick={closeDetail}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-3"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <AppHeroHeader
            icon={detail.icon}
            fallbackIcon={<Package className="w-7 h-7 opacity-40" />}
            name={detail.name}
            subtitle={`${sourceLabel} · ${CATEGORY_LABELS[detail.category] || detail.category}`}
            description={detail.description || 'No description available.'}
            status={installed ? { label: isComposio ? 'Connected' : 'Installed', tone: 'emerald' } : undefined}
            badges={[
              sourceBadge,
              ...(detail.tags || []),
              ...(detail.verified ? ['Verified'] : []),
              ...(detail.hasUi ? ['Has UI'] : []),
              ...(detail.version ? [`v${detail.version}`] : [])
            ]}
            actions={
              <>
                {detail.sourceUrl && (
                  <HeaderIconButton href={detail.sourceUrl} title="Source/Website">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </HeaderIconButton>
                )}
              </>
            }
            primaryAction={
              <>
                {isPending ? (
                  <button disabled className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white opacity-50 flex items-center gap-2 shadow-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Working...
                  </button>
                ) : installed ? (
                  <>
                    {(detail.hasUi || detail.source === 'installed' || detail.source === 'registry') && (
                      <button
                        onClick={() => handleOpenInstalled(detail)}
                        className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity shadow-sm"
                      >
                        Open Interface
                      </button>
                    )}
                    {(uninstallTarget || (isComposio && connectedToolkits.has(detail.composioSlug!))) && (
                      <button
                        onClick={() => {
                          if (isComposio && detail.composioSlug) handleDisconnect(detail.composioSlug);
                          else if (uninstallTarget) handleUninstall(uninstallTarget);
                        }}
                        className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-red-500 hover:bg-red-500/10 transition-colors shadow-sm"
                      >
                        Remove
                      </button>
                    )}
                  </>
                ) : detail.requiresUpgrade ? (
                  <button
                    onClick={() => window.location.href = '/?settings=subscription'}
                    className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-amber-500/15 text-amber-500 hover:bg-amber-500/20 transition-colors shadow-sm"
                  >
                    Upgrade to Starter
                  </button>
                ) : getAction ? (
                  <button
                    onClick={() => {
                      if (!detail.verified && confirm(`${detail.name} is from an unverified publisher. Install anyway?`)) getAction();
                      else if (detail.verified) getAction();
                    }}
                    className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity shadow-sm"
                  >
                    Install
                  </button>
                ) : isSmithery && detail.smitheryDetail && detail.smitheryDetail.connections.length === 0 ? (
                  <span className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)] shadow-sm">Unavailable</span>
                ) : null}
              </>
            }
          />
        </div>

        {/* Detail body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-[12px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
            </div>
          )}

          {examples.length > 0 && (
            <InfoCard
              title={installed ? 'Ready to try' : 'What you can do'}
              subtitle={installed ? `${toolCount || 'Multiple'} tool${toolCount === 1 ? '' : 's'} available to the agent.` : 'Connect once, then ask the agent in plain English.'}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(example).catch(() => {})}
                    className="text-left text-[11px] px-2.5 py-2 rounded-[8px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.05] hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5 transition-colors"
                    title="Copy example prompt"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </InfoCard>
          )}

          {installed && (isComposio || detail.source === 'installed' || detail.registryApp) && (
            <InfoCard title="Connection status" subtitle="The agent can use this from chat.">
              <div className="flex items-start gap-2.5 rounded-[8px] bg-emerald-500/[0.06] border border-emerald-500/15 px-3 py-2">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {isComposio ? 'Integration connected' : 'App installed'}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    {toolCount > 0
                      ? `${toolCount} tool${toolCount === 1 ? '' : 's'} discovered. Try one of the prompts above.`
                      : 'Tools are available to the agent; refresh the tool list if this panel looks stale.'}
                  </p>
                </div>
              </div>
            </InfoCard>
          )}

          {detail.requiresUpgrade && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] bg-amber-500/10 border border-amber-500/20">
              <Lock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">Upgrade to connect</p>
                <p className="text-[11px] text-amber-500/70 mt-0.5">This integration requires a Starter or Pro plan. Upgrade to unlock access.</p>
              </div>
            </div>
          )}

          {isCustomUrlInstall && (
            <InfoCard title="About this install" subtitle="Connect & OAuth">
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                Apps added by URL are not in the Construct registry, so the App Store cannot show OAuth or API-key Connect
                flows for them. The agent can still call tools if the MCP endpoint is reachable and does not require
                per-user credentials stored in Construct. For full Connect support, publish the app to the registry.
              </p>
            </InfoCard>
          )}

          {isComposio && detail.composioSlug && !installed && !detail.requiresUpgrade && (
            <InfoCard title="Connect this integration" subtitle="Choose how you'd like to sign in.">
              <ComposioAuthPanel
                slug={detail.composioSlug}
                onConnected={() => {
                  fetchConnected();
                  setDetail(prev => {
                    if (!prev) return prev;
                    return prev.composioSlug === detail.composioSlug ? { ...prev, status: 'connected' } : prev;
                  });
                }}
              />
            </InfoCard>
          )}

          {/* Configuration */}
          {isSmithery && !installed && hasConfig && (
            <InfoCard title="Configuration">
              {Object.entries(detail.configSchema!.properties!).map(([key, prop]) => {
                const isRequired = detail.configSchema!.required?.includes(key);
                const sensitive = typeof key === 'string' && ['key', 'secret', 'token', 'password', 'api_key', 'apikey', 'auth'].some(s => key.toLowerCase().includes(s));
                const hasEnum = prop.enum && prop.enum.length > 0;
                return (
                  <div key={key} className="mb-2 last:mb-0">
                    <label className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-muted)] mb-1">
                      {sensitive && <KeyRound className="w-3 h-3 text-amber-500" />}
                      {key}{isRequired && <span className="text-red-400">*</span>}
                    </label>
                    {hasEnum ? (
                      <select
                        value={configValues[key] || ''}
                        onChange={e => setConfigValues(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full text-[12px] px-2.5 py-1.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none focus:border-[var(--color-accent)]/50"
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
                        className="w-full text-[12px] px-2.5 py-1.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none focus:border-[var(--color-accent)]/50 placeholder:text-black/30 dark:placeholder:text-white/30"
                      />
                    )}
                    {prop.description && <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{prop.description}</p>}
                  </div>
                );
              })}
            </InfoCard>
          )}

          {isSkill && detail.skillContent && (
            <InfoCard title="Skill Content">
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                <pre className="text-[11px] text-[var(--color-text-muted)] whitespace-pre-wrap leading-relaxed font-mono p-2 bg-black/[0.04] dark:bg-white/[0.06] rounded-md">
                  {detail.skillContent}
                </pre>
              </div>
            </InfoCard>
          )}

          {detailLoading && toolCount === 0 && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] mb-4">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading details...
            </div>
          )}

          {/* Per-app management (installed MCP apps only) */}
          {detail.installedApp && (() => {
            const ia = detail.installedApp;
            const enabled = ia.enabled !== false;
            const togglePending = !!pendingActions[`toggle-${ia.id}`];
            const refreshPending = !!pendingActions[`refresh-${ia.id}`];
            return (
              <InfoCard title="Manage app" subtitle={enabled ? 'Active for the agent' : 'Hidden from the agent'}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] text-[var(--color-text-muted)] leading-snug">
                      {enabled
                        ? 'The agent can call this app\'s tools. Disable to hide it without uninstalling.'
                        : 'This app is currently hidden from the agent. Enable to make its tools available again.'}
                    </div>
                    <button
                      onClick={() => handleToggleEnabled(ia.id, !enabled)}
                      disabled={togglePending}
                      className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                        enabled
                          ? 'bg-emerald-500/12 text-emerald-600 hover:bg-emerald-500/20'
                          : 'bg-black/[0.06] dark:bg-white/[0.08] text-[var(--color-text-muted)] hover:bg-black/[0.1] dark:hover:bg-white/[0.12]'
                      } disabled:opacity-50`}
                      title={enabled ? 'Disable app' : 'Enable app'}
                    >
                      {togglePending ? <Loader2 className="w-3 h-3 animate-spin" /> : enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-black/[0.05] dark:border-white/[0.05]">
                    <div className="text-[11px] text-[var(--color-text-muted)] leading-snug">
                      Re-fetch this app's tool list from its MCP endpoint.
                    </div>
                    <button
                      onClick={() => handleRefreshTools(ia.id)}
                      disabled={refreshPending}
                      className="px-3 py-1 rounded-md text-[11px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text)] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      title="Refresh tools"
                    >
                      {refreshPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Refresh tools
                    </button>
                  </div>
                </div>
              </InfoCard>
            );
          })()}

          {!isSkill && toolCount > 0 && (
            <ToolsList tools={detail.tools.map(t => ({ slug: t.name, name: t.name, description: t.description || undefined }))} />
          )}
        </div>
      </div>
    );
  }

  // ── List view ──

  return (
    <div className="flex flex-col h-full text-[var(--color-text)] select-none">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-bold">App Store</h1>
            {sourceFilter === 'integrations' && (
              <button
                type="button"
                onClick={() => { setSourceFilter('all'); handleSearch(''); }}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-2 py-0.5 text-[10px] font-semibold hover:bg-[var(--color-accent)]/15"
                title="Show all apps"
              >
                Integrations
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <a
              href={PUBLISH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              title="Publish your own app"
            >
              <Upload className="w-3 h-3" /> Publish
            </a>
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors text-black/40 dark:text-white/40"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 mb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <button
            onClick={() => { setTab('discover'); handleSearch(''); }}
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
            onClick={() => { setTab('installed'); handleSearch(''); }}
            className={`px-4 py-2 text-xs font-semibold transition-colors relative ${
              tab === 'installed'
                ? 'text-[var(--color-accent)]'
                : 'text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60'
            }`}
          >
            Installed
            {yourApps.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-black/50 dark:text-white/50">
                {yourApps.length}
              </span>
            )}
            {tab === 'installed' && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-accent)] rounded-full" />
            )}
          </button>
          <button
            onClick={() => { setTab('from_url'); handleSearch(''); resetFromUrlProbe(); }}
            className={`px-4 py-2 text-xs font-semibold transition-colors relative ${
              tab === 'from_url'
                ? 'text-[var(--color-accent)]'
                : 'text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60'
            }`}
          >
            From URL
            {tab === 'from_url' && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-accent)] rounded-full" />
            )}
          </button>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30 dark:text-white/30 pointer-events-none" />
          <input
            type="text"
            disabled={tab === 'from_url'}
            className={`w-full pl-9 ${search ? 'pr-8' : 'pr-4'} py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-sm outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-black/30 dark:placeholder:text-white/25 disabled:opacity-40 disabled:cursor-not-allowed`}
            placeholder={
              tab === 'from_url'
                ? 'Search is on Discover / Installed…'
                : tab === 'installed'
                  ? 'Filter installed apps...'
                  : sourceFilter === 'integrations'
                    ? 'Search integrations (GitHub, Gmail, Notion...)'
                    : 'Search all apps, integrations, servers...'
            }
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
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

        {/* Categories */}
        {tab === 'discover' && !isSearching && (
          <div className="flex gap-1.5 pb-2 overflow-x-auto shrink-0 custom-scrollbar mb-2">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  category === c.id
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
        {error && (
          <div className="flex items-center gap-2 text-[12px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3 py-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <span className="text-[12px]">Loading apps...</span>
          </div>
        ) : tab === 'from_url' ? (
          <div className="space-y-3">
            {lastInstalledName && (
              <div className="flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 rounded-[12px] px-3 py-2">
                <Check className="w-4 h-4 shrink-0" />
                <span className="flex-1"><strong>{lastInstalledName}</strong> is installed and ready for the agent.</span>
                <button onClick={() => setTab('installed')} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/15">
                  Open installed
                </button>
              </div>
            )}

            <InfoCard
              title="Server"
              subtitle="Paste once. Auto-checks reachability, transport, tools, and UI."
              right={
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--color-accent)/15 bg-(--color-accent)/8 px-2 py-1 text-[10px] font-medium text-(--color-accent)/90"
                  title="Install any remote MCP"
                >
                  <Sparkles className="w-3 h-3" />
                  Remote MCP
                </span>
              }
            >
              <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">MCP URL</label>
              <div className="relative mb-2">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]/60 pointer-events-none" />
                <input
                  type="url"
                  value={fromUrl}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFromUrl(next);
                    setLastInstalledName(null);
                    resetFromUrlProbe();
                    try {
                      const parsed = new URL(next);
                      if (parsed.pathname && parsed.pathname !== '/') setFromMcpPath(parsed.pathname);
                      else setFromMcpPath('/mcp');
                      setFromDisplayName(prev => prev.trim() ? prev : getHostname(parsed.origin));
                    } catch {
                      // Keep typing fluid while the URL is incomplete.
                    }
                  }}
                  placeholder="https://calculator.caseyjhand.com/mcp"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full text-[13px] pl-9 pr-3 py-3 rounded-[12px] bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none focus:border-[var(--color-accent)]/50 transition-colors placeholder:text-black/30 dark:placeholder:text-white/25"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/[0.04] dark:bg-white/[0.06] font-mono max-w-full truncate">
                  <Link2 className="w-3 h-3 shrink-0" />
                  {formatEndpointPreview(fromUrl, fromMcpPath)}
                </span>
                {probing && <span className="inline-flex items-center gap-1 text-[var(--color-accent)]"><Loader2 className="w-3 h-3 animate-spin" /> Checking...</span>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">MCP path</label>
                  <input
                    type="text"
                    value={fromMcpPath}
                    onChange={(e) => {
                      setFromMcpPath(e.target.value);
                      setLastInstalledName(null);
                      resetFromUrlProbe();
                    }}
                    placeholder="/mcp"
                    className="w-full text-[12px] px-2.5 py-2 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none focus:border-[var(--color-accent)]/50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">Display name</label>
                  <input
                    type="text"
                    value={fromDisplayName}
                    onChange={(e) => setFromDisplayName(e.target.value)}
                    placeholder="Auto-filled from hostname"
                    className="w-full text-[12px] px-2.5 py-2 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none focus:border-[var(--color-accent)]/50"
                  />
                </div>
              </div>
            </InfoCard>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <UrlCheckCard
                icon={<Server className="w-4 h-4" />}
                title="Reachable"
                tone={probeMeta ? 'emerald' : probing ? 'blue' : probeAttempted ? 'red' : 'gray'}
                value={probeMeta ? 'Server responded' : probing ? 'Checking endpoint' : probeAttempted ? 'Needs attention' : 'Waiting for URL'}
                detail={probeMeta ? `${probeMeta.origin}${probeMeta.mcp_path}` : 'Construct calls this from the cloud. Private IPs and localhost are blocked.'}
              />
              <UrlCheckCard
                icon={<Wrench className="w-4 h-4" />}
                title="MCP tools"
                tone={probeTools?.length ? 'emerald' : probing ? 'blue' : probeAttempted ? 'red' : 'gray'}
                value={probeTools ? `${probeTools.length} discovered` : probing ? 'Listing tools' : 'Not checked yet'}
                detail={probeMeta?.transport === 'sse' ? 'Streamable HTTP supported' : probeMeta?.transport === 'json' ? 'JSON response supported' : 'We verify tools/list before install.'}
              />
              <UrlCheckCard
                icon={<Eye className="w-4 h-4" />}
                title="Interface"
                tone={fromHasUi ? 'emerald' : probeMeta ? 'gray' : 'gray'}
                value={fromHasUi ? 'Will open as an app' : probeMeta?.has_ui_guess ? 'UI detected' : 'Tools-only by default'}
                detail="Enable this only when the server also hosts a user-facing web UI."
                action={
                  <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fromHasUi}
                      onChange={(e) => setFromHasUi(e.target.checked)}
                      className="rounded border-black/20"
                    />
                    Has UI
                  </label>
                }
              />
              <UrlCheckCard
                icon={<BadgeCheck className="w-4 h-4" />}
                title="Ready"
                tone={probeMeta && !atAppLimit ? 'emerald' : atAppLimit ? 'red' : 'gray'}
                value={atAppLimit ? 'Plan limit reached' : probeMeta ? 'Ready to install' : 'Check required'}
                detail={atAppLimit ? `You have reached ${maxApps} installed apps.` : 'Install saves the tool list and makes it available to the agent.'}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleProbeFromUrl}
                disabled={probing || !fromUrl.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12px] font-semibold bg-black/[0.06] dark:bg-white/[0.1] hover:bg-black/[0.1] dark:hover:bg-white/[0.14] disabled:opacity-40 transition-colors"
              >
                {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Recheck
              </button>
              <button
                type="button"
                onClick={handleInstallFromUrl}
                disabled={installingUrl || !probeMeta || atAppLimit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity shadow-sm"
              >
                {installingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Install MCP
              </button>
              {probeMeta?.content_type && (
                <span className="text-[10px] text-[var(--color-text-muted)] font-mono px-2 py-1 rounded-md bg-black/[0.04] dark:bg-white/[0.06]">
                  {probeMeta.content_type.split(';')[0]}
                </span>
              )}
            </div>

            {probeMeta && probeTools && (
              <InfoCard title="Tool Preview" subtitle={`${probeMeta.origin}${probeMeta.mcp_path} · ${probeTools.length} tool(s)`}>
                {probeTools.length > 0 ? (
                  <ToolsList tools={probeTools.map((t) => ({ slug: t.name, name: t.name, description: t.description }))} />
                ) : (
                  <p className="text-[11px] text-[var(--color-text-muted)]">No tools returned by this server.</p>
                )}
              </InfoCard>
            )}
          </div>
        ) : tab === 'installed' ? (
          yourApps.length === 0 ? (
            <EmptyState message={search ? 'No installed apps match your filter.' : 'No apps installed yet. Browse Discover to find some.'} />
          ) : (
            (() => {
              const q = search.toLowerCase().trim();
              const filtered = q
                ? yourApps.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
                : yourApps;
              if (filtered.length === 0) {
                return <EmptyState message={`No installed apps match "${search}".`} />;
              }
              const mcpApps = filtered.filter(a => a.source !== 'composio' && !a.isSkill);
              const skillApps = filtered.filter(a => a.isSkill);
              const composioApps = filtered.filter(a => a.source === 'composio');
              const groups: Array<[string, typeof filtered]> = [];
              if (mcpApps.length > 0) groups.push(['MCP Apps', mcpApps]);
              if (skillApps.length > 0) groups.push(['Skills', skillApps]);
              if (composioApps.length > 0) groups.push(['Integrations', composioApps]);
              const showHeaders = groups.length > 1;
              return (
                <div className="space-y-4">
                  {groups.map(([label, apps]) => (
                    <section key={label}>
                      {showHeaders && (
                        <p className="text-[13px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 px-1">
                          {label} <span className="opacity-50 font-semibold">{apps.length}</span>
                        </p>
                      )}
                      <AppGrid>
                        {apps.map(app => (
                          <UnifiedAppCard key={app.id} app={app} onClick={() => openDetail(app)} />
                        ))}
                      </AppGrid>
                    </section>
                  ))}
                </div>
              );
            })()
          )
        ) : isSearching ? (
          <div className="space-y-3">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-12 opacity-30">
                <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-[12px]">Searching...</span>
              </div>
            ) : visibleSearchResults.length === 0 ? (
              <EmptyState message={`No results for "${search}"`} />
            ) : (
              <AppGrid>
                {visibleSearchResults.map(app => (
                  <UnifiedAppCard key={app.id} app={app} onClick={() => openDetail(app)} />
                ))}
              </AppGrid>
            )}
          </div>
        ) : (
          <>
            {visibleRegistryList.length > 0 && (
              <section>
                <p className="text-[13px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 px-1">Made for Construct</p>
                <AppGrid>
                  {visibleRegistryList.map(app => (
                    <UnifiedAppCard key={app.id} app={app} onClick={() => openDetail(app)} />
                  ))}
                </AppGrid>
              </section>
            )}
            {suggestedByCategory.map(([cat, apps]) => (
              <section key={cat}>
                <p className="text-[13px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 px-1">{CATEGORY_LABELS[cat] || cat}</p>
                <AppGrid>
                  {apps.map(app => (
                    <UnifiedAppCard key={app.id} app={app} onClick={() => openDetail(app)} />
                  ))}
                </AppGrid>
              </section>
            ))}
            {registryList.length === 0 && suggestedByCategory.length === 0 && (
              <EmptyState message="No apps found." />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AppGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
      <Shield className="w-6 h-6 mb-2 opacity-40" />
      <span className="text-[12px]">{message}</span>
    </div>
  );
}

type CheckTone = 'emerald' | 'blue' | 'red' | 'gray';

const CHECK_TONE_CLASS: Record<CheckTone, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/15',
  blue: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/15',
  red: 'text-red-500 bg-red-500/10 border-red-500/15',
  gray: 'text-[var(--color-text-muted)] bg-black/[0.03] dark:bg-white/[0.04] border-black/[0.06] dark:border-white/[0.06]',
};

function UrlCheckCard({
  icon, title, value, detail, tone, action,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  tone: CheckTone;
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-[12px] border px-3 py-2.5 ${CHECK_TONE_CLASS[tone]}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{title}</p>
            {action}
          </div>
          <p className="text-[12px] font-semibold mt-1 text-[var(--color-text)]">{value}</p>
          <p className="text-[11px] leading-snug mt-0.5 text-[var(--color-text-muted)]">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function isProbeableUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatEndpointPreview(rawUrl: string, rawPath: string): string {
  if (!rawUrl.trim()) return 'Paste an MCP URL';
  try {
    const parsed = new URL(rawUrl.trim());
    const explicitPath = rawPath.trim();
    const path = explicitPath || (parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/mcp');
    return `${parsed.origin}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return 'Waiting for a valid URL';
  }
}

function UnifiedAppCard({ app, onClick }: { app: UnifiedApp; onClick: () => void }) {
  const isInstalled = app.status !== 'available';
  const isComposio = app.source === 'composio';
  const isSkill = app.isSkill;

  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 px-3 py-3 rounded-[10px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-[36px] h-[36px] rounded-[8px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
        {app.icon ? (
          <img src={app.icon} alt={app.name} className="w-[28px] h-[28px] object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <Package className="w-4 h-4 text-[var(--color-text-muted)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold truncate text-[var(--color-text)]">{app.name}</span>
          {(isComposio || app.verified) && (
            <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mt-0.5 leading-snug">
          {app.description}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          {isInstalled ? (
            <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 rounded-full">{isComposio ? 'Connected' : 'Installed'}</span>
          ) : app.requiresUpgrade ? (
            <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 rounded-full flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Upgrade</span>
          ) : (
            <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">Available</span>
          )}
          {isSkill && <span className="text-[10px] font-semibold text-purple-500 bg-purple-500/10 px-1.5 rounded-full">Skill</span>}
          {app.tags?.includes('from-url') && (
            <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 rounded-full">From URL</span>
          )}
        </div>
      </div>
    </button>
  );
}