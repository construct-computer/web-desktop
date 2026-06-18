import { describe, expect, it } from 'vitest';
import { iconAppStore, iconSysinfo } from '@/icons';
import {
  mcpAppFallbackIcon,
  mcpIntegrationFallbackIcon,
  resolveActivityIconHints,
  resolveActivityVisual,
} from './toolActivityIcon';

describe('MCP icon fallbacks', () => {
  it('returns app-store icon for MCP app fallback helper', () => {
    expect(mcpAppFallbackIcon()).toBe(iconAppStore);
  });

  it('returns sysinfo icon for generic integration fallback helper', () => {
    expect(mcpIntegrationFallbackIcon()).toBe(iconSysinfo);
  });

  it('uses app-store icon for app tool without explicit icon', () => {
    const visual = resolveActivityVisual({ tool: 'app', label: 'Listing apps' });
    expect(visual.kind).toBe('image');
    if (visual.kind === 'image') {
      expect(visual.src).toBe(iconAppStore);
    }
  });

  it('uses sysinfo icon hints for discover tool without explicit icon', () => {
    const hints = resolveActivityIconHints('discover', { action: 'search', query: 'polar' });
    expect(hints.iconUrl).toBe(iconSysinfo);
  });
});
