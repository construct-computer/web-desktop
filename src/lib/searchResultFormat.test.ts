import { describe, expect, it } from 'vitest';
import { breadcrumbFromUrl, countryLabel, formatSearchDate } from './searchResultFormat';

describe('breadcrumbFromUrl', () => {
  it('shows host only for root paths', () => {
    const b = breadcrumbFromUrl('https://www.example.com/');
    expect(b.host).toBe('example.com');
    expect(b.display).toBe('example.com');
    expect(b.pathSegments).toEqual([]);
  });

  it('joins path segments with separators', () => {
    const b = breadcrumbFromUrl('https://docs.github.com/en/actions');
    expect(b.host).toBe('docs.github.com');
    expect(b.pathSegments).toEqual(['en', 'actions']);
    expect(b.display).toContain('docs.github.com');
    expect(b.display).toContain('›');
    expect(b.display).toContain('actions');
  });

  it('truncates very long breadcrumbs', () => {
    const b = breadcrumbFromUrl(
      'https://example.com/' + 'segment/'.repeat(20) + 'end',
    );
    expect(b.display.length).toBeLessThanOrEqual(61);
    expect(b.display.endsWith('…')).toBe(true);
  });
});

describe('formatSearchDate', () => {
  it('formats ISO dates', () => {
    const formatted = formatSearchDate('2024-03-15T12:00:00Z');
    expect(formatted).toMatch(/Mar/);
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/2024/);
  });

  it('returns null for empty input', () => {
    expect(formatSearchDate('')).toBeNull();
    expect(formatSearchDate(undefined)).toBeNull();
  });

  it('falls back to raw string when unparseable', () => {
    expect(formatSearchDate('Yesterday')).toBe('Yesterday');
  });
});

describe('countryLabel', () => {
  it('resolves region codes', () => {
    const label = countryLabel('us');
    expect(label).toBeTruthy();
    expect(label!.toLowerCase()).toMatch(/united states|us/i);
  });
});
