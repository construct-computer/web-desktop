import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeBrowserUrl,
  useBrowserTabStore,
} from './browserTabStore';

describe('normalizeBrowserUrl', () => {
  it('adds https and normalizes host paths', () => {
    expect(normalizeBrowserUrl('pokemon.com')).toBe('https://pokemon.com/');
    expect(normalizeBrowserUrl('https://ebay.com/items')).toBe('https://ebay.com/items');
    expect(normalizeBrowserUrl('https://ebay.com/items/')).toBe('https://ebay.com/items');
  });

  it('treats scheme-less and https URLs as the same host', () => {
    expect(normalizeBrowserUrl('pokemon.com')).toBe(normalizeBrowserUrl('https://pokemon.com'));
  });
});

describe('openOrFocusUrlTab', () => {
  beforeEach(() => {
    useBrowserTabStore.getState().reset();
  });

  it('creates a web_fetch tab with url and proxyUrl', () => {
    const tabId = useBrowserTabStore.getState().openOrFocusUrlTab('https://pokemon.com');
    const store = useBrowserTabStore.getState();
    expect(store.tabs).toHaveLength(1);
    expect(store.activeTabId).toBe(tabId);
    expect(store.tabs[0].mode).toBe('fetch');
    expect(store.tabs[0].tool).toBe('web_fetch');
    expect(store.tabs[0].url).toBe('https://pokemon.com/');
    expect(store.tabs[0].proxyUrl).toContain(encodeURIComponent('https://pokemon.com/'));
  });

  it('focuses existing tab instead of duplicating', () => {
    const first = useBrowserTabStore.getState().openOrFocusUrlTab('https://pokemon.com');
    const second = useBrowserTabStore.getState().openOrFocusUrlTab('pokemon.com/');
    const store = useBrowserTabStore.getState();
    expect(store.tabs).toHaveLength(1);
    expect(second).toBe(first);
    expect(store.activeTabId).toBe(first);
  });
});
