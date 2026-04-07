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
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import type { InstalledApp } from '@/services/api';
import { useWindowStore } from '@/stores/windowStore';
import { useAppStore, localAppIframeRefs } from '@/stores/appStore';
import type { ConnectedToolkit } from '@/stores/appStore';
import { STORAGE_KEYS } from '@/lib/config';
import { agentWS } from '@/services/websocket';
import * as api from '@/services/api';
import { log } from '@/lib/logger';

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

  // Local app — agent-created, served from R2 (detected by localApps list, not DB)
  const isLocal = localApps.some((a) => a.id === appId);
  if (isLocal) {
    const localBaseUrl = `/api/apps/local/${appId}`;
    return <IframeAppView config={config} appId={appId} baseUrl={localBaseUrl} isLocal />;
  }

  // Find the installed MCP app data
  const appData = installedApps.find((a) => a.id === appId);
  const hasCustomUI = !!appData?.has_ui;

  // Apps with custom UI get the iframe
  if (hasCustomUI && appData) {
    return <IframeAppView config={config} appId={appId} baseUrl={appData.base_url} />;
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
        sandbox="allow-scripts"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError('Failed to load app UI'); }}
        title={config.title}
      />
    </div>
  );
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
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await api.listInstalledApps();
      if (result.success && result.data) {
        const found = result.data.apps.find((a) => a.id === appId);
        if (found) setAppData(found);
      }
    } catch { /* ignore */ }
    setRefreshing(false);
  }, [appId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!appData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-secondary)]">
        <div className="text-center">
          <Loader2 className="w-6 h-6 mx-auto mb-2 opacity-40 animate-spin" />
          <p className="text-xs opacity-40">Loading app...</p>
        </div>
      </div>
    );
  }

  const tools = appData.tools || [];

  return (
    <div className="w-full h-full flex flex-col bg-[var(--color-bg-secondary)] text-[var(--color-text)] select-none">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-500">Hosted</span>
          </div>
          <button
            onClick={async () => { setRefreshing(true); await api.refreshAppTools(appId); await refresh(); }}
            disabled={refreshing}
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Refresh tools"
          >
            <RefreshCw className={`w-3.5 h-3.5 opacity-40 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Description */}
        {appData.description && (
          <p className="text-sm opacity-60 leading-relaxed mb-4">{appData.description}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Badge>MCP App</Badge>
        </div>

        {/* Tools */}
        {tools.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold opacity-40 uppercase tracking-wide mb-2">
              Tools ({tools.length})
            </h3>
            <div className="space-y-1">
              {tools.map((tool) => (
                <div key={tool.name} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
                  <Wrench className="w-3 h-3 opacity-25 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold font-mono opacity-70">{tool.name}</span>
                    {tool.description && (
                      <p className="text-[11px] opacity-35 mt-0.5 leading-relaxed line-clamp-2">{tool.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tools.length === 0 && (
          <div className="text-center py-6">
            <Package className="w-6 h-6 mx-auto mb-2 opacity-20" />
            <p className="text-xs opacity-40">No tools cached. Click refresh to discover tools.</p>
          </div>
        )}
      </div>
    </div>
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
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [detailRes, statusRes] = await Promise.all([
        api.getComposioToolkitDetail(slug),
        api.getComposioStatus(slug),
      ]);
      if (detailRes.success && detailRes.data) {
        setDetail(detailRes.data);
      }
      if (statusRes.success && statusRes.data) {
        setConnected(statusRes.data.connected);
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

  if (loading && !detail) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-secondary)]">
        <div className="text-center">
          <Loader2 className="w-6 h-6 mx-auto mb-2 opacity-40 animate-spin" />
          <p className="text-xs opacity-40">Loading integration...</p>
        </div>
      </div>
    );
  }

  const name = detail?.name || initialToolkit?.name || slug;
  const description = detail?.description || initialToolkit?.description || '';
  const tools = detail?.tools || [];
  const categories = detail?.categories || [];

  return (
    <div className="w-full h-full flex flex-col bg-[var(--color-bg-secondary)] text-[var(--color-text)] select-none">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Status row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className={`text-xs font-medium ${connected ? 'text-emerald-500' : 'text-red-500'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 opacity-40 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm opacity-60 leading-relaxed mb-4">{description}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Badge>Composio</Badge>
          <Badge>Integration</Badge>
          {categories.map((c) => (
            <Badge key={c.slug}>{c.name}</Badge>
          ))}
        </div>

        {/* Reconnect if disconnected */}
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

        {/* Tools */}
        {tools.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold opacity-40 uppercase tracking-wide mb-2">
              Tools ({tools.length})
            </h3>
            <div className="space-y-1">
              {tools.map((tool) => (
                <div key={tool.slug} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
                  <Wrench className="w-3 h-3 opacity-25 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold font-mono opacity-70">{tool.name}</span>
                    {tool.description && (
                      <p className="text-[11px] opacity-35 mt-0.5 leading-relaxed line-clamp-2">{tool.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tools.length === 0 && connected && (
          <div className="text-center py-6">
            <Check className="w-6 h-6 mx-auto mb-2 text-emerald-500/40" />
            <p className="text-xs opacity-40">Integration is connected. Tools are available to the agent via Composio.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] opacity-50 border border-black/[0.06] dark:border-white/[0.06]">
      {children}
    </span>
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
