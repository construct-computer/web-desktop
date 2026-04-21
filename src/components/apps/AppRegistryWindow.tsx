/**
 * App Registry — discovery and management of Construct apps.
 * Now Unified with all sources (Registry, Smithery, Composio, Skills).
 */

import { useState, useEffect } from 'react';
import {
  Search, Loader2, RefreshCw, ChevronLeft, X, Check,
  AlertCircle, ExternalLink, Plug, Upload, Wrench, Shield,
  Tag, Globe, Star, Download, History, BadgeCheck, Sparkles,
  Lock, Unlock, KeyRound, Package
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import { useAppStore } from '@/stores/appStore';
import { useBillingStore } from '@/stores/billingStore';
import { useWindowStore } from '@/stores/windowStore';
import { openSettingsToSection } from '@/lib/settingsNav';
import Markdown from 'react-markdown';
import { AuthSchemesPanel } from './AuthSchemesPanel';
import { ComposioAuthPanel } from './ComposioAuthPanel';
import {
  AppShell, AppHeroHeader, HeaderIconButton, InfoCard, InfoRow, ToolsList, Badge
} from './AppShared';
import { useAppDiscovery, CATEGORY_LABELS, CATEGORIES, getHostname } from '@/hooks/useAppDiscovery';
import type { UnifiedApp, Category } from '@/hooks/useAppDiscovery';

const PUBLISH_URL = 'https://registry.construct.computer/publish';

// ── Main Component ──

export function AppRegistryWindow({ config: _config }: { config: WindowConfig }) {
  const openWindow = useWindowStore((s) => s.openWindow);
  
  // Use the unified app discovery hook
  const {
    tab, setTab, category, setCategory, search, handleSearch, searching,
    loading, yourApps, suggestedByCategory, registryList, searchResults, isSearching,
    installedIds, connectedToolkits, handleRefresh, fetchInstalled, fetchConnected, userPlan
  } = useAppDiscovery();

  const [error, setError] = useState<string | null>(null);

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
    if (!app.installedApp) return;
    openWindow('app', {
      title: app.name,
      icon: app.icon,
      metadata: { appId: app.installedApp.id },
    } as Partial<WindowConfig>);
  };

  // ── Detail view ──

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

    // For Composio apps the connect UI lives in the body (ComposioAuthPanel),
    // so we don't surface a top-level "Connect" button — the panel's per-scheme
    // buttons handle OAuth / API key / etc.
    const getAction = detail.registryApp ? () => handleInstallRegistry(detail)
      : detail.smitheryServer && (!detail.smitheryDetail || detail.smitheryDetail.connections.length > 0) ? () => handleInstallSmithery(detail)
      : isSkill && detail.smitherySkill ? () => handleInstallSkill(detail)
      : null;

    const sourceLabel = detail.author || (isComposio ? 'Integration' : isSkill ? 'Skill' : isSmithery ? 'MCP Server' : 'Construct App');
    const sourceBadge = isComposio ? 'Integration' : isSkill ? 'Skill' : 'App';

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

          {detail.requiresUpgrade && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] bg-amber-500/10 border border-amber-500/20">
              <Lock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">Upgrade to connect</p>
                <p className="text-[11px] text-amber-500/70 mt-0.5">This integration requires a Starter or Pro plan. Upgrade to unlock access.</p>
              </div>
            </div>
          )}

          {isComposio && detail.composioSlug && !installed && !detail.requiresUpgrade && (
            <InfoCard title="Connect this integration" subtitle="Choose how you'd like to sign in.">
              <ComposioAuthPanel
                slug={detail.composioSlug}
                onConnected={() => { fetchConnected(); }}
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
          <h1 className="text-lg font-bold">App Store</h1>
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
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30 dark:text-white/30 pointer-events-none" />
          <input
            type="text"
            className={`w-full pl-9 ${search ? 'pr-8' : 'pr-4'} py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-sm outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-black/30 dark:placeholder:text-white/25`}
            placeholder={tab === 'installed' ? 'Filter installed apps...' : 'Search all apps, integrations, servers...'}
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
        ) : tab === 'installed' ? (
          yourApps.length === 0 ? (
            <EmptyState message={search ? 'No installed apps match your filter.' : 'No apps installed yet. Browse Discover to find some.'} />
          ) : (
            <AppGrid>
              {yourApps.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase())).map((app) => (
                <UnifiedAppCard
                  key={app.id}
                  app={app}
                  onClick={() => openDetail(app)}
                />
              ))}
            </AppGrid>
          )
        ) : isSearching ? (
          <div className="space-y-3">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-12 opacity-30">
                <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-[12px]">Searching...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <EmptyState message={`No results for "${search}"`} />
            ) : (
              <AppGrid>
                {searchResults.map(app => (
                  <UnifiedAppCard key={app.id} app={app} onClick={() => openDetail(app)} />
                ))}
              </AppGrid>
            )}
          </div>
        ) : (
          <>
            {registryList.length > 0 && (
              <section>
                <p className="text-[13px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 px-1">Made for Construct</p>
                <AppGrid>
                  {registryList.map(app => (
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
        </div>
      </div>
    </button>
  );
}