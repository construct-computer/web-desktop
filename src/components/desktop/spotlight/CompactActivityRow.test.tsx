import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompactActivityRow } from './CompactActivityRow';

describe('CompactActivityRow surface', () => {
  it('uses spotlight frame styling when clippy is false', () => {
    const html = renderToStaticMarkup(
      <CompactActivityRow
        content="Reading uploads/example.txt"
        activityType="file"
        tool="read_file"
      />,
    );

    expect(html).not.toContain('bg-white/10');
  });

  it('uses clippy frame styling when clippy is true', () => {
    const html = renderToStaticMarkup(
      <CompactActivityRow
        content="Reading uploads/example.txt"
        activityType="file"
        tool="read_file"
        clippy
      />,
    );

    expect(html).toContain('bg-white/10');
  });
});
