/**
 * Apps — discovery and management of Construct apps.
 * Unified discovery across Construct registry, Composio, custom MCP URLs, and installed apps.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Loader2, RefreshCw, ChevronLeft, X, Check,
  AlertCircle, ExternalLink, Upload, Wrench, Shield,
  Globe, Download, BadgeCheck, Sparkles,
  Lock, Package, Link2, Server, Eye, Trash2, Pencil,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import { useAppStore } from '@/stores/appStore';
import { useBillingStore } from '@/stores/billingStore';
import { useWindowStore } from '@/stores/windowStore';
import {
  AppHeroHeader, AppStatsStrip, HeaderIconButton, InfoCard, InfoRow, ToolsList
} from './AppShared';
import {
  AppStoreCategoryPills,
  AppStoreCategorySidebar,
  AppStoreFeaturedStrip,
  AppStoreGrid,
  AppStoreList,
  AppStorePopularSections,
  AppStoreBrowseSkeleton,
  AppStoreDetailBodySkeleton,
  AppStoreHeroSkeleton,
  AppStoreListSkeleton,
  AppStoreSection,
  formatToolCount,
  sourceLabel as appSourceLabel,
} from './app-store';
import { ComposioIntegrationDetail } from './app-store/ComposioIntegrationDetail';
import {
  ComposioConnectHeaderSlot,
  ComposioConnectModalSlot,
  ComposioConnectProvider,
} from './app-store/ComposioConnectProvider';
import { FreshnessText, InfoHint, RefreshButton, StatusBanner } from '@/components/ui';
import { useFreshness } from '@/hooks/useFreshness';
import { useAppDiscovery, getCategoryLabel, getHostname, prettyAuthLabel } from '@/hooks/useAppDiscovery';
import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import type { RegistryAppDetail } from '@/services/api';

const PUBLISH_URL = 'https://registry.construct.computer/publish';

// ── Main Component ──

export function AppRegistryWindow({ config }: { config: WindowConfig }) {
  const openWindow = useWindowStore((s) => s.openWindow);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'integrations'>('all');
  const deepLinkRef = useRef<string | null>(null);
  const targetComposioSlugRef = useRef<string | null>(null);
  
  // Use the unified app discovery hook
  const {
    tab, setTab, category, setCategory, search, handleSearch, searching,
    loading, yourApps, suggestedByCategory, homeCategorySections, popularByGroup,
    registryList, searchResults, isSearching, catalogReady, catalogComplete,
    installedIds, connectedToolkits, handleRefresh, fetchInstalled, fetchConnected,
    composioCatalogTotal, expandCategory, browseCategories, composioCategoryLabels,
  } = useAppDiscovery();
  const freshness = useFreshness(async () => {
    await handleRefresh({ silent: true });
  }, {
    intervalMs: 60_000,
    staleMs: 90_000,
    refreshOnFocus: true,
    refreshOnOnline: true,
  });

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

  const hasDiscoverContent = yourApps.length > 0
    || registryList.length > 0
    || (catalogReady && (homeCategorySections.length > 0 || popularByGroup.length > 0))
    || searchResults.length > 0;
  const showCatalogSkeleton = !isSearching && !catalogReady;
  const showBlockingLoader = loading && !hasDiscoverContent && !showCatalogSkeleton;

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
  const [registryDetail, setRegistryDetail] = useState<RegistryAppDetail | null>(null);
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
    setRegistryDetail(null);
    setError(null);

    const needsDetailFetch = (app.source === 'registry' && !!app.registryApp?.id)
      || (app.source === 'composio' && !!app.composioSlug);
    setDetailLoading(needsDetailFetch);
    setDetail(app);

    if (app.source === 'registry' && app.registryApp?.id) {
      const res = await api.getRegistryApp(app.registryApp.id);
      if (res.success && res.data) {
        const d = res.data;
        setRegistryDetail(d);
        setDetail(prev => prev ? {
          ...prev,
          description: d.long_description || d.description || prev.description,
          icon: d.icon_url || prev.icon,
          tools: d.tools?.map((t) => ({ name: t.name, description: t.description })) || prev.tools,
          tags: d.tags || prev.tags,
          version: d.latest_version || prev.version,
          popularity: d.install_count,
          verified: d.verified,
          hasUi: d.has_ui,
          author: d.author?.name || prev.author,
          authorUrl: d.author?.url || prev.authorUrl,
        } : null);
      }
      setDetailLoading(false);
    } else if (app.source === 'composio' && app.composioSlug) {
      const res = await api.getComposioToolkitDetail(app.composioSlug);
      if (res.success && res.data) {
        const d = res.data;
        setDetail(prev => prev ? {
          ...prev, description: d.description || prev.description,
          icon: d.logo || prev.icon, composioLogo: d.logo || prev.composioLogo,
          toolCount: d.tools_count || d.tools?.length || prev.toolCount,
          tools: d.tools?.map((t: any) => ({ name: t.name, description: t.description })) || prev.tools,
          composioCategories: d.categories?.map((c: any) => ({
            slug: c.slug || '',
            name: c.name || c.slug || '',
          })).filter((c: { slug: string }) => c.slug) || prev.composioCategories,
          composioDocumentation: d.documentation || prev.composioDocumentation,
          authSchemes: Array.isArray(d.auth_schemes)
            ? d.auth_schemes.map((s: any) => (typeof s === 'string' ? s : s?.mode || 'unknown'))
            : prev.authSchemes,
          authConfig: d.auth_config || prev.authConfig,
          composioManaged: d.composio_managed ?? prev.composioManaged,
          composioManagedSchemes: Array.isArray(d.composio_managed_schemes)
            ? d.composio_managed_schemes.map((s: unknown) => (typeof s === 'string' ? s : '')).filter(Boolean)
            : prev.composioManagedSchemes,
        } : null);
      }
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setRegistryDetail(null);
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
    if (app.source === 'local') return true;
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
      setError('Run “Check URL” first so we can reach your MCP app.');
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

  const handleUninstall = async (appId: string) => {
    setPendingActions(prev => ({ ...prev, [appId]: true }));
    try {
      const res = await api.uninstallApp(appId);
      if (res.success) { await fetchInstalled(); syncLaunchpad(); setDetail(null); }
      else setError('Uninstall failed: ' + res.error);
    } catch (err) { setError(`Uninstall failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[appId]; return n; });
  };

  const handleDeleteLocal = async (appId: string) => {
    setPendingActions(prev => ({ ...prev, [appId]: true }));
    try {
      const res = await api.deleteLocalApp(appId);
      if (res.success) {
        useAppStore.getState().fetchApps();
        setDetail(null);
      } else {
        setError('Delete failed: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      setError(`Delete failed: ${err instanceof Error ? err.message : err}`);
    }
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

  const handleOpenInstalled = async (app: UnifiedApp) => {
    // Prefer ids from this panel's install list (`installedIds` from fetchInstalled on mount).
    // useAppStore.installedApps is often still empty after a hard refresh until fetchApps()
    // runs elsewhere (e.g. Launchpad), so do not rely on it for registry opens alone.
    let appId =
      app.localApp?.id ??
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
    if (app.source === 'local') {
      await useAppStore.getState().fetchApps();
    }
    openWindow('app', {
      title: app.name,
      icon: app.icon,
      metadata: { appId },
    } as Partial<WindowConfig>);
  };

  const openInBuilder = (app: UnifiedApp) => {
    const appId = app.localApp?.id ?? app.id;
    if (!appId) return;
    const title = `Builder - ${app.name}`;
    const metadata = { appId };
    // app-builder is a singleton window: push metadata so the builder switches
    // to this app even if a builder window is already open.
    const windowId = openWindow('app-builder', { title, metadata } as Partial<WindowConfig>);
    useWindowStore.getState().updateWindow(windowId, { title, metadata });
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
    const toolCount = detail.toolCount ?? detail.tools?.length ?? 0;

    const getUninstallTarget = (): string | null => {
      if (detail.installedApp && detail.installedApp.id !== 'app-registry') return detail.installedApp.id;
      if (detail.registryApp && installedIds.has(detail.registryApp.id)) return detail.registryApp.id;
      if (installedIds.has(detail.id) && detail.id !== 'app-registry') return detail.id;
      return null;
    };
    const uninstallTarget = getUninstallTarget();

    const getAction = detail.registryApp ? () => handleInstallRegistry(detail) : null;
    const showComposioConnect = isComposio
      && !installed
      && !detail.requiresUpgrade
      && detail.connectable !== false
      && !!detail.composioSlug;

    const isCustomUrlInstall =
      detail.source === 'installed' && detail.installedApp && detail.installedApp.registry_linked === false;
    const sourceLabel =
      detail.source === 'local'
        ? 'Local app'
        :
      detail.author ||
      (isCustomUrlInstall
        ? 'Custom URL'
        : isComposio
          ? 'Integration'
          : 'Construct App');
    const sourceBadge = detail.source === 'local' ? 'Local App' : isComposio ? 'Integration' : isCustomUrlInstall ? 'Custom / MCP' : 'App';

    const authLabel = detail.authSchemes?.length
      ? prettyAuthLabel(detail.authSchemes[0])
      : undefined;
    const statsItems = [
      toolCount > 0 ? formatToolCount(toolCount) : '',
      authLabel,
      appSourceLabel(detail),
      detail.verified ? 'Verified' : '',
      detail.hasUi ? 'Has UI' : '',
    ].filter((item): item is string => Boolean(item));

    const detailPrimary = (
      <>
        {error && (
          <div className="flex items-center gap-2 text-[12px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            <button type="button" onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
          </div>
        )}

        {installed && (isComposio || detail.source === 'installed' || detail.source === 'local' || detail.registryApp) && (
          <InfoCard title="Connection status" subtitle="Construct can use this from chat.">
            <div className="flex items-start gap-2.5 rounded-[8px] bg-emerald-500/[0.06] border border-emerald-500/15 px-3 py-2">
              <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {detail.source === 'local' ? 'Local app available' : isComposio ? 'Integration connected' : 'App installed'}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {toolCount > 0
                    ? `${toolCount} action${toolCount === 1 ? '' : 's'} available. Open the interface or ask Construct to use this app.`
                    : 'Actions are available to Construct; refresh the action list if this panel looks stale.'}
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

        {isComposio && detail.connectable === false && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
            <AlertCircle className="w-4 h-4 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[var(--color-text)]">Unavailable</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">This integration cannot be connected right now.</p>
            </div>
          </div>
        )}

        {registryDetail && (
          <InfoCard title="About" subtitle="Publisher and install details">
            <div className="space-y-1.5">
              {registryDetail.author?.name && (
                <InfoRow
                  icon={<Package className="w-3 h-3" />}
                  label="Author"
                  value={registryDetail.author.url ? `${registryDetail.author.name} ↗` : registryDetail.author.name}
                />
              )}
              {registryDetail.latest_version && (
                <InfoRow icon={<BadgeCheck className="w-3 h-3" />} label="Version" value={`v${registryDetail.latest_version}`} />
              )}
              {registryDetail.install_count > 0 && (
                <InfoRow icon={<Download className="w-3 h-3" />} label="Installs" value={String(registryDetail.install_count)} />
              )}
              {registryDetail.rating_count > 0 && (
                <InfoRow
                  icon={<Sparkles className="w-3 h-3" />}
                  label="Rating"
                  value={`${registryDetail.avg_rating.toFixed(1)} (${registryDetail.rating_count})`}
                />
              )}
              {registryDetail.permissions?.network?.length ? (
                <InfoRow
                  icon={<Globe className="w-3 h-3" />}
                  label="Network"
                  value={registryDetail.permissions.network.join(', ')}
                  mono
                />
              ) : null}
            </div>
          </InfoCard>
        )}

        {isCustomUrlInstall && (
          <InfoCard title="About this install" subtitle="MCP connection">
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              Apps added by URL are not listed in Apps, so Construct cannot show built-in sign-in flows for them.
              Construct can still use actions if the MCP connection is reachable and does not require stored user credentials.
            </p>
          </InfoCard>
        )}

        {isComposio && detail.composioSlug && (
          <ComposioIntegrationDetail
            detail={detail}
            categoryLabels={composioCategoryLabels}
          />
        )}

        {detail.installedApp && (() => {
          const ia = detail.installedApp;
          const enabled = ia.enabled !== false;
          const togglePending = !!pendingActions[`toggle-${ia.id}`];
          const refreshPending = !!pendingActions[`refresh-${ia.id}`];
          return (
            <InfoCard title="Manage app" subtitle={enabled ? 'Active for Construct' : 'Hidden from Construct'}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] text-[var(--color-text-muted)] leading-snug">
                    {enabled
                      ? 'Construct can use this app’s actions. Disable to hide it without uninstalling.'
                      : 'This app is currently hidden from Construct. Enable to make its actions available again.'}
                  </div>
                  <button
                    type="button"
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
                    Re-fetch this app's actions from its MCP connection.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRefreshTools(ia.id)}
                    disabled={refreshPending}
                    className="px-3 py-1 rounded-md text-[11px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text)] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    title="Refresh actions"
                  >
                    {refreshPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Refresh actions
                  </button>
                </div>
              </div>
            </InfoCard>
          );
        })()}
      </>
    );

    const detailSecondary = !detailLoading && (toolCount > 0 || detail.tools.length > 0) ? (
      <ToolsList tools={detail.tools.map(t => ({ slug: t.name, name: t.name, description: t.description || undefined }))} />
    ) : null;
    const detailBodyLoading = detailLoading;

    const composioOnConnected = () => {
      fetchConnected();
      setDetail((prev) => {
        if (!prev) return prev;
        return prev.composioSlug === detail.composioSlug
          ? { ...prev, status: 'connected' }
          : prev;
      });
    };

    const detailShell = (
      <div className="app-store-window relative flex flex-col h-full text-[var(--color-text)] select-none surface-app">
        {/* Detail header */}
        <div className="flex-shrink-0 px-5 pt-4 pb-0 border-b border-black/[0.06] dark:border-white/[0.06] surface-sidebar z-10">
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
            subtitle={`${sourceLabel} · ${getCategoryLabel(detail.category, composioCategoryLabels)}`}
            description={detailLoading ? undefined : (detail.description || 'No description available.')}
            status={installed ? { label: detail.source === 'local' ? 'Local' : isComposio ? 'Connected' : 'Added', tone: detail.source === 'local' ? 'blue' : 'emerald' } : undefined}
            badges={[
              sourceBadge,
              ...(isComposio && detail.composioCategories?.length
                ? detail.composioCategories.map((c) => getCategoryLabel(c.slug, composioCategoryLabels))
                : detail.tags || []),
              ...(detail.verified ? ['Verified'] : []),
              ...(detail.hasUi ? ['Has UI'] : []),
              ...(detail.version ? [`v${detail.version}`] : [])
            ]}
            actions={
              detail.sourceUrl && !isComposio ? (
                <HeaderIconButton href={detail.sourceUrl} title="Source/Website">
                  <ExternalLink className="w-3.5 h-3.5" />
                </HeaderIconButton>
              ) : undefined
            }
            primaryAction={
              <>
                {isPending ? (
                  <button disabled className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white opacity-50 flex items-center gap-2 shadow-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Working...
                  </button>
                ) : installed ? (
                  <>
                    {(detail.hasUi || detail.source === 'installed' || detail.source === 'registry' || detail.source === 'local') && (
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
                    {detail.source === 'local' && (
                      <button
                        onClick={() => openInBuilder(detail)}
                        className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text)] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors shadow-sm"
                      >
                        <Pencil className="w-3.5 h-3.5 inline mr-1" />
                        Edit in Builder
                      </button>
                    )}
                    {detail.source === 'local' && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${detail.name}"? This will permanently remove all files and cannot be undone.`)) {
                            handleDeleteLocal(detail.id);
                          }
                        }}
                        disabled={pendingActions[detail.id]}
                        className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                        {pendingActions[detail.id] ? 'Deleting…' : 'Delete'}
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
                ) : showComposioConnect ? (
                  <ComposioConnectHeaderSlot />
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
                ) : null}
              </>
            }
          />
          {detailLoading ? (
            <AppStoreHeroSkeleton />
          ) : (
            <AppStatsStrip items={statsItems} />
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 app-store-detail-content">
          {detailBodyLoading ? (
            <AppStoreDetailBodySkeleton
              isComposio={isComposio}
              actionsCount={Math.min(toolCount || 6, 8)}
            />
          ) : (
            <div className="app-store-detail-body w-full max-w-none">
              <div className="app-store-detail-primary space-y-4">
                {detailPrimary}
              </div>
              {detailSecondary && (
                <div className="app-store-detail-secondary">
                  {detailSecondary}
                </div>
              )}
            </div>
          )}
        </div>

        <ComposioConnectModalSlot />
      </div>
    );

    return (
      <ComposioConnectProvider
        enabled={showComposioConnect}
        slug={detail.composioSlug!}
        name={detail.name}
        prefetch={{
          authSchemes: detail.authSchemes,
          authConfig: detail.authConfig,
          composioManagedSchemes: detail.composioManagedSchemes,
        }}
        onConnected={composioOnConnected}
      >
        {detailShell}
      </ComposioConnectProvider>
    );
  }

  // ── List view ──

  return (
    <div className="app-store-window flex flex-col h-full min-h-0 text-[var(--color-text)] select-none">
      {/* Header — same surface as category sidebar (Files-style chrome) */}
      <div className="app-store-chrome surface-sidebar border-b border-black/[0.06] dark:border-white/[0.06] px-5 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg font-bold">Apps</h1>
            </div>
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
            <span className="hidden text-[10px] text-[var(--color-text-muted)] md:inline">
              <FreshnessText
                lastUpdatedAt={freshness.lastUpdatedAt}
                now={freshness.now}
                isRefreshing={freshness.isRefreshing || loading}
                isStale={freshness.isStale}
              />
            </span>
            <a
              href={PUBLISH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              title="Publish your own app"
            >
              <Upload className="w-3 h-3" /> Publish
            </a>
            <RefreshButton onClick={() => void freshness.refreshNow()} refreshing={freshness.isRefreshing || loading} />
          </div>
        </div>
        {freshness.isStale && (
          <StatusBanner
            tone="warning"
            action={<button className="text-xs underline" onClick={() => void freshness.refreshNow()}>Refresh</button>}
          >
            Apps may be out of date.
          </StatusBanner>
        )}

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
            Available
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
            Connected
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
            Custom / MCP
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
            className={`w-full pl-9 ${search ? 'pr-8' : 'pr-4'} py-2 rounded-lg surface-control border border-black/[0.06] dark:border-white/[0.06] text-sm outline-none transition-colors placeholder:text-black/30 dark:placeholder:text-white/25 disabled:opacity-40 disabled:cursor-not-allowed`}
            placeholder={
              tab === 'from_url'
                ? 'Search is on Available / Connected…'
                : tab === 'installed'
                  ? 'Filter connected apps...'
                  : sourceFilter === 'integrations'
                    ? 'Search integrations (GitHub, Gmail, Notion...)'
                    : composioCatalogTotal > 0
                      ? `Search ${composioCatalogTotal.toLocaleString()}+ integrations…`
                      : 'Search integrations…'
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

      </div>

      <div className="app-store-body flex-1 min-h-0">
        {tab === 'discover' && !isSearching && (
          <AppStoreCategorySidebar
            category={category}
            categories={browseCategories}
            onSelect={setCategory}
          />
        )}

        <div className="app-store-main flex-1 overflow-y-auto px-5 pb-5">
        {tab === 'discover' && !isSearching && (
          <AppStoreCategoryPills
            category={category}
            categories={browseCategories}
            onSelect={setCategory}
          />
        )}

        <div className="space-y-5 pt-1">
        {error && (
          <div className="flex items-center gap-2 text-[12px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3 py-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
          </div>
        )}

        {showBlockingLoader ? (
          <AppStoreBrowseSkeleton />
        ) : tab === 'from_url' ? (
          <div className="space-y-3">
            {lastInstalledName && (
              <div className="flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 rounded-[12px] px-3 py-2">
                <Check className="w-4 h-4 shrink-0" />
                <span className="flex-1"><strong>{lastInstalledName}</strong> is added and ready for Construct.</span>
                <button onClick={() => setTab('installed')} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/15">
                  Open installed
                </button>
              </div>
            )}

            <InfoCard
              title="Server"
              subtitle="Paste once. Construct checks reachability, actions, and app UI."
              right={
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--color-accent)/15 bg-(--color-accent)/8 px-2 py-1 text-[10px] font-medium text-(--color-accent)/90"
                  title="Install any remote MCP"
                >
                  <Sparkles className="w-3 h-3" />
                  MCP app
                  <InfoHint side="left">MCP is a standard way for Construct to use actions from an external app.</InfoHint>
                </span>
              }
            >
              <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">MCP connection URL</label>
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
                  className="w-full text-[13px] pl-9 pr-3 py-3 rounded-[12px] bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none transition-colors placeholder:text-black/30 dark:placeholder:text-white/25"
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
                    className="w-full text-[12px] px-2.5 py-2 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">Display name</label>
                  <input
                    type="text"
                    value={fromDisplayName}
                    onChange={(e) => setFromDisplayName(e.target.value)}
                    placeholder="Auto-filled from hostname"
                    className="w-full text-[12px] px-2.5 py-2 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] outline-none"
                  />
                </div>
              </div>
            </InfoCard>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <UrlCheckCard
                icon={<Server className="w-4 h-4" />}
                title="Reachable"
                tone={probeMeta ? 'emerald' : probing ? 'blue' : probeAttempted ? 'red' : 'gray'}
                value={probeMeta ? 'App responded' : probing ? 'Checking connection' : probeAttempted ? 'Needs attention' : 'Waiting for URL'}
                detail={probeMeta ? `${probeMeta.origin}${probeMeta.mcp_path}` : 'Construct calls this from the cloud. Private IPs and localhost are blocked.'}
              />
              <UrlCheckCard
                icon={<Wrench className="w-4 h-4" />}
                title="MCP actions"
                tone={probeTools?.length ? 'emerald' : probing ? 'blue' : probeAttempted ? 'red' : 'gray'}
                value={probeTools ? `${probeTools.length} found` : probing ? 'Listing actions' : 'Not checked yet'}
                detail={probeMeta ? 'Connection verified.' : 'Construct checks available actions before install.'}
              />
              <UrlCheckCard
                icon={<Eye className="w-4 h-4" />}
                title="Interface"
                tone={fromHasUi ? 'emerald' : probeMeta ? 'gray' : 'gray'}
                value={fromHasUi ? 'Will open as an app' : probeMeta?.has_ui_guess ? 'UI detected' : 'Actions-only by default'}
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
                detail={atAppLimit ? `You have reached ${maxApps} added apps.` : 'Install saves the action list and makes it available to Construct.'}
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
              <InfoCard title="Action preview" subtitle={`${probeMeta.origin}${probeMeta.mcp_path} · ${probeTools.length} action(s)`}>
                {probeTools.length > 0 ? (
                  <ToolsList tools={probeTools.map((t) => ({ slug: t.name, name: t.name, description: t.description }))} />
                ) : (
                  <p className="text-[11px] text-[var(--color-text-muted)]">No actions returned by this app.</p>
                )}
              </InfoCard>
            )}
          </div>
        ) : tab === 'installed' ? (
          yourApps.length === 0 ? (
            <EmptyState message={search ? 'No connected apps match your filter.' : 'No connected apps yet. Browse Available to find some.'} />
          ) : (
            (() => {
              const q = search.toLowerCase().trim();
              const filtered = q
                ? yourApps.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
                : yourApps;
              if (filtered.length === 0) {
                return <EmptyState message={`No connected apps match "${search}".`} />;
              }
              const localApps = filtered.filter(a => a.source === 'local');
              const mcpApps = filtered.filter(a => a.source !== 'composio' && a.source !== 'local');
              const composioApps = filtered.filter(a => a.source === 'composio');
              const groups: Array<[string, typeof filtered]> = [];
              if (localApps.length > 0) groups.push(['Local Apps', localApps]);
              if (mcpApps.length > 0) groups.push(['MCP Apps', mcpApps]);
              if (composioApps.length > 0) groups.push(['Integrations', composioApps]);
              const showHeaders = groups.length > 1;
              return (
                <div className="space-y-4">
                  {groups.map(([label, apps]) => (
                    <section key={label}>
                      {showHeaders ? (
                        <AppStoreSection title={label} count={apps.length}>
                          <AppStoreGrid apps={apps} onClick={openDetail} />
                        </AppStoreSection>
                      ) : (
                        <AppStoreGrid apps={apps} onClick={openDetail} />
                      )}
                    </section>
                  ))}
                </div>
              );
            })()
          )
        ) : isSearching ? (
          <div className="space-y-3">
            {searching ? (
              <AppStoreListSkeleton />
            ) : visibleSearchResults.length === 0 ? (
              <EmptyState message={`No results for "${search}"`} />
            ) : (
              <AppStoreList apps={visibleSearchResults} onClick={openDetail} />
            )}
          </div>
        ) : (
          <>
            <AppStoreFeaturedStrip apps={visibleRegistryList} onClick={openDetail} />
            {!catalogComplete && catalogReady && (
              <StatusBanner tone="warning" className="mb-3">
                Integration catalog may be incomplete. Try refreshing if something is missing.
              </StatusBanner>
            )}
            {showCatalogSkeleton ? (
              <AppStoreBrowseSkeleton />
            ) : category === 'all' ? (
              <>
                <AppStorePopularSections groups={popularByGroup} onClick={openDetail} />
                {homeCategorySections.map((section) => (
                  <AppStoreSection
                    key={section.categoryId}
                    title={getCategoryLabel(section.categoryId, composioCategoryLabels)}
                    visibleCount={section.apps.length}
                    totalCount={section.totalCount}
                    isExpanded={section.isExpanded}
                    onShowAll={() => expandCategory(section.categoryId)}
                  >
                    <AppStoreGrid apps={section.apps} onClick={openDetail} />
                  </AppStoreSection>
                ))}
              </>
            ) : (
              suggestedByCategory.map((section) => (
                <AppStoreSection
                  key={section.categoryId}
                  title={getCategoryLabel(section.categoryId, composioCategoryLabels)}
                  visibleCount={section.apps.length}
                  totalCount={section.totalCount}
                  isExpanded={section.isExpanded}
                  onShowAll={() => expandCategory(section.categoryId)}
                >
                  <AppStoreGrid apps={section.apps} onClick={openDetail} />
                </AppStoreSection>
              ))
            )}
            {registryList.length === 0
              && !showCatalogSkeleton
              && popularByGroup.length === 0
              && homeCategorySections.length === 0
              && suggestedByCategory.length === 0 && (
              <EmptyState message="No apps found." />
            )}
          </>
        )}
        </div>
        </div>
      </div>
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
  if (!rawUrl.trim()) return 'Paste an MCP connection URL';
  try {
    const parsed = new URL(rawUrl.trim());
    const explicitPath = rawPath.trim();
    const path = explicitPath || (parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/mcp');
    return `${parsed.origin}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return 'Waiting for a valid URL';
  }
}

