/**
 * Shared labels and icons for integration tool activity (app, discover, execute, capability).
 */

import type { InstalledApp } from '@/services/api';
import { iconAppStore } from '@/icons';
import { useAppStore } from '@/stores/appStore';
import { useDevAppStore } from '@/stores/devAppStore';
import { routeToolToWindow } from '@/lib/toolWindowRouting';
import { formatComposioSlug } from '@/lib/composioDisplay';

/** Branded fallback when an installed MCP app has no stored icon. */
export const MCP_APP_FALLBACK_ICON = iconAppStore;

export type ToolCallDisplayMetadata = {
  appDisplayName?: string;
  appId?: string;
  iconUrl?: string;
  toolName?: string;
};

export type IntegrationActivityTool = 'app' | 'discover' | 'execute' | 'capability' | 'composio';

export type IntegrationActivityInput = {
  tool: IntegrationActivityTool;
  params?: Record<string, unknown>;
};

export type IntegrationActivityFormat = {
  label: string;
  iconUrl?: string;
  iconPlatform?: string;
  displayTool?: string;
};

export function humanizeMcpToolSlug(slug: string, appNamePrefix?: string): string {
  let s = slug.trim();
  if (appNamePrefix) {
    const normPrefix = appNamePrefix.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const normSlug = s.toLowerCase();
    if (normSlug.startsWith(`${normPrefix}_`)) {
      s = s.slice(normPrefix.length + 1);
    }
  }
  const words = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return slug;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function humanizeCapabilityName(name: string): string {
  const dot = name.indexOf('.');
  const ns = dot > 0 ? name.slice(0, dot) : name;
  const action = dot > 0 ? name.slice(dot + 1) : '';
  const nsLabel = ns.charAt(0).toUpperCase() + ns.slice(1).replace(/_/g, ' ');
  const actionLabel = action.replace(/_/g, ' ').replace(/\./g, ' ');
  return action ? `${nsLabel} · ${actionLabel}` : nsLabel;
}

import { faviconUrlForHost as faviconForHost } from '@/lib/favicon';

/** @deprecated Prefer `@/lib/favicon` — kept for existing app-registry imports. */
export function faviconUrlForHost(host: string): string {
  return faviconForHost(host);
}

function hostnameFromBaseUrl(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function findInstalledApp(appId: string, installedApps: InstalledApp[]): InstalledApp | undefined {
  const exact = installedApps.find((a) => a.id === appId);
  if (exact) return exact;
  const q = appId.trim().toLowerCase();
  return installedApps.find((a) => {
    if (a.name.toLowerCase() === q) return true;
    try {
      return new URL(a.base_url).hostname.toLowerCase() === q;
    } catch {
      return false;
    }
  });
}

export function resolveInstalledAppDisplay(appId: string): {
  displayName: string;
  iconUrl?: string;
  canonicalId: string;
  isDev?: boolean;
  isLocal?: boolean;
} {
  const { installedApps, localApps } = useAppStore.getState();
  const devState = useDevAppStore.getState();

  if (appId === 'dev-app' && devState.status === 'connected' && devState.appInfo) {
    return {
      displayName: devState.appInfo.name,
      iconUrl: devState.appInfo.iconUrl || undefined,
      canonicalId: 'dev-app',
      isDev: true,
    };
  }

  const local = localApps.find((a) => a.id === appId);
  if (local) {
    return {
      displayName: local.manifest?.name || local.name || appId,
      canonicalId: appId,
      isLocal: true,
    };
  }

  const installed = findInstalledApp(appId, installedApps);
  if (installed) {
    const hostLabel = hostnameFromBaseUrl(installed.base_url);
    const displayName = installed.name || hostLabel || appId;
    return {
      displayName,
      iconUrl: installed.icon_url || MCP_APP_FALLBACK_ICON,
      canonicalId: installed.id,
    };
  }

  if (appId.startsWith('url-')) {
    return {
      displayName: 'MCP Server',
      iconUrl: MCP_APP_FALLBACK_ICON,
      canonicalId: appId,
    };
  }

  if (appId.includes('.')) {
    return {
      displayName: appId.split('/')[0],
      iconUrl: MCP_APP_FALLBACK_ICON,
      canonicalId: appId,
    };
  }

  return {
    displayName: appId,
    iconUrl: MCP_APP_FALLBACK_ICON,
    canonicalId: appId,
  };
}

export function humanizeMcpToolLabel(
  toolName: string,
  opts?: { description?: string; appId?: string; appName?: string },
): string {
  if (opts?.description) {
    const first = opts.description.split(/[.!?]/)[0]?.trim();
    if (first && first.length > 0 && first.length <= 72) return first;
  }
  const prefix = opts?.appName?.split(/\s+/)[0];
  return humanizeMcpToolSlug(toolName, prefix);
}

export function mapInstalledAppToolsToDisplay(
  tools: Array<{ name: string; description?: string }>,
  appName?: string,
): Array<{ slug: string; name: string; description?: string }> {
  return tools.map((t) => ({
    slug: t.name,
    name: humanizeMcpToolLabel(t.name, { description: t.description, appName }),
    description: t.description,
  }));
}

type ToolRef = {
  provider?: string;
  appId?: string;
  tool?: string;
  slug?: string;
  name?: string;
  toolkit?: string;
};

function parseExecuteRef(row: unknown): ToolRef | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  const ref = (o.ref && typeof o.ref === 'object' ? o.ref : o) as ToolRef;
  if (ref.provider === 'mcp' && ref.appId && ref.tool) return ref;
  if (ref.provider === 'capability' && ref.name) return ref;
  if (ref.provider === 'composio' && ref.slug) return ref;
  if (typeof o.tool_slug === 'string') return { provider: 'composio', slug: o.tool_slug };
  return null;
}

function formatExecuteCallLabel(ref: ToolRef): IntegrationActivityFormat {
  if (ref.provider === 'mcp' && ref.appId && ref.tool) {
    const app = resolveInstalledAppDisplay(ref.appId);
    const installed = useAppStore.getState().installedApps.find((a) => a.id === app.canonicalId);
    const toolMeta = installed?.tools.find((t) => t.name === ref.tool);
    const toolLabel = humanizeMcpToolLabel(ref.tool, {
      description: toolMeta?.description,
      appId: app.canonicalId,
      appName: app.displayName,
    });
    return {
      label: `${app.displayName} · ${toolLabel}`,
      iconUrl: app.iconUrl,
      iconPlatform: app.canonicalId,
      displayTool: app.displayName,
    };
  }
  if (ref.provider === 'capability' && ref.name) {
    const label = humanizeCapabilityName(ref.name);
    const route = routeToolToWindow('capability', { name: ref.name });
    return {
      label,
      iconPlatform: route?.type,
      displayTool: label.split(' · ')[0],
    };
  }
  if (ref.provider === 'composio' && ref.slug) {
    const label = formatComposioSlug(ref.slug);
    const toolkit = ref.toolkit || ref.slug.split('_')[0]?.toLowerCase();
    const logo = useAppStore.getState().connectedToolkits.find(
      (t) => t.toolkit.toLowerCase() === toolkit?.toLowerCase(),
    )?.logo;
    return { label, iconUrl: logo, iconPlatform: toolkit, displayTool: toolkit };
  }
  return { label: 'Execute integration' };
}

export function formatIntegrationActivity(
  input: IntegrationActivityInput,
  metadata?: ToolCallDisplayMetadata,
): IntegrationActivityFormat {
  const p = input.params || {};

  if (input.tool === 'app') {
    const action = p.action as string | undefined;
    const appId = (metadata?.appId as string) || (p.app_id as string) || undefined;
    const toolName = (metadata?.toolName as string) || (p.tool_name as string) || undefined;
    if (action === 'call' && appId) {
      if (metadata?.appDisplayName) {
        const toolLabel = toolName
          ? humanizeMcpToolLabel(toolName, { appId, appName: metadata.appDisplayName })
          : 'action';
        return {
          label: `${metadata.appDisplayName} · ${toolLabel}`,
          iconUrl: metadata.iconUrl || MCP_APP_FALLBACK_ICON,
          iconPlatform: appId,
          displayTool: metadata.appDisplayName,
        };
      }
      const app = resolveInstalledAppDisplay(appId);
      const installed = useAppStore.getState().installedApps.find((a) => a.id === app.canonicalId);
      const toolMeta = toolName ? installed?.tools.find((t) => t.name === toolName) : undefined;
      const toolLabel = toolName
        ? humanizeMcpToolLabel(toolName, { description: toolMeta?.description, appId: app.canonicalId, appName: app.displayName })
        : 'action';
      return {
        label: `${app.displayName} · ${toolLabel}`,
        iconUrl: app.iconUrl,
        iconPlatform: app.canonicalId,
        displayTool: app.displayName,
      };
    }
    if (action === 'search') {
      const query = (p.query as string) || '…';
      return { label: `Searching installed apps: ${query}`, displayTool: 'app' };
    }
    if (action === 'list') return { label: 'Listing apps', displayTool: 'app' };
  }

  if (input.tool === 'discover') {
    const action = p.action as string | undefined;
    if (action === 'schemas') return { label: 'Loading tool schemas', displayTool: 'discover' };
    const queries = Array.isArray(p.queries) ? p.queries : [];
    const useCase = (queries[0] as { use_case?: string })?.use_case || (p.query as string) || 'integrations';
    return { label: `Finding tools: ${useCase}`, displayTool: 'discover' };
  }

  if (input.tool === 'execute') {
    const calls = Array.isArray(p.calls) ? p.calls : [];
    if (calls.length === 1) {
      const ref = parseExecuteRef(calls[0]);
      if (ref) return formatExecuteCallLabel(ref);
    }
    if (calls.length > 1) {
      const ref = parseExecuteRef(calls[0]);
      if (ref) {
        const first = formatExecuteCallLabel(ref);
        return { ...first, label: `${first.label} (+${calls.length - 1} more)` };
      }
    }
    if (typeof p.tool_slug === 'string') {
      return formatExecuteCallLabel({ provider: 'composio', slug: p.tool_slug });
    }
    return { label: 'Executing integration', displayTool: 'execute' };
  }

  if (input.tool === 'capability') {
    const action = p.action as string | undefined;
    const name = (p.name as string) || (p.capability as string);
    if (action === 'call' && name) {
      const label = humanizeCapabilityName(name);
      const route = routeToolToWindow('capability', { name });
      return { label, iconPlatform: route?.type, displayTool: label.split(' · ')[0] };
    }
    if (action === 'search') {
      return { label: `Finding capabilities: ${(p.query as string) || '…'}`, displayTool: 'capability' };
    }
  }

  if (input.tool === 'composio') {
    const slug = p.tool_slug as string | undefined;
    if (slug) {
      const formatted = formatExecuteCallLabel({ provider: 'composio', slug });
      return formatted;
    }
  }

  return { label: input.tool };
}

export function integrationActivityIconHints(
  tool: string,
  params?: Record<string, unknown>,
): { iconPlatform?: string; iconUrl?: string } {
  const normalized = tool.toLowerCase();
  if (['app', 'discover', 'execute', 'capability'].includes(normalized)) {
    const fmt = formatIntegrationActivity({
      tool: normalized as IntegrationActivityTool,
      params,
    });
    return { iconPlatform: fmt.iconPlatform, iconUrl: fmt.iconUrl };
  }
  return {};
}
