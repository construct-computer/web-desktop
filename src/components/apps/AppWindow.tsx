/**
 * AppWindow — renders a third-party app's UI or a generic management panel.
 *
 * Apps WITH a custom UI → sandboxed iframe via backend proxy.
 * Apps WITHOUT a custom UI → generic panel showing app details, status,
 *   tools, OAuth authorization, and error logs.
 *
 * The iframe uses a postMessage bridge ("construct bridge") for communication.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, Package, Wrench,
  ExternalLink, KeyRound, RefreshCw, Check,
  Search, Copy, User as UserIcon, Shield, Globe, Unplug, Hash, Calendar, Plug,
  Info,
} from 'lucide-react';
import Markdown from 'react-markdown';
import type { WindowConfig } from '@/types';
import type { InstalledApp, RegistryAppDetail, ComposioAccountDetail } from '@/services/api';
import { useWindowTitleBarAccessory } from '@/stores/windowAccessoryStore';
import { useWindowStore } from '@/stores/windowStore';
import { useAppStore, localAppIframeRefs } from '@/stores/appStore';
import type { ConnectedToolkit } from '@/stores/appStore';
import { STORAGE_KEYS } from '@/lib/config';
import { agentWS } from '@/services/websocket';
import * as api from '@/services/api';
import { log } from '@/lib/logger';
import { useDevAppStore } from '@/stores/devAppStore';
import { injectSdk } from '@/lib/constructSdk';
import { AuthSchemesPanel } from './AuthSchemesPanel';
import { AppShell, AppHeroHeader, HeaderIconButton, InfoCard, InfoRow, ToolsList, PanelLoading } from './AppShared';
import { formatDate, prettyAuthLabel } from '@/hooks/useAppDiscovery';

const logger = log('AppWindow');

/** Message sent from iframe → platform. */
interface ConstructRequest {
  type: 'construct:request';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

/** Message sent from platform → iframe. */
interface ConstructResponse {
  type: 'construct:response';
  id: string;
  result?: unknown;
  error?: string;
}

export function AppWindow({ config }: { config: WindowConfig }) {
  const appId = config.metadata?.appId as string | undefined;
  const composioSlug = config.metadata?.composioSlug as string | undefined;
  const installedApps = useAppStore((s) => s.installedApps);
  const localApps = useAppStore((s) => s.localApps);
  const connectedToolkits = useAppStore((s) => s.connectedToolkits);
  const fetched = useAppStore((s) => s.fetched);
  const fetchApps = useAppStore((s) => s.fetchApps);

  // Trigger app list fetch if not loaded yet (e.g., after page refresh with persisted windows)
  useEffect(() => {
    if (!fetched) fetchApps();
  }, [fetched, fetchApps]);

  if (!appId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-secondary)]">
        <div className="text-center">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm opacity-50">No app specified</p>
        </div>
      </div>
    );
  }

  // Composio integration — show Composio management panel
  const effectiveSlug = composioSlug || (appId.startsWith('composio-') ? appId.replace('composio-', '') : undefined);
  if (effectiveSlug) {
    const toolkit = connectedToolkits.find((t) => t.toolkit === effectiveSlug);
    return <ComposioAppPanel config={config} slug={effectiveSlug} toolkit={toolkit} />;
  }

  // Dev app — connected from localhost via developer mode
  const devAppInfo = useDevAppStore((s) => s.appInfo);
  const devUrl = useDevAppStore((s) => s.devUrl);
  const devStatus = useDevAppStore((s) => s.status);
  if (appId === 'dev-app' && devAppInfo && devUrl && devStatus === 'connected') {
    return <DevAppIframeView config={config} appId={appId} devUrl={devUrl} />;
  }

  // Local app — agent-created, served from R2 (detected by localApps list, not DB)
  const isLocal = localApps.some((a) => a.id === appId);
  if (isLocal) {
    const localBaseUrl = `/api/apps/local/${appId}`;
    return <IframeAppView config={config} appId={appId} baseUrl={localBaseUrl} isLocal />;
  }

  // Find the installed MCP app data
  const appData = installedApps.find((a) => a.id === appId);
  const hasCustomUI = !!appData?.has_ui;

  // Apps with custom UI get the iframe — wrapped so the user can toggle
  // to the generic details panel via an info button in the title bar.
  if (hasCustomUI && appData) {
    return <InstalledAppView config={config} appId={appId} appData={appData} />;
  }

  // App not found yet — if we haven't fetched, show loading spinner
  if (!fetched) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-secondary)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 opacity-40 animate-spin" />
          <p className="text-sm opacity-40">Loading app...</p>
        </div>
      </div>
    );
  }

  // All other apps get the generic management panel
  return <GenericAppPanel config={config} appId={appId} appData={appData} />;
}

// ── Iframe App View (for apps with custom UI) ──

function IframeAppView({ config, appId, baseUrl, isLocal }: { config: WindowConfig; appId: string; baseUrl: string; isLocal?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Register iframe ref for local apps so agentStore can trigger live reloads
  useEffect(() => {
    if (isLocal) {
      localAppIframeRefs.set(appId, iframeRef);
      return () => { localAppIframeRefs.delete(appId); };
    }
  }, [isLocal, appId]);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== 'construct:request') return;

      const req = data as ConstructRequest;
      let response: ConstructResponse;
      try {
        const result = await handleBridgeMethod(req.method, req.params || {}, config, appId);
        response = { type: 'construct:response', id: req.id, result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        response = { type: 'construct:response', id: req.id, error: msg };
      }
      iframeRef.current?.contentWindow?.postMessage(response, '*');
    },
    [config, appId],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Local apps need auth token in URL since the sandboxed iframe can't send headers/cookies
  const token = isLocal ? localStorage.getItem(STORAGE_KEYS.token) : null;
  const uiUrl = isLocal
    ? `${baseUrl}/${token ? `?token=${encodeURIComponent(token)}` : ''}`
    : `${baseUrl}/ui/`;

  // Allow same-origin ONLY when the app is hosted on its own per-app
  // sub-subdomain (`<label>.apps.construct.computer`). That gives the
  // iframe a real distinct origin, so localStorage / cookies / IndexedDB
  // are scoped to the app alone. Local apps live under our own origin
  // (/api/apps/local/...), so they must stay in the strict opaque-origin
  // sandbox to prevent them from reading the user's auth token from the
  // construct frontend's storage.
  const sandboxAttr = !isLocal && /^https:\/\/[a-z0-9-]+\.apps\.construct\.computer(?:\/|$)/.test(baseUrl)
    ? 'allow-scripts allow-same-origin'
    : 'allow-scripts';

  return (
    <div className="w-full h-full relative bg-[var(--color-bg-secondary)]">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-3 opacity-40 animate-spin" />
            <p className="text-sm opacity-40">Loading app...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center max-w-sm">
            <Package className="w-10 h-10 mx-auto mb-3 text-red-400/60" />
            <p className="text-sm opacity-60 mb-1">Failed to load app</p>
            <p className="text-xs opacity-30">{error}</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={uiUrl}
        className="absolute inset-0 w-full h-full border-none"
        sandbox={sandboxAttr}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError('Failed to load app UI'); }}
        title={config.title}
      />
    </div>
  );
}

// ── Dev App Iframe View (fetches HTML from localhost, injects SDK) ──

function DevAppIframeView({ config, appId, devUrl }: { config: WindowConfig; appId: string; devUrl: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const callToolDirect = useDevAppStore((s) => s.callToolDirect);

  // Fetch HTML from dev server, inject SDK, create blob URL
  useEffect(() => {
    let cancelled = false;
    let currentBlobUrl: string | null = null;

    (async () => {
      try {
        // Try multiple paths for the app's HTML entry point
        let html: string | null = null;
        for (const path of ['/', '/ui/index.html', '/ui/', '/index.html']) {
          try {
            const res = await fetch(`${devUrl}${path}`);
            if (res.ok && res.headers.get('content-type')?.includes('html')) {
              html = await res.text();
              break;
            }
          } catch { /* try next */ }
        }
        if (cancelled) return;
        if (!html) { setError('Could not load app UI from dev server'); setLoading(false); return; }

        // Inject Construct SDK and base tag for relative asset resolution
        const modified = injectSdk(html, `${devUrl}/ui`);
        const blob = new Blob([modified], { type: 'text/html' });
        currentBlobUrl = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(currentBlobUrl); return; }
        setBlobUrl(currentBlobUrl);
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load app'); setLoading(false); }
      }
    })();

    return () => {
      cancelled = true;
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    };
  }, [devUrl]);

  // PostMessage bridge — handles tool calls directly via localhost (no backend round-trip)
  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== 'construct:request') return;

      const req = data as ConstructRequest;
      let response: ConstructResponse;
      try {
        let result: unknown;
        if (req.method === 'tools.call') {
          // Route tool calls directly to localhost (not through backend)
          const tool = req.params?.tool as string;
          const args = (req.params?.arguments as Record<string, unknown>) || {};
          result = await callToolDirect(tool, args);
        } else {
          // Other bridge methods go through the normal handler
          result = await handleBridgeMethod(req.method, req.params || {}, config, appId);
        }
        response = { type: 'construct:response', id: req.id, result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        response = { type: 'construct:response', id: req.id, error: msg };
      }
      iframeRef.current?.contentWindow?.postMessage(response, '*');
    },
    [config, appId, callToolDirect],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return (
    <div className="w-full h-full relative bg-[var(--color-bg-secondary)]">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-3 opacity-40 animate-spin" />
            <p className="text-sm opacity-40">Loading dev app...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center max-w-sm">
            <Package className="w-10 h-10 mx-auto mb-3 text-red-400/60" />
            <p className="text-sm opacity-60 mb-1">Failed to load dev app</p>
            <p className="text-xs opacity-30">{error}</p>
          </div>
        </div>
      )}
      {blobUrl && (
        <iframe
          ref={iframeRef}
          src={blobUrl}
          className="absolute inset-0 w-full h-full border-none"
          sandbox="allow-scripts"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError('Failed to load dev app UI'); }}
          title={config.title}
        />
      )}
    </div>
  );
}

// ── Installed App with UI — iframe + info-toggle to details panel ──

/**
 * For apps that ship a UI, the default view is the iframe. A small info
 * button in the title bar flips between the iframe and the same generic
 * details panel that headless apps use, so the user can inspect tools,
 * hosting info, and network permissions without leaving the window.
 */
function InstalledAppView({
  config, appId, appData,
}: {
  config: WindowConfig;
  appId: string;
  appData: InstalledApp;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useWindowTitleBarAccessory(
    config.id,
    <button
      onClick={() => setShowDetails((v) => !v)}
      className={`p-1 rounded-[5px] transition-colors ${
        showDetails
          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
          : 'text-black/50 dark:text-white/50 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-[var(--color-text)]'
      }`}
      title={showDetails ? 'Show app UI' : 'Show app details'}
      aria-label={showDetails ? 'Show app UI' : 'Show app details'}
    >
      <Info className="w-3.5 h-3.5" />
    </button>,
  );

  if (showDetails) {
    return <GenericAppPanel config={config} appId={appId} appData={appData} />;
  }
  return <IframeAppView config={config} appId={appId} baseUrl={appData.base_url} />;
}

// ── Generic App Management Panel ──

function GenericAppPanel({
  config: _config,
  appId,
  appData: initialData,
}: {
  config: WindowConfig;
  appId: string;
  appData?: InstalledApp;
}) {
  const [appData, setAppData] = useState<InstalledApp | undefined>(initialData);
  const [registryDetail, setRegistryDetail] = useState<RegistryAppDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<api.AppConnectionStatus | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [installed, registry] = await Promise.all([
        api.listInstalledApps(),
        api.getRegistryApp(appId).catch(() => null),
      ]);
      if (installed.success && installed.data) {
        const found = installed.data.apps.find((a) => a.id === appId);
        if (found) setAppData(found);
      }
      if (registry && registry.success && registry.data) {
        setRegistryDetail(registry.data);
      }
    } catch { /* ignore */ }
    setRefreshing(false);
  }, [appId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!appData) {
    return <PanelLoading label="Loading app..." />;
  }

  const tools = (appData.tools || []).map((t) => ({
    slug: t.name,
    name: t.name,
    description: t.description,
  }));

  // Derive host label from the base_url (e.g. devtools-hys57e.apps.construct.computer)
  const hostLabel = (() => {
    try {
      return new URL(appData.base_url).hostname;
    } catch { return appData.base_url; }
  })();

  const iconUrl = registryDetail?.icon_url || appData.icon_url;
  const author = registryDetail?.author?.name;
  const version = registryDetail?.latest_version;
  const category = registryDetail?.category;
  const networkPerms = registryDetail?.permissions?.network || [];
  const repoUrl = registryDetail?.repo_url;
  const description = registryDetail?.long_description || appData.description;
  const requiresAuth = !!registryDetail?.auth;

  return (
    <AppShell>
      <AppHeroHeader
        icon={iconUrl}
        fallbackIcon={<Package className="w-7 h-7 opacity-40" />}
        name={appData.name || appId}
        subtitle={[author && `by ${author}`, version && `v${version}`, category].filter(Boolean).join(' · ')}
        description={description}
        status={{ label: 'Hosted', tone: 'emerald' }}
        badges={[
          'MCP App',
          ...(registryDetail?.verified ? ['Verified'] : []),
          ...(registryDetail?.has_ui ? ['Has UI'] : ['Headless']),
        ]}
        actions={
          <>
            {repoUrl && (
              <HeaderIconButton href={repoUrl} title="Source repository">
                <ExternalLink className="w-3.5 h-3.5" />
              </HeaderIconButton>
            )}
            <HeaderIconButton
              onClick={async () => { setRefreshing(true); await api.refreshAppTools(appId); await refresh(); }}
              disabled={refreshing}
              title="Refresh tools"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </HeaderIconButton>
          </>
        }
      />

      <InfoCard title="Details">
        <InfoRow icon={<Globe className="w-3 h-3" />} label="Hosted at" value={hostLabel} mono copyable />
        {version && <InfoRow icon={<Hash className="w-3 h-3" />} label="Version" value={version} />}
        {appData.installed_at && (
          <InfoRow
            icon={<Calendar className="w-3 h-3" />}
            label="Installed"
            value={formatDate(appData.installed_at)}
          />
        )}
      </InfoCard>

      {requiresAuth && (
        <InfoCard
          title="Authentication"
          subtitle={connectionStatus?.connected
            ? undefined
            : 'Connect an account to let this app\'s tools run.'}
        >
          <AuthSchemesPanel
            appId={appId}
            mode="connect"
            onStatusChange={setConnectionStatus}
          />
        </InfoCard>
      )}

      {networkPerms.length > 0 && (
        <InfoCard title="Network access" subtitle="This app makes outbound requests to:">
          <div className="flex flex-wrap gap-1.5">
            {networkPerms.map((host) => (
              <span key={host} className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06]">
                {host}
              </span>
            ))}
          </div>
        </InfoCard>
      )}

      <ToolsList tools={tools} />
    </AppShell>
  );
}

// ── Composio App Management Panel ──

function ComposioAppPanel({
  config: _config,
  slug,
  toolkit: initialToolkit,
}: {
  config: WindowConfig;
  slug: string;
  toolkit?: ConnectedToolkit;
}) {
  const [detail, setDetail] = useState<{
    slug: string;
    name: string;
    description: string;
    logo: string;
    categories: Array<{ name: string; slug: string }>;
    tools_count: number;
    auth_schemes: string[];
    tools: Array<{ slug: string; name: string; description: string }>;
  } | null>(null);
  const [account, setAccount] = useState<ComposioAccountDetail | null>(null);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [detailRes, statusRes, accountRes] = await Promise.all([
        api.getComposioToolkitDetail(slug),
        api.getComposioStatus(slug),
        api.getComposioAccount(slug).catch(() => null),
      ]);
      if (detailRes.success && detailRes.data) {
        setDetail(detailRes.data);
      }
      if (statusRes.success && statusRes.data) {
        setConnected(statusRes.data.connected);
      }
      if (accountRes && accountRes.success && accountRes.data) {
        setAccount(accountRes.data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [slug]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleReconnect = async () => {
    try {
      const res = await api.getComposioAuthUrl(slug);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank', 'width=600,height=700');
      }
    } catch { /* ignore */ }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.disconnectComposio(slug);
      setConnected(false);
      setAccount(null);
    } catch { /* ignore */ }
    setDisconnecting(false);
  };

  if (loading && !detail) {
    return <PanelLoading label="Loading integration..." />;
  }

  const name = detail?.name || initialToolkit?.name || slug;
  const description = detail?.description || initialToolkit?.description || '';
  const logo = detail?.logo || initialToolkit?.logo;
  const tools = detail?.tools || [];
  const categories = detail?.categories || [];
  const primaryCategory = categories[0]?.name;
  const authLabel = prettyAuthLabel(account?.authScheme || detail?.auth_schemes?.[0]);

  return (
    <AppShell>
      <AppHeroHeader
        icon={logo}
        fallbackIcon={<Plug className="w-7 h-7 opacity-40" />}
        name={name}
        subtitle={[authLabel, primaryCategory, 'via Composio'].filter(Boolean).join(' · ')}
        description={description}
        status={{
          label: connected ? 'Connected' : 'Disconnected',
          tone: connected ? 'emerald' : 'red',
        }}
        badges={[
          'Composio',
          'Integration',
          ...categories.slice(0, 3).map((c) => c.name),
        ]}
        actions={
          <>
            <HeaderIconButton
              href={`https://composio.dev/toolkits/${slug}`}
              title="Open on Composio"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </HeaderIconButton>
            <HeaderIconButton onClick={refresh} disabled={loading} title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </HeaderIconButton>
          </>
        }
      />

      {!connected && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 mb-4 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 dark:border-amber-500/20">
          <KeyRound className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Connection lost</p>
            <p className="text-[11px] text-amber-500/70 dark:text-amber-400/60 mt-0.5 leading-relaxed">
              Re-authorize to restore access.
            </p>
            <button
              onClick={handleReconnect}
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Reconnect
            </button>
          </div>
        </div>
      )}

      {connected && account && account.connected && (
        <InfoCard
          title="Connected account"
          subtitle="Details of the account this integration is linked to."
          right={
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
            >
              {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
              Disconnect
            </button>
          }
        >
          {(account.email || account.displayName) && (
            <InfoRow
              icon={<UserIcon className="w-3 h-3" />}
              label={account.displayName ? 'User' : 'Email'}
              value={account.displayName ? `${account.displayName}${account.email ? ` · ${account.email}` : ''}` : account.email!}
            />
          )}
          {account.accountId && (
            <InfoRow
              icon={<Hash className="w-3 h-3" />}
              label="Account ID"
              value={account.accountId}
              mono
              copyable
            />
          )}
          {authLabel && (
            <InfoRow icon={<Shield className="w-3 h-3" />} label="Auth type" value={authLabel} />
          )}
          {account.createdAt && (
            <InfoRow
              icon={<Calendar className="w-3 h-3" />}
              label="Connected"
              value={formatDate(account.createdAt)}
            />
          )}
        </InfoCard>
      )}

      <ToolsList tools={tools} emptyConnected={connected && tools.length === 0} />
    </AppShell>
  );
}


// ── Bridge method dispatcher ──

async function handleBridgeMethod(
  method: string,
  params: Record<string, unknown>,
  config: WindowConfig,
  appId?: string,
): Promise<unknown> {
  switch (method) {
    case 'ui.setTitle': {
      const title = params.title as string;
      if (title) {
        useWindowStore.getState().updateWindow(config.id, { title });
      }
      return { ok: true };
    }

    case 'ui.getTheme': {
      const isDark = document.documentElement.classList.contains('dark');
      return {
        mode: isDark ? 'dark' : 'light',
        accent: isDark ? '#60A5FA' : '#3B82F6',
      };
    }

    case 'ui.close': {
      useWindowStore.getState().closeWindow(config.id);
      return { ok: true };
    }

    case 'tools.call': {
      if (!appId) throw new Error('No app context');
      const tool = params.tool as string;
      const args = (params.arguments as Record<string, unknown>) || {};
      if (!tool) throw new Error('tool name is required');

      const result = await api.callAppTool(appId, tool, args);
      if (!result.success) throw new Error(result.error || 'Tool call failed');
      return result.data;
    }

    case 'apps.list': {
      const result = await api.listInstalledApps();
      if (!result.success) throw new Error(result.error || 'Failed to list apps');
      return result.data;
    }

    case 'apps.install': {
      const installAppId = params.appId as string;
      if (!installAppId) throw new Error('appId is required');
      const result = await api.installApp(installAppId, params as Parameters<typeof api.installApp>[1]);
      if (!result.success) throw new Error(result.error || 'Install failed');
      return result.data;
    }

    case 'apps.uninstall': {
      const uninstallId = params.appId as string;
      if (!uninstallId) throw new Error('appId is required');
      const result = await api.uninstallApp(uninstallId);
      if (!result.success) throw new Error(result.error || 'Uninstall failed');
      return result.data;
    }

    // ── State bridge methods (local apps only) ──

    case 'state.get': {
      if (!appId) throw new Error('No app context');
      const stateRes = await api.getLocalAppState(appId);
      if (!stateRes.success) throw new Error(stateRes.error || 'Failed to read state');
      return stateRes.data;
    }

    case 'state.set': {
      if (!appId) throw new Error('No app context');
      const newState = params.state as Record<string, unknown>;
      if (newState === undefined || newState === null) throw new Error('state is required');
      const setRes = await api.setLocalAppState(appId, newState);
      if (!setRes.success) throw new Error(setRes.error || 'Failed to write state');
      return { ok: true };
    }

    // ── Agent notification (isolated channel, not visible in chat) ──

    case 'agent.notify': {
      if (!appId) throw new Error('No app context');
      const notifyMsg = params.message as string;
      if (!notifyMsg) throw new Error('message is required');
      // Send via WebSocket as an app_notification (NOT a chat message)
      agentWS.send({
        type: 'app_notification',
        appId,
        message: notifyMsg,
      });
      return { ok: true };
    }

    default:
      throw new Error(`Unknown bridge method: ${method}`);
  }
}
