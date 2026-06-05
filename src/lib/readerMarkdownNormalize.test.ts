import { describe, expect, it } from 'vitest';
import {
  normalizeReaderMarkdown,
  readerMarkdownSnippet,
  splitReaderPreviewAtSections,
} from './readerMarkdownNormalize';
import bbcArticle from './__fixtures__/jina-bbc-article.md?raw';
import reactLearn from './__fixtures__/jina-react-learn.md?raw';
import githubNextjs from './__fixtures__/jina-github-nextjs.md?raw';

describe('normalizeReaderMarkdown', () => {
  it('strips BBC article nav chrome and finds body copy', () => {
    const { content, strippedLineCount } = normalizeReaderMarkdown(bbcArticle, {
      pageTitle: 'Zelensky proposes face-to-face talks in open letter to Putin',
    });
    expect(strippedLineCount).toBeGreaterThan(10);
    expect(content).not.toMatch(/skip to content/i);
    expect(content).not.toMatch(/^Site search$/m);
    expect(content).toMatch(/Volodymyr Zelensky has called for a face-to-face meeting/i);
    expect(content).not.toMatch(/\[Watch Live\]/i);
  });

  it('dedupes title when h1 matches pageTitle', () => {
    const { dedupeTitle } = normalizeReaderMarkdown(bbcArticle, {
      pageTitle: 'Zelensky proposes face-to-face talks in open letter to Putin',
    });
    expect(dedupeTitle).toBe(true);
  });

  it('removes react.dev heading permalink suffixes', () => {
    const { content } = normalizeReaderMarkdown(reactLearn, { pageTitle: 'Quick Start – React' });
    expect(content).toMatch(/## Creating and nesting components/);
    expect(content).not.toMatch(/Link for Creating/i);
  });

  it('repairs Image N caption lines', () => {
    const { content } = normalizeReaderMarkdown(bbcArticle);
    expect(content).toMatch(/\*Danylo Antoniuk \/ Anadolu via Getty Images\*/);
    expect(content).not.toMatch(/!\[Image 1:/);
  });

  it('strips leading GitHub megamenu', () => {
    const { content, strippedLineCount } = normalizeReaderMarkdown(githubNextjs, {
      pageTitle: 'GitHub - vercel/next.js: The React Framework',
    });
    expect(strippedLineCount).toBeGreaterThan(5);
    expect(content).toMatch(/vercel\/next\.js|Folders and files/i);
    expect(content).not.toMatch(/Toggle navigation/i);
  });

  it('strips truncation footer markers', () => {
    const body = 'Volodymyr Zelensky has called for a face-to-face meeting with Vladimir Putin to end the war in Ukraine.';
    const raw = `# Headline\n\n${body}\n\n[content truncated for preview]`;
    const { content } = normalizeReaderMarkdown(raw, { pageTitle: 'Headline' });
    expect(content).toContain(body);
    expect(content).not.toMatch(/truncated/i);
  });

  it('splitReaderPreviewAtSections cuts at heading boundaries', () => {
    const full = [
      '# Title',
      '',
      'First section paragraph with enough content to be meaningful.',
      '',
      '## Section Two',
      '',
      'Second section should not appear in preview when budget is tight.',
      '',
      '## Section Three',
      '',
      'Third section content.',
    ].join('\n');
    const split = splitReaderPreviewAtSections(full, 120);
    expect(split.hasMore).toBe(true);
    expect(split.preview).toContain('First section');
    expect(split.preview).not.toContain('Section Three');
    expect(split.preview).not.toMatch(/Second section should not/);
    expect(split.remainingSectionCount).toBeGreaterThan(0);
  });

  it('splitReaderPreviewAtSections has no read more for short content', () => {
    const full = '# Short\n\nOne paragraph only.';
    const split = splitReaderPreviewAtSections(full);
    expect(split.hasMore).toBe(false);
    expect(split.preview).toBe(full);
  });

  it('splitReaderPreviewAtSections truncates a single long block without headings', () => {
    const body = 'Word '.repeat(2500).trim();
    const full = `# Long article\n\n${body}`;
    const split = splitReaderPreviewAtSections(full, 500);
    expect(split.hasMore).toBe(true);
    expect(split.preview.length).toBeLessThan(full.length);
    expect(split.preview).toContain('Long article');
  });

  it('readerMarkdownSnippet returns prose not nav links', () => {
    const snippet = readerMarkdownSnippet(bbcArticle, {
      pageTitle: 'Zelensky proposes face-to-face talks in open letter to Putin',
    });
    expect(snippet.length).toBeGreaterThan(20);
    expect(snippet).not.toMatch(/\[Home\]/);
    expect(snippet).toMatch(/Zelensky|Putin|Ukraine/i);
  });
});
