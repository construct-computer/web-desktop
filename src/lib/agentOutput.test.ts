import { describe, expect, it } from 'vitest';
import { isCachedToolResultPlaceholder } from './agentOutput';

describe('agentOutput helpers', () => {
  it('detects cached overflow placeholders', () => {
    expect(isCachedToolResultPlaceholder('[Result stored in workspace — 50,000 chars. Use read_agent_output with id="call_1" to retrieve.]')).toBe(true);
    expect(isCachedToolResultPlaceholder('plain output')).toBe(false);
  });
});
