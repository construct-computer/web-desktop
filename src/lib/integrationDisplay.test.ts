import { describe, expect, it } from 'vitest';
import { MCP_APP_FALLBACK_ICON, resolveInstalledAppDisplay } from './integrationDisplay';

describe('resolveInstalledAppDisplay', () => {
  it('uses branded fallback for url-* ids not in the store', () => {
    const resolved = resolveInstalledAppDisplay('url-b79c4cf9ce7957eb');
    expect(resolved.displayName).toBe('MCP Server');
    expect(resolved.iconUrl).toBe(MCP_APP_FALLBACK_ICON);
    expect(resolved.canonicalId).toBe('url-b79c4cf9ce7957eb');
  });
});
