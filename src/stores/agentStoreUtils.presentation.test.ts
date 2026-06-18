import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/integrationDisplay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrationDisplay')>();
  return {
    ...actual,
    formatIntegrationActivity: vi.fn(({ tool, params }: { tool: string; params?: Record<string, unknown> }) => {
      if (tool === 'app' && params?.action === 'call') {
        return {
          label: 'Polar · List Deployments',
          displayTool: 'Polar',
          iconPlatform: 'url-abc',
          iconUrl: 'https://example.com/icon.png',
        };
      }
      return { label: tool, displayTool: tool };
    }),
  };
});

vi.mock('@/lib/toolActivityIcon', () => ({
  resolveActivityIconHints: vi.fn(() => ({ iconPlatform: 'fallback' })),
}));

import { resolveToolActivityPresentation } from './agentStoreUtils';

describe('resolveToolActivityPresentation', () => {
  it('delegates integration app.call labels and icons', () => {
    const out = resolveToolActivityPresentation('app', {
      action: 'call',
      app_id: 'url-abc',
      tool_name: 'list_deployments',
    });
    expect(out.text).toMatch(/Polar|list/i);
    expect(out.displayTool).toBe('Polar');
    expect(out.iconPlatform).toBe('url-abc');
    expect(out.iconUrl).toBe('https://example.com/icon.png');
  });

  it('uses composio display tool for composio calls', () => {
    const out = resolveToolActivityPresentation('composio', {
      action: 'execute',
      tool_slug: 'NOTION_CREATE_PAGE',
    });
    expect(out.displayTool).toBe('notion');
    expect(out.text).toMatch(/Notion/i);
  });
});
