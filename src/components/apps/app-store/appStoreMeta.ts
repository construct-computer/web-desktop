import type { UnifiedApp } from '@/hooks/useAppDiscovery';

export type StatusTone = 'connected' | 'added' | 'local' | 'available' | 'upgrade' | 'unavailable';

export function formatToolCount(count: number): string {
  if (count <= 0) return '';
  return `${count} action${count === 1 ? '' : 's'}`;
}

export function formatInstallCount(count?: number): string {
  if (count == null || count <= 0) return '';
  if (count === 1) return '1 install';
  return `${count} installs`;
}

export function sourceLabel(app: UnifiedApp): string {
  if (app.source === 'local') return 'Local';
  if (app.source === 'composio') return 'Integration';
  if (app.tags?.includes('from-url')) return 'MCP';
  if (app.source === 'installed') return 'MCP';
  if (app.source === 'registry') return 'Construct';
  return 'App';
}

export function sourceBadgeLabel(app: UnifiedApp): string {
  if (app.source === 'registry') return 'Construct App';
  if (app.source === 'composio') return 'Integration';
  if (app.source === 'local') return 'Local App';
  if (app.tags?.includes('from-url')) return 'Custom MCP';
  if (app.source === 'installed') return 'MCP App';
  return 'App';
}

export function buildCardMetaLine(app: UnifiedApp): string {
  const parts: string[] = [];
  const toolCount = app.toolCount ?? app.tools?.length ?? 0;
  if (toolCount > 0) parts.push(formatToolCount(toolCount));
  const installs = app.popularity ?? app.registryApp?.install_count;
  if (installs != null && installs > 0) parts.push(formatInstallCount(installs));
  return parts.join(' · ');
}

export function statusInfo(app: UnifiedApp): { label: string; tone: StatusTone } {
  const isInstalled = app.status !== 'available';
  const isComposio = app.source === 'composio';

  if (isComposio && app.connectable === false) {
    return { label: 'Unavailable', tone: 'unavailable' };
  }

  if (isInstalled) {
    if (app.source === 'local') return { label: 'Local', tone: 'local' };
    if (isComposio) return { label: 'Connected', tone: 'connected' };
    return { label: 'Added', tone: 'added' };
  }
  return { label: 'Available', tone: 'available' };
}

export const STATUS_PILL_CLASS: Record<StatusTone, string> = {
  connected: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  added: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  local: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  available: 'text-[var(--color-text-muted)] bg-black/[0.04] dark:bg-white/[0.06]',
  upgrade: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  unavailable: 'text-[var(--color-text-muted)] bg-black/[0.04] dark:bg-white/[0.06]',
};

export function buildMetaLine(app: UnifiedApp): string {
  const parts: string[] = [sourceLabel(app)];
  const toolCount = app.toolCount ?? app.tools?.length ?? 0;
  if (toolCount > 0) parts.push(formatToolCount(toolCount));
  const installs = app.popularity ?? app.registryApp?.install_count;
  if (installs != null && installs > 0) parts.push(formatInstallCount(installs));
  return parts.join(' · ');
}
