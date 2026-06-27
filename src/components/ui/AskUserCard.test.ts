import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AskUserCard.tsx', import.meta.url), 'utf8');

describe('AskUserCard contracts', () => {
  it('renders permission approvals before external-session read-only fallback', () => {
    const permissionIndex = source.indexOf('if (data.permission)');
    const externalIndex = source.indexOf('if (externalPlatform && !isAnswered)');
    expect(permissionIndex).toBeGreaterThan(0);
    expect(externalIndex).toBeGreaterThan(permissionIndex);
  });
});
