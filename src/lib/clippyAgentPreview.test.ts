import { describe, expect, it } from 'vitest';
import { summarizeAgentTextPreview } from './clippyAgentPreview';

describe('summarizeAgentTextPreview', () => {
  it('returns first sentence with ellipsis when more content remains', () => {
    const preview = summarizeAgentTextPreview(
      "I'll open the workspace config first.\nThen I'll verify the export block.\n\nMore details here.",
    );
    expect(preview).toContain("I'll open the workspace config first.");
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

  it('summarizes markdown lists as first sentence', () => {
    const preview = summarizeAgentTextPreview(
      'Scheduled task completed successfully.\n- Read signups_state.json\n- Send welcome email',
    );
    expect(preview).toContain('Scheduled task completed successfully.');
    expect(preview).not.toMatch(/^- Read/);
  });

  it('strips leaked CLIPPY prefix from preview source', () => {
    const preview = summarizeAgentTextPreview('CLIPPY: Checking calendar\n\nDone with the check.');
    expect(preview).toBe('Done with the check.');
  });
});
