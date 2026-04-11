/**
 * App Registry — discovery and management of Construct apps.
 *
 * Lists curated Construct apps from the registry. Third-party services
 * (Gmail, Drive, GitHub, etc.) are managed separately in Settings → Connections.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Loader2, RefreshCw, ChevronLeft, X, Check,
  AlertCircle, ExternalLink, Plug, Upload, Wrench, Shield,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import * as api from '@/services/api';
import type { InstalledApp } from '@/services/api';
import { useAppStore } from '@/stores/appStore';
import { useBillingStore } from '@/stores/billingStore';
import { useWindowStore } from '@/stores/windowStore';
import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';
import { openSettingsToSection } from '@/lib/settingsNav';
import Markdown from 'react-markdown';

// ── Types ──

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
  has_ui: boolean;
  tools: Array<{ name: string; description: string }>;
  install_count: number;
  featured: boolean;
}

type Tab = 'discover' | 'installed';

const PUBLISH_URL = 'https://github.com/construct-computer/app-registry';

// ── Helpers ──

function getInstalledIconUrl(appId: string, hasIcon: boolean): string | undefined {
  if (!hasIcon) return undefined;
  const token = localStorage.getItem(STORAGE_KEYS.token) || '';
  return `${API_BASE_URL}/apps/${encodeURIComponent(appId)}/icon?token=${encodeURIComponent(token)}`;
}

// ── Main Component ──

export function AppRegistryWindow({ config: _config }: { config: WindowConfig }) {
  const openWindow = useWindowStore((s) => s.openWindow);
  const [tab, setTab] = useState<Tab>('discover');
  const [search, setSearch] = useState('');

  const [registryApps, setRegistryApps] = useState<RegistryApp[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const installedIds = new Set(installedApps.map((a) => a.id));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail view
  const [detail, setDetail] = useState<RegistryApp | InstalledApp | null>(null);

  // Pending install/uninstall
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

  // Plan limits
  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  useEffect(() => { if (!subscription) fetchSubscription(); }, [subscription, fetchSubscription]);
  const maxApps = (subscription?.planLimits as Record<string, number> | undefined)?.maxInstalledApps ?? -1;
  const atAppLimit = maxApps > 0 && installedApps.length >= maxApps;

  // Sync with global app store
  const syncLaunchpad = useAppStore((s) => s.fetchApps);
  const globalInstalledApps = useAppStore((s) => s.installedApps);

  // ── Data fetching ──

  const fetchRegistry = useCallback(async () => {
    try {
      const result = await api.searchRegistry();
      if (result.success && result.data) {
        setRegistryApps(result.data.apps || []);
      }
    } catch { /* registry unavailable */ }
  }, []);

  const fetchInstalled = useCallback(async () => {
    try {
      const result = await api.listInstalledApps();
      if (result.success && result.data) {
        setInstalledApps(result.data.apps || []);
      }
    } catch { /* ignore */ }
    syncLaunchpad();
  }, [syncLaunchpad]);

  // Initial load
  useEffect(() => {
    Promise.all([fetchRegistry(), fetchInstalled()])
      .finally(() => setLoading(false));
  }, [fetchRegistry, fetchInstalled]);

  // Sync from global store when other windows install/uninstall
  useEffect(() => {
    setInstalledApps(globalInstalledApps);
  }, [globalInstalledApps]);

  const handleRefresh = () => {
    setLoading(true);
    Promise.all([fetchRegistry(), fetchInstalled()]).finally(() => setLoading(false));
  };

  // ── Actions ──

  const handleInstall = async (app: RegistryApp) => {
    if (atAppLimit && !installedIds.has(app.id)) {
      setError(`App limit reached (${maxApps} apps on your plan). Uninstall an app or upgrade.`);
      return;
    }
    setError(null);
    setPendingActions((p) => ({ ...p, [app.id]: true }));
    try {
      const result = await api.installApp(app.id, {
        name: app.name,
        description: app.description,
        icon_url: app.icon_url,
        has_ui: app.has_ui,
      });
      if (!result.success) throw new Error(result.error || 'Install failed');
      await fetchInstalled();
    } catch (err) {
      setError(`Install failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions((p) => { const n = { ...p }; delete n[app.id]; return n; });
  };

  const handleUninstall = async (appId: string) => {
    setError(null);
    setPendingActions((p) => ({ ...p, [appId]: true }));
    try {
      const result = await api.uninstallApp(appId);
      if (!result.success) throw new Error(result.error || 'Uninstall failed');
      await fetchInstalled();
      setDetail(null);
    } catch (err) {
      setError(`Uninstall failed: ${err instanceof Error ? err.message : err}`);
    }
    setPendingActions((p) => { const n = { ...p }; delete n[appId]; return n; });
  };

  const handleOpenInstalled = (app: InstalledApp) => {
    openWindow('app', {
      title: app.name,
      icon: getInstalledIconUrl(app.id, !!app.icon_url),
      metadata: { appId: app.id },
    } as Partial<WindowConfig>);
  };

  // ── Filtered lists ──

  const q = search.trim().toLowerCase();
  const filterApp = (a: { name: string; description: string; id: string }) =>
    !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);

  const discoverList = registryApps.filter(filterApp);
  const installedList = installedApps.filter((a) => filterApp({ name: a.name, description: a.description, id: a.id }));

  // ── Detail view ──

  if (detail) {
    const isInstalled = 'installed_at' in detail || installedIds.has(detail.id);
    const detailIcon = 'icon_url' in detail
      ? (typeof detail.icon_url === 'string' && detail.icon_url) || getInstalledIconUrl(detail.id, true)
      : undefined;
    const detailRegistry = 'latest_version' in detail ? (detail as RegistryApp) : null;
    const detailInstalled = 'installed_at' in detail ? (detail as InstalledApp) : null;
    const tools = detailRegistry?.tools || detailInstalled?.tools || [];
    const isPending = !!pendingActions[detail.id];

    return (
      <div className="flex flex-col h-full text-[var(--color-text)] select-none">
        {/* Detail header */}
        <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <button
            onClick={() => setDetail(null)}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-3"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex items-start gap-3">
            <div className="w-[56px] h-[56px] rounded-[12px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {detailIcon ? (
                <img src={detailIcon} alt={detail.name} className="w-[40px] h-[40px] object-contain" />
              ) : (
                <Wrench className="w-6 h-6 text-black/30 dark:text-white/30" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[18px] font-bold truncate">{detail.name}</h2>
                {isInstalled && (
                  <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-px rounded-full uppercase tracking-wide">
                    Installed
                  </span>
                )}
              </div>
              {detailRegistry?.author?.name && (
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">by {detailRegistry.author.name}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {isInstalled ? (
                  <>
                    <button
                      onClick={() => detailInstalled && handleOpenInstalled(detailInstalled)}
                      disabled={!detailInstalled || !(detailInstalled.has_ui)}
                      className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleUninstall(detail.id)}
                      disabled={isPending}
                      className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                    >
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Uninstall'}
                    </button>
                  </>
                ) : detailRegistry ? (
                  <button
                    onClick={() => handleInstall(detailRegistry)}
                    disabled={isPending || atAppLimit}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin inline" /> : atAppLimit ? 'Limit reached' : 'Install'}
                  </button>
                ) : null}
                {detailRegistry?.repo_url && (
                  <a
                    href={detailRegistry.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Source
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Detail body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 text-[12px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3 py-2 mb-3">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <p className="text-[13px] text-[var(--color-text)]/80 leading-relaxed mb-4">
            <Markdown>{detail.description}</Markdown>
          </p>

          {tools.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {tools.length} tool{tools.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="space-y-1.5">
                {tools.map((t) => (
                  <div key={t.name} className="rounded-[8px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] px-3 py-2">
                    <div className="text-[12px] font-mono font-semibold">{t.name}</div>
                    {t.description && <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{t.description}</div>}
                  </div>
                ))}
              </div>
            </div>
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
          <h1 className="text-lg font-bold">Apps</h1>
          <div className="flex items-center gap-1">
            <a
              href={PUBLISH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              title="Publish your own app"
            >
              <Upload className="w-3 h-3" /> Publish your app
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

        {/* Connections banner */}
        <button
          onClick={() => openSettingsToSection('connections')}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 mb-3 rounded-[10px] border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/[0.06] hover:bg-[var(--color-accent)]/[0.1] transition-colors text-left"
        >
          <div className="w-[28px] h-[28px] rounded-[8px] bg-[var(--color-accent)]/15 flex items-center justify-center flex-shrink-0">
            <Plug className="w-3.5 h-3.5 text-[var(--color-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold">Connect third-party services</div>
            <div className="text-[11px] text-[var(--color-text-muted)] truncate">
              Gmail, Drive, GitHub, Slack, and more — manage in Settings → Connections
            </div>
          </div>
          <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-[var(--color-text-muted)] flex-shrink-0" />
        </button>

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
            {installedApps.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-black/50 dark:text-white/50">
                {installedApps.length}
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
            placeholder={tab === 'installed' ? 'Filter installed apps...' : 'Search Construct apps...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
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
        ) : tab === 'discover' ? (
          discoverList.length === 0 ? (
            <EmptyState message={search ? 'No apps match your search.' : 'No apps available.'} />
          ) : (
            <AppGrid>
              {discoverList.map((app) => (
                <RegistryAppCard
                  key={app.id}
                  app={app}
                  isInstalled={installedIds.has(app.id)}
                  isPending={!!pendingActions[app.id]}
                  atLimit={atAppLimit}
                  onClick={() => setDetail(app)}
                  onInstall={() => handleInstall(app)}
                />
              ))}
            </AppGrid>
          )
        ) : (
          installedList.length === 0 ? (
            <EmptyState message={search ? 'No installed apps match your filter.' : 'No apps installed yet. Browse Discover to find some.'} />
          ) : (
            <AppGrid>
              {installedList.map((app) => (
                <InstalledAppCard
                  key={app.id}
                  app={app}
                  isPending={!!pendingActions[app.id]}
                  onClick={() => setDetail(app)}
                  onOpen={() => handleOpenInstalled(app)}
                />
              ))}
            </AppGrid>
          )
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

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

function RegistryAppCard({
  app, isInstalled, isPending, atLimit, onClick, onInstall,
}: {
  app: RegistryApp;
  isInstalled: boolean;
  isPending: boolean;
  atLimit: boolean;
  onClick: () => void;
  onInstall: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 px-3 py-3 rounded-[10px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-[36px] h-[36px] rounded-[8px] bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {app.icon_url ? (
          <img src={app.icon_url} alt={app.name} className="w-[28px] h-[28px] object-contain" />
        ) : (
          <Wrench className="w-4 h-4 text-black/30 dark:text-white/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold truncate">{app.name}</span>
          {isInstalled && (
            <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mt-0.5 leading-snug">
          {app.description}
        </p>
        <div className="mt-2">
          {isInstalled ? (
            <span className="text-[10px] font-semibold text-emerald-500">Installed</span>
          ) : (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); if (!isPending && !atLimit) onInstall(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); if (!isPending && !atLimit) onInstall(); } }}
              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                isPending || atLimit ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-accent)] hover:opacity-80'
              } cursor-pointer`}
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {atLimit ? 'Limit reached' : isPending ? 'Installing...' : 'Install'}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function InstalledAppCard({
  app, isPending, onClick, onOpen,
}: {
  app: InstalledApp;
  isPending: boolean;
  onClick: () => void;
  onOpen: () => void;
}) {
  const iconUrl = getInstalledIconUrl(app.id, !!app.icon_url);
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 px-3 py-3 rounded-[10px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-[36px] h-[36px] rounded-[8px] bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {iconUrl ? (
          <img src={iconUrl} alt={app.name} className="w-[28px] h-[28px] object-contain" />
        ) : (
          <Wrench className="w-4 h-4 text-black/30 dark:text-white/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold truncate">{app.name}</span>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mt-0.5 leading-snug">
          {app.description || `${app.tools.length} tool${app.tools.length === 1 ? '' : 's'}`}
        </p>
        {app.has_ui && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); if (!isPending) onOpen(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); if (!isPending) onOpen(); } }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] hover:opacity-80 cursor-pointer mt-2"
          >
            Open
          </span>
        )}
      </div>
    </button>
  );
}
