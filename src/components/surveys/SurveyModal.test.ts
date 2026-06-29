import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./SurveyModal.tsx', import.meta.url), 'utf8');

describe('SurveyModal contracts', () => {
  it('does not minimize the desktop when the survey appears', () => {
    expect(source).not.toContain('minimizeAll');
  });

  it('clears unrevealed surveys locally instead of dismissing them', () => {
    expect(source).toContain('if (!hasShown) {\n      clear();\n      return;\n    }');
  });

  it('makes the founder call explicit in the completion state', () => {
    expect(source).toContain('Book a 15-minute call with the founders');
    expect(source).toContain('Talk directly with the Construct founders');
  });
});
