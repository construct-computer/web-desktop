import { describe, expect, it } from 'vitest';
import { composioIconUrl, peekToolkitDetail, seedToolkitCache } from './composioToolkitCache';

describe('composioToolkitCache', () => {
  it('builds composio icon URLs with optional logo override', () => {
    expect(composioIconUrl('agentmail')).toBe('https://logos.composio.dev/api/agentmail');
    expect(composioIconUrl('agentmail', 'https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png');
  });

  it('peeks seeded toolkit cache entries', () => {
    seedToolkitCache({ agentmail: { name: 'Agent Mail', logo: 'https://cdn.example/logo.png' } });
    expect(peekToolkitDetail('agentmail')?.name).toBe('Agent Mail');
  });
});
