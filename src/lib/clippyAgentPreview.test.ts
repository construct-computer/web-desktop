import { describe, expect, it } from 'vitest';
import { summarizeAgentTextPreview } from './clippyAgentPreview';

describe('summarizeAgentTextPreview', () => {
  it('returns first two lines with ellipsis when more content remains', () => {
    const preview = summarizeAgentTextPreview(
      "I'll open the workspace config first.\nThen I'll verify the export block.\n\nMore details here.",
    );
    expect(preview).toContain("I'll open the workspace config first.");
    expect(preview).toContain('verify the export block');
    expect(preview.endsWith('…')).toBe(true);
  });

  it('truncates long single-line text', () => {
    const preview = summarizeAgentTextPreview('x'.repeat(120));
    expect(preview.length).toBeLessThanOrEqual(90);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('returns short single-line text without ellipsis', () => {
    expect(summarizeAgentTextPreview('Done — moving on.')).toBe('Done — moving on.');
  });

  it('strips basic markdown', () => {
    const preview = summarizeAgentTextPreview('**Done** with the `config.yaml` file.');
    expect(preview).toBe('Done with the config.yaml file.');
  });
});
