import { describe, expect, it } from 'vitest';
import {
  SIGNUPS_JINA_FIXTURE,
  detectStructuredContent,
  extractJsonCandidate,
  isArticleLike,
} from './structuredData';

describe('structuredData', () => {
  it('detects signups.construct.computer JSON via Jina wrapper', () => {
    const result = detectStructuredContent(SIGNUPS_JINA_FIXTURE, 'https://signups.construct.computer/');
    expect(result.format).toBe('json');
    expect(result.summary).toContain('5 key');
    expect(result.parsed).toMatchObject({ ok: true, service: 'construct-computer demo signups' });
  });

  it('detects raw JSON body', () => {
    const raw = '{"ok":true,"items":[1,2]}';
    const result = detectStructuredContent(raw);
    expect(result.format).toBe('json');
    expect(result.raw).toContain('"ok": true');
  });

  it('rejects markdown articles with embedded json code blocks', () => {
    const article = `# API Guide

Here is an example response:

\`\`\`json
{"ok": true}
\`\`\`

And more prose about how to use the API in production environments with retries.
`;
    expect(detectStructuredContent(article).format).toBeNull();
  });

  it('rejects jina reader output with prose after json', () => {
    const mixed = `Title: Example

URL Source: https://example.com/

Markdown Content:
{"ok":true}

This article explains the response in detail with many paragraphs.`;
    expect(detectStructuredContent(mixed).format).toBeNull();
  });

  it('extracts json from markdown fence', () => {
    const fenced = '```json\n{"a":1}\n```';
    expect(extractJsonCandidate(fenced)).toBe('{"a":1}');
  });

  it('flags article-like markdown', () => {
    const article = `# Title\n\n${'word '.repeat(40)}\n\n[link](https://a.com) [b](https://b.com) [c](https://c.com)`;
    expect(isArticleLike(article)).toBe(true);
  });
});
