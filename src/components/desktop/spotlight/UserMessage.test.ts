import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./UserMessage.tsx', import.meta.url), 'utf8');

describe('UserMessage external platform rendering', () => {
  it('parses Discord bracket-prefixed messages as external cards', () => {
    expect(source).toMatch(/source: 'telegram' \| 'slack' \| 'email' \| 'discord'/);
    expect(source).toMatch(/msg\.source === 'telegram' \|\| msg\.source === 'slack' \|\| msg\.source === 'email' \|\| msg\.source === 'discord'/);
    expect(source).toMatch(/platformAppIcon\(externalPlatform\)/);
  });
});
