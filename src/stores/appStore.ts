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

/** Global registry of iframe refs for local apps — used for live reload. */
export const localAppIframeRefs = new Map<string, React.RefObject<HTMLIFrameElement | null>>();

const logger = log('AppStore');

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

    set({ loading: true, error: null });
    try {
      // Fetch MCP apps, local apps, and Composio toolkits in parallel
      const [appsResult, localResult, composioResult] = await Promise.all([
        api.listInstalledApps().catch(() => null),
        api.listLocalApps().catch(() => null),
        api.getComposioConnected().catch(() => null),
      ]);

      const installedApps = appsResult?.success && appsResult.data
        ? appsResult.data.apps
        : [];

      const localApps = localResult?.success && localResult.data
        ? localResult.data.apps
        : [];

      // Enrich connected toolkits with detail metadata (name, logo)
      let connectedToolkits: ConnectedToolkit[] = [];
      if (composioResult?.success && composioResult.data?.connected) {
        const raw = composioResult.data.connected.filter(t => t.toolkit);
        const enriched = await Promise.all(
          raw.map(async (t) => {
            try {
              const detail = await api.getComposioToolkitDetail(t.toolkit);
              if (detail.success && detail.data) {
                return {
                  ...t,
                  name: detail.data.name,
                  description: detail.data.description,
                  logo: detail.data.logo,
                };
              }
            } catch { /* ignore */ }
            return { ...t, name: t.toolkit };
          }),
        );
        connectedToolkits = enriched;
      }

      set({ installedApps, localApps, connectedToolkits, fetched: true });
    } catch (err) {
      logger.warn('Failed to fetch apps:', err);
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loading: false });
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
        ...(app.manifest.window?.width && { width: app.manifest.window.width }),
        ...(app.manifest.window?.height && { height: app.manifest.window.height }),
        ...(app.manifest.window?.minWidth && { minWidth: app.manifest.window.minWidth }),
        ...(app.manifest.window?.minHeight && { minHeight: app.manifest.window.minHeight }),
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
