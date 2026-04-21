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
  accent, textColor, bg2,
} from '../ui';
import * as api from '@/services/api';

import { useAppDiscovery, CATEGORY_LABELS, CATEGORIES, getHostname, isSensitiveField } from '@/hooks/useAppDiscovery';
import type { UnifiedApp, Category, Tab } from '@/hooks/useAppDiscovery';

// ── Main Component ──

export function AppStoreScreen() {
  const toast = useToast();
  
  const {
    tab, setTab, category, setCategory, search, handleSearch, searching,
    loading, yourApps, suggestedByCategory, registryList, searchResults, isSearching,
    installedIds, connectedToolkits, handleRefresh, fetchInstalled, fetchConnected, userPlan
  } = useAppDiscovery();

  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnifiedApp | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

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

  const openDetail = async (app: UnifiedApp) => {
    setDetail(app); setConfigValues({}); setError(null);

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

  const handleInstallRegistry = async (app: UnifiedApp) => {
    if (!app.registryApp) return;
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    try {
      const res = await api.installApp(app.registryApp.id, { name: app.registryApp.name, description: app.registryApp.description, icon_url: app.registryApp.icon_url, base_url: app.registryApp.base_url, has_ui: app.registryApp.has_ui });
      if (res.success) { haptic('success'); toast.show(`${app.name} installed`, 'success'); await refreshAfterInstall(); }
      else { haptic('error'); setError('Install failed: ' + res.error); }
    } catch (err) { haptic('error'); setError(`Install failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSmithery = async (app: UnifiedApp) => {
    if (!app.smitheryServer) return;
    const required = new Set(app.configSchema?.required || []);
    for (const field of required) { if (!configValues[field]?.trim()) { setError(`Required field "${field}" is empty`); return; } }
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    try {
      const res = await api.installSmitheryServer(app.smitheryServer.qualifiedName, configValues, app.name);
      if (res.success) { haptic('success'); toast.show(`${app.name} installed`, 'success'); await refreshAfterInstall(); }
      else { haptic('error'); setError('Install failed: ' + res.error); }
    } catch (err) { haptic('error'); setError(`Install failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleInstallSkill = async (app: UnifiedApp) => {
    if (!app.smitherySkill) return;
    setPendingActions(prev => ({ ...prev, [app.id]: true }));
    const gitUrl = app.smitherySkillDetail?.gitUrl || app.smitherySkill.gitUrl;
    try {
      const res = await api.installSmitherySkill(app.smitherySkill.qualifiedName, app.smitherySkill.displayName, app.description, gitUrl);
      if (res.success) { haptic('success'); toast.show(`${app.name} installed`, 'success'); await refreshAfterInstall(); }
      else { haptic('error'); setError('Install failed: ' + res.error); }
    } catch (err) { haptic('error'); setError(`Install failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[app.id]; return n; });
  };

  const handleUninstall = async (appId: string, appName: string) => {
    setPendingActions(prev => ({ ...prev, [appId]: true }));
    try {
      const res = await api.uninstallApp(appId);
      if (res.success) { haptic('success'); toast.show(`${appName} uninstalled`, 'success'); await fetchInstalled(); setDetail(null); }
      else { haptic('error'); setError('Uninstall failed: ' + res.error); }
    } catch (err) { haptic('error'); setError(`Uninstall failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[appId]; return n; });
  };

  const handleConnect = async (toolkit: string) => {
    setPendingActions(prev => ({ ...prev, [`composio-${toolkit}`]: true }));
    try {
      const res = await api.getComposioAuthUrl(toolkit);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
        toast.show('Complete authorization in the new tab', 'info');
        const pollInterval = setInterval(async () => {
          await fetchConnected();
          setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
          clearInterval(pollInterval);
        }, 5000);
        setTimeout(() => clearInterval(pollInterval), 120_000);
      } else {
        haptic('error');
        const msg = (res.success && res.data?.error) || (!res.success && res.error) || 'Failed to get auth URL';
        setError(typeof msg === 'string' ? msg : 'Failed to get auth URL');
        setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
      }
    } catch (err) { haptic('error'); setError(`Connect failed: ${err instanceof Error ? err.message : err}`); setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; }); }
  };

  const handleDisconnect = async (toolkit: string) => {
    setPendingActions(prev => ({ ...prev, [`composio-${toolkit}`]: true }));
    try {
      const res = await api.disconnectComposio(toolkit);
      if (res.success) {
        haptic('success'); toast.show('Disconnected', 'success');
        await fetchConnected();
        setDetail(prev => prev?.composioSlug === toolkit ? { ...prev, status: 'available' } : prev);
      } else { haptic('error'); setError('Disconnect failed: ' + res.error); }
    } catch (err) { haptic('error'); setError(`Disconnect failed: ${err instanceof Error ? err.message : err}`); }
    setPendingActions(prev => { const n = { ...prev }; delete n[`composio-${toolkit}`]; return n; });
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
          onClick={() => { setTab('discover'); handleSearch(''); haptic(); }}
          className="px-4 py-2 text-[12px] font-semibold transition-colors relative"
          style={{ color: tab === 'discover' ? accent() : 'rgba(255,255,255,0.4)' }}
        >
          Discover
          {tab === 'discover' && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ backgroundColor: accent() }} />}
        </button>
        <button
          onClick={() => { setTab('installed'); handleSearch(''); haptic(); }}
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

            {suggestedByCategory.length === 0 && registryList.length === 0 && (
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
