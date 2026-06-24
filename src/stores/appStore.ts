/**
 * App Store — manages installed MCP apps, local apps, and connected Composio toolkits.
 */

import type React from 'react';
import { create } from 'zustand';
import * as api from '@/services/api';
import type { InstalledApp, LocalApp } from '@/services/api';
import type { AppDefinition } from '@/lib/appRegistry';
import { log } from '@/lib/logger';
import iconGeneric from '@/icons/generic.png';
import { getCachedToolkitDetail as getSharedCachedToolkitDetail } from '@/lib/composioToolkitCache';

/** Global registry of iframe refs for local apps — used for live reload. */
export const localAppIframeRefs = new Map<string, React.RefObject<HTMLIFrameElement | null>>();

export function localAppIframeRefKey(windowId: string, appId: string): string {
  return `${windowId}::${appId}`;
}

export function getLocalAppIframeRefs(appId: string): React.RefObject<HTMLIFrameElement | null>[] {
  const suffix = `::${appId}`;
  return [...localAppIframeRefs.entries()]
    .filter(([key]) => key.endsWith(suffix))
    .map(([, ref]) => ref);
}

export function reloadLocalAppIframes(appId: string): void {
  for (const ref of getLocalAppIframeRefs(appId)) {
    if (ref.current) ref.current.src = ref.current.src;
  }
}

export function postToLocalAppIframes(appId: string, message: unknown): void {
  for (const ref of getLocalAppIframeRefs(appId)) {
    ref.current?.contentWindow?.postMessage(message, '*');
  }
}

const logger = log('AppStore');
let fetchRunId = 0;

async function getCachedToolkitDetail(toolkit: string) {
  return getSharedCachedToolkitDetail(toolkit);
}

/** A connected Composio toolkit with optional detail metadata. */
export interface ConnectedToolkit {
  toolkit: string;
  accountId: string;
  name?: string;
  description?: string;
  logo?: string;
}

interface AppStoreState {
  /** MCP apps from installed_apps table. */
  installedApps: InstalledApp[];
  /** Local (agent-created) apps from R2 manifests. */
  localApps: LocalApp[];
  /** Connected Composio toolkits. */
  connectedToolkits: ConnectedToolkit[];
  /** Loading state. */
  loading: boolean;
  /** Last fetch error. */
  error: string | null;
  /** Whether we've fetched at least once. */
  fetched: boolean;

  /** Fetch all apps from the backend. */
  fetchApps: () => Promise<void>;
  /** Install an MCP app by ID. */
  installApp: (appId: string, opts?: { name?: string; description?: string; base_url?: string; icon_url?: string; has_ui?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  /** Uninstall an MCP app by ID. */
  uninstallApp: (appId: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  installedApps: [],
  localApps: [],
  connectedToolkits: [],
  loading: false,
  error: null,
  fetched: false,

  fetchApps: async () => {
    if (get().loading) return;

    const runId = ++fetchRunId;
    const stillCurrent = () => runId === fetchRunId;

    set({ loading: true, error: null });

    const appsPromise = api.listInstalledApps()
      .then((result) => {
        if (!stillCurrent()) return;
        const installedApps = result?.success && result.data ? result.data.apps : [];
        set({ installedApps });
      })
      .catch((err) => {
        logger.warn('Failed to fetch installed apps:', err);
        if (stillCurrent()) set({ installedApps: [] });
      });

    const localPromise = api.listLocalApps()
      .then((result) => {
        if (!stillCurrent()) return;
        const localApps = result?.success && result.data ? result.data.apps : [];
        set({ localApps });
      })
      .catch((err) => {
        logger.warn('Failed to fetch local apps:', err);
        if (stillCurrent()) set({ localApps: [] });
      });

    const composioPromise = api.getComposioConnected()
      .then(async (result) => {
        if (!stillCurrent()) return;
        const raw = result?.success && result.data?.connected
          ? result.data.connected.filter(t => t.toolkit)
          : [];
        const initialToolkits: ConnectedToolkit[] = raw.map((t) => ({ ...t, name: t.toolkit }));
        set({ connectedToolkits: initialToolkits });

        if (raw.length === 0) return;
        void Promise.all(raw.map(async (t) => {
          try {
            const detail = await getCachedToolkitDetail(t.toolkit);
            if (detail) {
              return {
                ...t,
                name: detail.name,
                description: detail.description,
                logo: detail.logo,
              };
            }
          } catch { /* ignore */ }
          return { ...t, name: t.toolkit };
        })).then((enriched) => {
          if (stillCurrent()) set({ connectedToolkits: enriched });
        });
      })
      .catch((err) => {
        logger.warn('Failed to fetch connected toolkits:', err);
        if (stillCurrent()) set({ connectedToolkits: [] });
      });

    try {
      await Promise.allSettled([appsPromise, localPromise, composioPromise]);
      if (stillCurrent()) set({ fetched: true });
    } catch (err) {
      logger.warn('Failed to fetch apps:', err);
      if (stillCurrent()) set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (stillCurrent()) set({ loading: false });
    }
  },

  installApp: async (appId: string, opts?) => {
    try {
      const result = await api.installApp(appId, opts);
      if (result.success) {
        await get().fetchApps();
        return { ok: true };
      }
      return { ok: false, error: result.error || 'Install failed' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },

  uninstallApp: async (appId: string) => {
    try {
      const result = await api.uninstallApp(appId);
      if (result.success) {
        await get().fetchApps();
        return { ok: true };
      }
      return { ok: false, error: result.error || 'Uninstall failed' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
}));

/** Convert installed MCP apps into AppDefinition format for the Launchpad. */
export function installedAppsToDefinitions(apps: InstalledApp[]): AppDefinition[] {
  return apps.map((app) => ({
    id: app.id,
    label: app.name,
    windowType: 'app' as const,
    icon: app.icon_url || iconGeneric,
    category: 'installed' as const,
    keywords: [app.description || ''].filter(Boolean),
    appMetadata: {
      appId: app.id,
      ...(app.has_ui && { ui: { type: 'static' as const, entry: 'index.html' } }),
    },
  }));
}

/** Convert local apps (from R2 manifests) into AppDefinition format for the Launchpad. */
export function localAppsToDefinitions(apps: LocalApp[]): AppDefinition[] {
  return apps.map((app) => ({
    id: app.id,
    label: app.manifest.name,
    windowType: 'app' as const,
    icon: app.icon_url || app.manifest.icon || iconGeneric,
    category: 'installed' as const,
    keywords: [app.manifest.description || ''].filter(Boolean),
    appMetadata: {
      appId: app.id,
      ui: {
        type: 'static' as const,
        entry: 'index.html',
      },
    },
  }));
}

/** Convert connected Composio toolkits into AppDefinition format for the Launchpad. */
export function composioToolkitsToDefinitions(toolkits: ConnectedToolkit[]): AppDefinition[] {
  return toolkits.map((t) => ({
    id: `composio-${t.toolkit}`,
    label: t.name || t.toolkit,
    windowType: 'app' as const,
    icon: t.logo || iconGeneric,
    category: 'installed' as const,
    keywords: [t.description || '', 'composio', 'integration', t.toolkit].filter(Boolean),
    appMetadata: {
      appId: `composio-${t.toolkit}`,
      composioSlug: t.toolkit,
    },
  }));
}
