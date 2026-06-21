import { describe, expect, it } from 'vitest';
import { formatSearchError, queryHasBooleanSyntax } from './jinaSearchErrors';

const RAW_422 = 'web_search failed (422): {"data":null,"code":422,"name":"AssertionFailureError","status":42206,"message":"No search results available for query Perplexity Comet OR \\"Perplexity Personal Computer\\" pricing"}';

describe('formatSearchError', () => {
  it('parses embedded 422 JSON as no_results', () => {
    const f = formatSearchError(RAW_422);
    expect(f.kind).toBe('no_results');
    expect(f.body).toMatch(/Perplexity Comet/);
    expect(f.hints.length).toBeGreaterThanOrEqual(2);
  });

  it('rate limit kind', () => {
    const f = formatSearchError('Search rate limit reached. Wait a moment and retry.');
    expect(f.kind).toBe('rate_limit');
  });

  it('never returns raw JSON as body', () => {
    const f = formatSearchError(RAW_422);
    expect(f.body.startsWith('{')).toBe(false);
  });
});

describe('queryHasBooleanSyntax', () => {
  it('detects OR and quotes', () => {
    expect(queryHasBooleanSyntax('foo OR "bar"')).toBe(true);
    expect(queryHasBooleanSyntax('plain query')).toBe(false);
  });
});
