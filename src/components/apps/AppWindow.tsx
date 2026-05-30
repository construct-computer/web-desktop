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
  ExternalLink, RefreshCw, Check,
  Search, Copy, User as UserIcon, Shield, Globe, Unplug, Hash, Calendar, Plug,
  Info, Pencil, Trash2,
} from 'lucide-react';
import Markdown from 'react-markdown';
import type { WindowConfig } from '@/types';
import type { InstalledApp, LocalApp, RegistryAppDetail, ComposioAccountDetail } from '@/services/api';
import { useWindowTitleBarAccessory } from '@/stores/windowAccessoryStore';
import { useWindowStore } from '@/stores/windowStore';
import { useAppStore, localAppIframeRefKey, localAppIframeRefs, reloadLocalAppIframes } from '@/stores/appStore';
import type { ConnectedToolkit } from '@/stores/appStore';
import { API_BASE_URL, STORAGE_KEYS } from '@/lib/config';
import { agentWS } from '@/services/websocket';
import * as api from '@/services/api';
import { log } from '@/lib/logger';
import { useComputerStore, type ComponentMention } from '@/stores/agentStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useDevAppStore } from '@/stores/devAppStore';
import { AuthSchemesPanel } from './AuthSchemesPanel';
import { ComposioAuthPanel } from './ComposioAuthPanel';
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
  const devAppInfo = useDevAppStore((s) => s.appInfo);
  const devUrl = useDevAppStore((s) => s.devUrl);
  const devStatus = useDevAppStore((s) => s.status);

  // Trigger app list fetch if not loaded yet (e.g., after page refresh with persisted windows)
  useEffect(() => {
    if (!fetched) fetchApps();
  }, [fetched, fetchApps]);

  if (!appId) {
    return (
      <div className="w-full h-full flex items-center justify-center surface-app">
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
  if (appId === 'dev-app' && devAppInfo && devUrl && devStatus === 'connected') {
    return <DevAppIframeView config={config} appId={appId} devUrl={devUrl} />;
  }

  // Local app — agent-created, served from R2 (detected by localApps list, not DB)
  const localApp = localApps.find((a) => a.id === appId);
  if (localApp) {
    return <LocalAppView config={config} appId={appId} app={localApp} />;
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
      <div className="w-full h-full flex items-center justify-center surface-app">
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

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function IframeAppView({
  config, appId, baseUrl, isLocal, appData, preview,
}: {
  config: WindowConfig;
  appId: string;
  baseUrl: string;
  isLocal?: boolean;
  appData?: InstalledApp;
  preview?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingFrame, setCheckingFrame] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [proxyReason, setProxyReason] = useState<string | null>(null);
  const [localAppToken, setLocalAppToken] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Register iframe ref for local apps so agentStore can trigger live reloads.
  // Use a composite key (windowId::appId) to avoid collisions when the same app
  // is open in multiple windows.
  const iframeRefKey = localAppIframeRefKey(config.id, appId);
  useEffect(() => {
    if (isLocal) {
      localAppIframeRefs.set(iframeRefKey, iframeRef);
      return () => { localAppIframeRefs.delete(iframeRefKey); };
    }
  }, [isLocal, appId, iframeRefKey]);

  const postThemeToIframe = useCallback(() => {
    if (!isLocal || !iframeRef.current?.contentWindow) return;
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const tokens = {
      bg: cs.getPropertyValue('--color-bg').trim(),
      surface: cs.getPropertyValue('--color-surface').trim(),
      surfaceRaised: cs.getPropertyValue('--color-surface-raised').trim(),
      text: cs.getPropertyValue('--color-text').trim(),
      textMuted: cs.getPropertyValue('--color-text-muted').trim(),
      textSubtle: cs.getPropertyValue('--color-text-subtle').trim(),
      border: cs.getPropertyValue('--color-border').trim(),
      borderStrong: cs.getPropertyValue('--color-border-strong').trim(),
      accent: cs.getPropertyValue('--color-accent').trim(),
      success: cs.getPropertyValue('--color-success').trim(),
      error: cs.getPropertyValue('--color-error').trim(),
      warning: cs.getPropertyValue('--color-warning').trim(),
    };
    iframeRef.current.contentWindow.postMessage(
      { type: 'construct:set_theme', tokens },
      '*',
    );
  }, [isLocal]);

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

  const isCustomUrlApp = !isLocal && appData?.registry_linked === false;

  useEffect(() => {
    let cancelled = false;
    setUseProxy(false);
    setProxyReason(null);

    if (!isCustomUrlApp) {
      setCheckingFrame(false);
      return () => { cancelled = true; };
    }

    setCheckingFrame(true);
    api.checkAppUiFrame(appId).then((res) => {
      if (cancelled) return;
      const data = res.success ? res.data : null;
      if (data?.blocked && data.proxy_available) {
        setUseProxy(true);
        setProxyReason(data.reason || 'remote iframe policy');
      }
    }).catch(() => {
      // Keep the direct load path if detection itself fails.
    }).finally(() => {
      if (!cancelled) setCheckingFrame(false);
    });

    return () => { cancelled = true; };
  }, [appId, isCustomUrlApp]);

  useEffect(() => {
    if (!isLocal) {
      setLocalAppToken(null);
      return;
    }
    let cancelled = false;
    api.mintLocalAppToken(appId).then((res) => {
      if (cancelled) return;
      if (res.success) {
        if (res.data?.token) setLocalAppToken(res.data.token);
        else setError('Failed to prepare local app session');
      } else {
        setError(res.error || 'Failed to prepare local app session');
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [isLocal, appId]);

  // Local apps use an app-scoped token; custom proxy still uses the user session token.
  const token = useProxy ? localStorage.getItem(STORAGE_KEYS.token) : null;
  const directUiUrl = isCustomUrlApp ? withTrailingSlash(baseUrl) : `${baseUrl}/ui/`;
  const proxyUiUrl = `${API_BASE_URL}/apps/${encodeURIComponent(appId)}/ui-proxy${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const uiUrl = isLocal
    ? `${withTrailingSlash(baseUrl)}${localAppToken ? `?app_token=${encodeURIComponent(localAppToken)}${preview ? '&preview=1' : ''}` : preview ? '?preview=1' : ''}`
    : useProxy
      ? proxyUiUrl
      : directUiUrl;

  useEffect(() => {
    setLoading(true);
    setError(null);
  }, [uiUrl]);

  // Allow same-origin ONLY when the app is hosted on its own per-app
  // sub-subdomain (`<label>.apps.construct.computer`). That gives the
  // iframe a real distinct origin, so localStorage / cookies / IndexedDB
  // are scoped to the app alone. Local apps live under our own origin
  // (/api/apps/local/...), so they must stay in the strict opaque-origin
  // sandbox to prevent them from reading the user's auth token from the
  // construct frontend's storage.
  const sandboxAttr = !isLocal && /^https:\/\/[a-z0-9-]+\.apps\.construct\.computer(?:\/|$)/.test(baseUrl)
    ? 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'
    : 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

  return (
    <div className="w-full h-full relative surface-app">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-3 opacity-40 animate-spin" />
            <p className="text-sm opacity-40">{checkingFrame ? 'Checking app framing...' : 'Loading app...'}</p>
            {useProxy && proxyReason && (
              <p className="text-[11px] opacity-30 mt-1">Using secure proxy: {proxyReason}</p>
            )}
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
      {!checkingFrame && (!isLocal || localAppToken) && (
        <iframe
          ref={iframeRef}
          src={uiUrl}
          className="absolute inset-0 w-full h-full border-none"
          sandbox={sandboxAttr}
          onLoad={() => { setLoading(false); postThemeToIframe(); }}
          onError={() => { setLoading(false); setError('Failed to load app UI'); }}
          title={config.title}
        />
      )}
    </div>
  );
}

// ── Dev App Iframe View (fetches HTML from localhost, injects SDK) ──

function DevAppIframeView({ config, appId, devUrl }: { config: WindowConfig; appId: string; devUrl: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const callToolDirect = useDevAppStore((s) => s.callToolDirect);

  // Load the iframe directly from the dev server URL instead of fetching
  // the HTML ourselves, injecting a bridge, and handing the iframe a
  // blob: URL. The blob-URL approach inherits the *public* address
  // space from its creator (staging.construct.computer) even though the
  // iframe's base URL is localhost, so every subresource fetch
  // (app.js, favicons, CSS) is a public→local cross-address-space
  // request that trips Chromium's Private Network Access enforcement.
  // Loading the iframe directly from `http://localhost:<port>/` gives
  // the iframe a local address space, so same-host subresources stay
  // local→local and PNA never comes into play. The Construct SDK
  // (served by the app itself at `/sdk/construct.js`) auto-detects
  // hosted vs. standalone at init and routes tool calls over the
  // postMessage bridge when `window !== window.top`, so no injection
  // is needed here.



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
    <div className="w-full h-full relative surface-app">
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
      <iframe
        ref={iframeRef}
        src={devUrl}
        className="absolute inset-0 w-full h-full border-none"
        sandbox="allow-scripts"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError('Failed to load dev app UI'); }}
        title={config.title}
      />

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
  return <IframeAppView config={config} appId={appId} baseUrl={appData.base_url} appData={appData} />;
}

// ── Local App with UI — iframe + info-toggle to manifest/tool details ──

function LocalAppView({
  config, appId, app,
}: {
  config: WindowConfig;
  appId: string;
  app: LocalApp;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [previewFileCount, setPreviewFileCount] = useState<number | null>(null);
  const instanceId = useComputerStore((s) => s.instanceId);
  const addComponentMention = useComputerStore((s) => s.addComponentMention);

  // Check for pending preview on mount
  useEffect(() => {
    let cancelled = false;
    api.getLocalAppPreviewStatus(appId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data?.hasPreview) {
        setIsPreview(true);
        setPreviewFileCount(res.data.fileCount ?? null);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [appId]);

  const iframeKey = localAppIframeRefKey(config.id, appId);

  const toggleEdit = useCallback(() => {
    const next = !isEditing;
    setIsEditing(next);
    const iframe = localAppIframeRefs.get(iframeKey)?.current;
    iframe?.contentWindow?.postMessage(
      { type: 'construct:set_inspector', enabled: next },
      '*',
    );
  }, [isEditing, appId, iframeKey]);

  // Keyboard shortcuts: Ctrl/Cmd+E toggles edit, Escape exits edit.
  // Ignore when focus is in an input/textarea/contenteditable.
  function isEditableTarget(el: EventTarget | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  }
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        toggleEdit();
      }
      if (e.key === 'Escape' && isEditing) {
        e.preventDefault();
        toggleEdit();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, toggleEdit]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframe = localAppIframeRefs.get(iframeKey)?.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      if (event.data?.type === 'construct:component_selected') {
        const component = event.data.component;
        if (component && typeof component === 'object') {
          const record = component as Record<string, unknown>;
          const componentId = typeof record.id === 'string'
            ? record.id
            : typeof record.componentId === 'string'
              ? record.componentId
              : '';
          const componentType = typeof record.type === 'string'
            ? record.type
            : typeof record.componentType === 'string'
              ? record.componentType
              : '';
          if (componentId && componentType) {
            addComponentMention({
              appId,
              componentId,
              componentType,
              label: typeof record.label === 'string' ? record.label : undefined,
              path: typeof record.path === 'string' ? record.path : undefined,
              props: record.props && typeof record.props === 'object' && !Array.isArray(record.props)
                ? record.props as Record<string, unknown>
                : undefined,
              bindings: record.bindings && typeof record.bindings === 'object' && !Array.isArray(record.bindings)
                ? record.bindings as Record<string, string>
                : undefined,
              actions: record.actions && typeof record.actions === 'object' && !Array.isArray(record.actions)
                ? record.actions as ComponentMention['actions']
                : undefined,
            });
          }
        }
        return;
      }
      if (event.data?.type !== 'construct:edit_request_sent') return;
      const { element, prompt: instruction } = event.data;
      if (!element) return;
      setIsProcessing(true);
      (async () => {
        try {
          const sessionKey = `edit-${appId}-stable`;
          await api.createAgentSession(instanceId!, `Editing ${app.manifest.name}`, sessionKey);
          agentWS.send({
            type: 'app_notification',
            appId,
            message: instruction || 'Update this component.',
            __isEditRequest: true,
            sessionKey,
            editRequest: { element, prompt: instruction },
          });
        } catch {
          agentWS.send({
            type: 'app_notification',
            appId,
            message: instruction || 'Update this component.',
            __isEditRequest: true,
            editRequest: { element, prompt: instruction },
          });
        }
      })();
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [addComponentMention, appId, app.manifest.name, iframeKey, instanceId]);

  useEffect(() => {
    function handleComplete(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.appId !== appId) return;
      setIsProcessing(false);
      setIsEditing(false);
      setIsPreview(false);
      setPreviewFileCount(null);
      const iframe = localAppIframeRefs.get(iframeKey)?.current;
      iframe?.contentWindow?.postMessage(
        { type: 'construct:set_inspector', enabled: false },
        '*',
      );
      useNotificationStore.getState().addNotification(
        {
          title: 'App Updated',
          body: `${app.manifest.name} has been updated.`,
          variant: 'success',
        },
        6000,
      );
    }
    function handlePreviewComplete(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.appId !== appId) return;
      setIsProcessing(false);
      setIsPreview(true);
      api.getLocalAppPreviewStatus(appId).then((res) => {
        if (res.success && res.data?.hasPreview) setPreviewFileCount(res.data.fileCount ?? null);
      }).catch(() => {});
      reloadLocalAppIframes(appId);
      useNotificationStore.getState().addNotification(
        {
          title: 'Preview Ready',
          body: `Changes to ${app.manifest.name} are ready to review. Accept or discard.`,
          variant: 'success',
        },
        0,
      );
    }
    window.addEventListener('construct:app_update_complete', handleComplete);
    window.addEventListener('construct:app_preview_complete', handlePreviewComplete);
    return () => {
      window.removeEventListener('construct:app_update_complete', handleComplete);
      window.removeEventListener('construct:app_preview_complete', handlePreviewComplete);
    };
  }, [appId, app.manifest.name, iframeKey]);

  const handleAccept = useCallback(async () => {
    try {
      const res = await api.acceptLocalAppPreview(appId);
      if (!res.success) throw new Error(res.error || 'Accept failed');
      setIsPreview(false);
      setPreviewFileCount(null);
      useNotificationStore.getState().addNotification(
        { title: 'Changes Accepted', body: `${app.manifest.name} updated.`, variant: 'success' },
        5000,
      );
    } catch (err) {
      logger.warn('Failed to accept preview:', err);
      useNotificationStore.getState().addNotification(
        { title: 'Accept Failed', body: err instanceof Error ? err.message : String(err), variant: 'error' },
        6000,
      );
    }
  }, [appId, app.manifest.name]);

  const handleDiscard = useCallback(async () => {
    try {
      const res = await api.discardLocalAppPreview(appId);
      if (!res.success) throw new Error(res.error || 'Discard failed');
      setIsPreview(false);
      setPreviewFileCount(null);
      const iframe = localAppIframeRefs.get(iframeKey)?.current;
      if (iframe) iframe.src = iframe.src;
    } catch (err) {
      logger.warn('Failed to discard preview:', err);
      useNotificationStore.getState().addNotification(
        { title: 'Discard Failed', body: err instanceof Error ? err.message : String(err), variant: 'error' },
        6000,
      );
    }
  }, [appId, iframeKey]);

  useWindowTitleBarAccessory(
    config.id,
    <>
      <button
        onClick={() => useWindowStore.getState().openWindow('app-builder', {
          title: `Builder - ${app.manifest.name}`,
          metadata: { appId },
        })}
        className="p-1 rounded-[5px] text-black/50 dark:text-white/50 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-[var(--color-text)] transition-colors"
        title="Open in Builder"
        aria-label="Open in Builder"
      >
        <Wrench className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={toggleEdit}
        className={`p-1 rounded-[5px] transition-colors ${
          isEditing
            ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
            : 'text-black/50 dark:text-white/50 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-[var(--color-text)]'
        }`}
        title={isEditing ? 'Exit edit mode' : 'Edit app'}
        aria-label={isEditing ? 'Exit edit mode' : 'Edit app'}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
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
      </button>
    </>,
  );

  if (showDetails) {
    return (
      <LocalAppPanel
        appId={appId}
        app={app}
        config={config}
        onShowUi={() => setShowDetails(false)}
      />
    );
  }

  return (
    <div className="w-full h-full relative">
      {isPreview && (
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/30">
          <span className="text-xs text-amber-400 font-medium">
            Preview mode - changes not yet saved{previewFileCount ? ` (${previewFileCount} files)` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAccept}
              className="px-3 py-1 rounded-[6px] text-[11px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={handleDiscard}
              className="px-3 py-1 rounded-[6px] text-[11px] text-[var(--color-text-muted)] hover:bg-white/5 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      <div className={isPreview ? 'absolute left-0 right-0 bottom-0 top-[37px]' : 'absolute inset-0'}>
        <IframeAppView
          config={config}
          appId={appId}
          baseUrl={`/api/apps/local/${appId}`}
          isLocal
          preview={isPreview}
        />
      </div>
      {isProcessing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 mb-3 animate-spin text-[var(--color-accent)]" />
          <p className="text-sm text-white/80 font-medium">
            Construct is updating {app.manifest.name}...
          </p>
          <p className="text-xs text-white/40 mt-1">
            The app will refresh when changes are ready.
          </p>
        </div>
      )}
    </div>
  );
}

function LocalAppPanel({
  appId,
  app,
  config,
  onShowUi,
}: {
  appId: string;
  app: LocalApp;
  config: WindowConfig;
  onShowUi: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const manifest = app.manifest;
  const tools = manifest.tools.map((tool) => ({
    slug: tool.name,
    name: tool.name,
    description: tool.description,
  }));
  const uses = manifest.permissions?.uses;
  const managedTools = uses?.tools ?? [];
  const appCalls = uses?.apps ?? [];
  const networkHosts = manifest.permissions?.network ?? [];
  const windowSize = [
    `${manifest.window.width} x ${manifest.window.height}`,
    manifest.window.minWidth && manifest.window.minHeight
      ? `min ${manifest.window.minWidth} x ${manifest.window.minHeight}`
      : null,
  ].filter(Boolean).join(' · ');

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.deleteLocalApp(appId);
      if (res.success) {
        useAppStore.getState().fetchApps();
        useWindowStore.getState().closeWindow(config.id);
      } else {
        logger.warn('Failed to delete local app:', res.error);
        setConfirmDelete(false);
      }
    } catch (err) {
      logger.warn('Failed to delete local app:', err);
      setConfirmDelete(false);
    }
    setDeleting(false);
  };

  return (
    <AppShell>
      <AppHeroHeader
        icon={app.icon_url || manifest.icon}
        fallbackIcon={<Package className="w-7 h-7 opacity-40" />}
        name={manifest.name || appId}
        subtitle="Agent-created local app"
        description={manifest.description}
        status={{ label: 'Local', tone: 'blue' }}
        badges={[
          'Local App',
          'Has UI',
          ...(tools.length ? [`${tools.length} Tool${tools.length === 1 ? '' : 's'}`] : []),
          ...(uses?.inference ? ['Inference'] : []),
          ...(networkHosts.length ? ['Network'] : []),
        ]}
        primaryAction={
          <button
            onClick={onShowUi}
            className="px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity shadow-sm"
          >
            Open Interface
          </button>
        }
        actions={
          !confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete this app"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-red-400">Delete this app?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 rounded-[6px] text-[11px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-3 py-1 rounded-[6px] text-[11px] text-[var(--color-text-muted)] hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          )
        }
      />

      <InfoCard title="Details">
        <InfoRow icon={<Hash className="w-3 h-3" />} label="App ID" value={appId} mono copyable />
        <InfoRow icon={<Package className="w-3 h-3" />} label="UI" value={'renderer' in manifest.ui ? manifest.ui.renderer : manifest.ui.entry} mono />
        <InfoRow icon={<Wrench className="w-3 h-3" />} label="Window" value={windowSize} />
      </InfoCard>

      {(networkHosts.length > 0 || managedTools.length > 0 || appCalls.length > 0 || uses?.inference) && (
        <InfoCard title="Capabilities" subtitle="Resources this local app is allowed to use.">
          <div className="flex flex-wrap gap-1.5">
            {uses?.inference && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06]">
                Agent inference
              </span>
            )}
            {managedTools.map((name) => (
              <span key={`tool:${name}`} className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06]">
                tool:{name}
              </span>
            ))}
            {appCalls.flatMap((target) => target.tools.map((tool) => (
              <span key={`app:${target.app_id}:${tool}`} className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06]">
                {target.app_id}.{tool}
              </span>
            )))}
            {networkHosts.map((host) => (
              <span key={`network:${host}`} className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06]">
                {host}
              </span>
            ))}
          </div>
        </InfoCard>
      )}

      {tools.length > 0 ? (
        <ToolsList tools={tools} />
      ) : (
        <InfoCard title="Tools" subtitle="This app does not expose callable tools.">
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            It is available as a local UI app, but Construct has no app-specific actions to call from chat.
          </p>
        </InfoCard>
      )}
    </AppShell>
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
              <HeaderIconButton href={repoUrl} title="Source page">
                <ExternalLink className="w-3.5 h-3.5" />
              </HeaderIconButton>
            )}
            <HeaderIconButton
              onClick={async () => { setRefreshing(true); await api.refreshAppTools(appId); await refresh(); }}
              disabled={refreshing}
              title="Refresh actions"
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
            label="Added"
            value={formatDate(appData.installed_at)}
          />
        )}
      </InfoCard>

      {requiresAuth && (
        <InfoCard
          title="Authentication"
          subtitle={connectionStatus?.connected
            ? undefined
            : 'Connect an account to let this app run its actions.'}
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
        <InfoCard
          title="Connect this integration"
          subtitle="Choose how you'd like to sign in."
        >
          <ComposioAuthPanel slug={slug} onConnected={refresh} />
        </InfoCard>
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
          {authLabel && (
            <InfoRow icon={<Shield className="w-3 h-3" />} label="Sign-in type" value={authLabel} />
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
      return { ok: true, state: newState };
    }

    case 'state.patch': {
      if (!appId) throw new Error('No app context');
      const patch = params.patch as Record<string, unknown>;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('patch must be a JSON object');
      const patchRes = await api.patchLocalAppState(appId, patch);
      if (!patchRes.success) throw new Error(patchRes.error || 'Failed to patch state');
      return patchRes.data;
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
