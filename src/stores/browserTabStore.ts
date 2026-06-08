/**
 * Emulated browser tabs for web_search, web_fetch, research tools, and live sessions.
 */

import { create } from 'zustand';
import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';
import { normalizeReaderMarkdown, splitReaderPreviewAtSections } from '@/lib/readerMarkdownNormalize';
import { detectStructuredContent } from '@/lib/structuredData';

const MAX_DISMISSED_TABS = 300;

function loadDismissedTabIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.browserDismissedTabs);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedTabIds(ids: Set<string>): void {
  try {
    const trimmed = [...ids].slice(-MAX_DISMISSED_TABS);
    localStorage.setItem(STORAGE_KEYS.browserDismissedTabs, JSON.stringify(trimmed));
  } catch { /* */ }
}

function persistDismissedTabId(tabId: string): Set<string> {
  const ids = loadDismissedTabIds();
  ids.add(tabId);
  saveDismissedTabIds(ids);
  return ids;
}

function persistUndismissedTabId(tabId: string): Set<string> {
  const ids = loadDismissedTabIds();
  ids.delete(tabId);
  saveDismissedTabIds(ids);
  return ids;
}

function persistDismissedTabIds(tabIds: Iterable<string>): Set<string> {
  const ids = loadDismissedTabIds();
  for (const tabId of tabIds) ids.add(tabId);
  saveDismissedTabIds(ids);
  return ids;
}

export type BrowserTabMode = 'search' | 'fetch' | 'live' | 'arxiv' | 'domain';
export type BrowserTabStatus = 'loading' | 'complete' | 'error';

export interface BrowserSearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export interface BrowserArxivPaper {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  pdfUrl: string;
  categories?: string[];
}

export interface BrowserTab {
  id: string;
  toolCallId?: string;
  tool: string;
  mode: BrowserTabMode;
  status: BrowserTabStatus;
  title: string;
  createdAt: number;

  query?: string;
  results?: BrowserSearchResult[];
  searchResultCount?: number;
  searchCountry?: string;

  url?: string;
  pageTitle?: string;
  readerContent?: string;
  readerContentFull?: string;
  readerChromeStripped?: number;
  readerDedupeTitle?: boolean;
  readerTruncated?: boolean;
  readerRemainingSections?: number;
  publishedTime?: string;
  pageDescription?: string;
  fetchView?: 'site' | 'reader';
  proxyUrl?: string;

  contentFormat?: 'markdown' | 'json';
  structuredRaw?: string;
  structuredSummary?: string;
  dataView?: 'visual' | 'json';

  streamUrl?: string;
  runId?: string;
  runPhase?: 'live' | 'complete' | 'error';
  stepCount?: number;
  goal?: string;
  progressLabel?: string;
  pageUrl?: string;
  /** Browser Use session id (`tab_live_<sessionId>` suffix). */
  sessionId?: string;

  papers?: BrowserArxivPaper[];
  domain?: string;
  domainAction?: string;
  domainData?: Record<string, unknown>;

  payload?: unknown;
  error?: string;
}

function hostFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw.slice(0, 48);
  }
}

/** Normalize URLs for dedupe when opening pages from desktop open_window or pendingUrl. */
export function normalizeBrowserUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return trimmed;
  }
}

function stableUrlTabSourceId(normalizedUrl: string): string {
  let hash = 0;
  for (let i = 0; i < normalizedUrl.length; i++) {
    hash = ((hash << 5) - hash + normalizedUrl.charCodeAt(i)) | 0;
  }
  return `desktop_${Math.abs(hash).toString(36)}`;
}

function proxyUrlFor(target: string): string {
  return `${API_BASE_URL}/web/preview?url=${encodeURIComponent(target)}`;
}

function modeFromTool(tool: string): BrowserTabMode {
  switch (tool) {
    case 'web_search': return 'search';
    case 'web_fetch': return 'fetch';
    case 'arxiv': return 'arxiv';
    case 'domain_intel': return 'domain';
    case 'browser':
    case 'remote_browser':
      return 'live';
    default:
      return 'fetch';
  }
}

function titleFromToolCall(tool: string, params: Record<string, unknown>): string {
  const query = typeof params.query === 'string' ? params.query.trim() : '';
  const url = typeof params.url === 'string' ? params.url.trim() : '';
  const domain = typeof params.domain === 'string' ? params.domain.trim() : '';
  const goal = typeof params.goal === 'string' ? params.goal.trim() : '';
  switch (tool) {
    case 'web_search':
      return query ? (query.length > 40 ? `${query.slice(0, 39)}…` : query) : 'Search';
    case 'web_fetch':
      return url ? hostFromUrl(url) : 'Page';
    case 'arxiv':
      return query ? `arXiv: ${query.slice(0, 32)}` : 'arXiv';
    case 'domain_intel':
      return domain || 'Domain';
    case 'browser':
    case 'remote_browser':
      return goal ? (goal.length > 36 ? `${goal.slice(0, 35)}…` : goal) : 'Live session';
    default:
      return tool;
  }
}

function applySearchPayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  const query = typeof payload.query === 'string' ? payload.query : tab.query;
  const results = Array.isArray(payload.results)
    ? payload.results.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          title: String(row.title ?? ''),
          url: String(row.url ?? ''),
          snippet: String(row.snippet ?? ''),
          ...(typeof row.date === 'string' ? { date: row.date } : {}),
        };
      })
    : tab.results;
  const searchResultCount = typeof payload.resultCount === 'number'
    ? payload.resultCount
    : (results?.length ?? tab.searchResultCount);
  const searchCountry = typeof payload.country === 'string'
    ? payload.country
    : tab.searchCountry;
  return {
    ...tab,
    query,
    results,
    searchResultCount,
    searchCountry,
    status: 'complete',
  };
}

function shortTabTitle(text: string, max = 42): string {
  const t = text.trim();
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function applyFetchPayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  const url = typeof payload.url === 'string' ? payload.url : tab.url;
  const pageTitle = typeof payload.title === 'string' ? payload.title : tab.pageTitle;
  const rawFull = typeof payload.fullContent === 'string'
    ? payload.fullContent
    : (typeof payload.content === 'string' ? payload.content : tab.readerContent);
  const displayTitle = pageTitle
    ? shortTabTitle(pageTitle)
    : (url ? hostFromUrl(url) : tab.title);

  const structured = typeof rawFull === 'string'
    ? detectStructuredContent(rawFull, url)
    : null;

  if (structured?.format === 'json') {
    return {
      ...tab,
      url,
      pageTitle,
      title: displayTitle || tab.title,
      contentFormat: 'json',
      structuredRaw: structured.raw,
      structuredSummary: structured.summary,
      dataView: tab.dataView ?? 'visual',
      proxyUrl: url ? proxyUrlFor(url) : tab.proxyUrl,
      readerContent: undefined,
      readerContentFull: undefined,
      readerTruncated: payload.truncated === true,
      publishedTime: typeof payload.publishedTime === 'string' ? payload.publishedTime : tab.publishedTime,
      pageDescription: typeof payload.description === 'string' ? payload.description : tab.pageDescription,
      status: 'complete',
    };
  }

  const normalizeOpts = { pageTitle, url };
  const normalizedFull = typeof rawFull === 'string'
    ? normalizeReaderMarkdown(rawFull, normalizeOpts)
    : null;
  const fullMarkdown = normalizedFull?.content ?? (typeof rawFull === 'string' ? rawFull : '');
  const split = fullMarkdown
    ? splitReaderPreviewAtSections(fullMarkdown)
    : { preview: '', full: '', hasMore: false, remainingSectionCount: 0 };
  return {
    ...tab,
    url,
    pageTitle,
    title: displayTitle || tab.title,
    contentFormat: 'markdown',
    structuredRaw: undefined,
    structuredSummary: undefined,
    readerContent: split.preview,
    readerContentFull: split.hasMore ? split.full : undefined,
    readerRemainingSections: split.remainingSectionCount,
    readerChromeStripped: normalizedFull?.strippedLineCount,
    readerDedupeTitle: normalizedFull?.dedupeTitle,
    readerTruncated: payload.truncated === true || split.hasMore,
    publishedTime: typeof payload.publishedTime === 'string' ? payload.publishedTime : tab.publishedTime,
    pageDescription: typeof payload.description === 'string' ? payload.description : tab.pageDescription,
    proxyUrl: url ? proxyUrlFor(url) : tab.proxyUrl,
    fetchView: tab.fetchView ?? 'reader',
    status: 'complete',
  };
}

function applyArxivPayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  const query = typeof payload.query === 'string' ? payload.query : tab.query;
  const papers = Array.isArray(payload.papers)
    ? payload.papers.map((p) => {
        const row = p as Record<string, unknown>;
        return {
          id: String(row.id ?? ''),
          title: String(row.title ?? ''),
          authors: Array.isArray(row.authors) ? row.authors.map(String) : [],
          summary: String(row.summary ?? ''),
          published: String(row.published ?? ''),
          pdfUrl: String(row.pdfUrl ?? ''),
          categories: Array.isArray(row.categories) ? row.categories.map(String) : undefined,
        };
      })
    : tab.papers;
  return { ...tab, query, papers, status: 'complete' };
}

function applyDomainPayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  return {
    ...tab,
    domain: typeof payload.domain === 'string' ? payload.domain : tab.domain,
    domainAction: typeof payload.action === 'string' ? payload.action : tab.domainAction,
    domainData: payload.data && typeof payload.data === 'object'
      ? payload.data as Record<string, unknown>
      : tab.domainData,
    status: 'complete',
  };
}

/** Cheap read-only tabs the user can dismiss without confirmation. */
export function isStaticBrowserTab(tab: BrowserTab): boolean {
  return tab.mode !== 'live';
}

export function liveTabSessionId(tab: BrowserTab): string | undefined {
  if (tab.mode !== 'live') return undefined;
  if (tab.sessionId) return tab.sessionId;
  if (tab.id.startsWith('tab_live_')) return tab.id.slice('tab_live_'.length);
  return undefined;
}

const COMPLETED_LIVE_TAB_RETAIN_MS = 30 * 60 * 1000;

export function isLiveBrowserSessionActive(
  tab: BrowserTab,
  sessions: Record<string, { status?: string }>,
): boolean {
  if (tab.mode !== 'live') return false;
  if (tab.runPhase === 'live' && tab.status === 'loading') return true;

  const sessionId = liveTabSessionId(tab);
  const candidates = [sessionId, tab.runId].filter(Boolean) as string[];
  for (const id of candidates) {
    const session = sessions[id];
    if (session?.status === 'running' || session?.status === 'starting') return true;
  }

  if (tab.streamUrl && (tab.runPhase === 'complete' || tab.status === 'complete')) {
    return Date.now() - tab.createdAt < COMPLETED_LIVE_TAB_RETAIN_MS;
  }

  return false;
}

function pickActiveTabId(tabs: BrowserTab[], removedId: string, previousActive: string | null): string | null {
  if (tabs.length === 0) return null;
  if (previousActive && previousActive !== removedId && tabs.some((t) => t.id === previousActive)) {
    return previousActive;
  }
  return tabs[tabs.length - 1]?.id ?? null;
}

function applyLivePayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  const streamUrl = typeof payload.streamUrl === 'string' ? payload.streamUrl
    : typeof payload.liveUrl === 'string' ? payload.liveUrl : tab.streamUrl;
  const runPhase = payload.runPhase === 'live' || payload.runPhase === 'complete' || payload.runPhase === 'error'
    ? payload.runPhase
    : tab.runPhase;
  const runId = typeof payload.runId === 'string' ? payload.runId : tab.runId;
  const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl
    : typeof payload.url === 'string' ? payload.url : tab.pageUrl || tab.url;
  return {
    ...tab,
    payload,
    status: 'complete',
    ...(streamUrl ? { streamUrl } : {}),
    ...(runPhase ? { runPhase } : {}),
    ...(runId ? { runId, sessionId: runId } : {}),
    ...(pageUrl ? { pageUrl, url: pageUrl } : {}),
  };
}

function applyPayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  switch (tab.mode) {
    case 'search': return applySearchPayload(tab, payload);
    case 'fetch': return applyFetchPayload(tab, payload);
    case 'arxiv': return applyArxivPayload(tab, payload);
    case 'domain': return applyDomainPayload(tab, payload);
    case 'live': return applyLivePayload(tab, payload);
    default:
      return { ...tab, payload, status: 'complete' };
  }
}

function buildTabFromOpenEvent(data: Record<string, unknown>, id: string): BrowserTab {
  const tool = typeof data.tool === 'string' ? data.tool : 'web_fetch';
  const mode = (typeof data.mode === 'string' ? data.mode : modeFromTool(tool)) as BrowserTabMode;
  const url = typeof data.url === 'string' ? data.url : undefined;
  return {
    id,
    toolCallId: typeof data.toolCallId === 'string' ? data.toolCallId : undefined,
    tool,
    mode,
    status: 'loading',
    title: typeof data.title === 'string' ? data.title : titleFromToolCall(tool, data),
    createdAt: Date.now(),
    ...(typeof data.query === 'string' ? { query: data.query } : {}),
    ...(url ? { url, proxyUrl: proxyUrlFor(url), fetchView: 'reader' } : {}),
    ...(typeof data.domain === 'string' ? { domain: data.domain } : {}),
    ...(typeof data.goal === 'string' ? { goal: data.goal } : {}),
  };
}

interface BrowserTabStore {
  tabs: BrowserTab[];
  activeTabId: string | null;
  /** Latest tab payloads for dismissed tabs — rebuilt on history replay for explicit reopen. */
  tabSnapshots: Record<string, BrowserTab>;
  dismissedTabIds: Set<string>;
  openTabFromToolCall: (tool: string, toolCallId: string | undefined, params: Record<string, unknown>) => string;
  /** Open a fetch tab for a URL, or focus an existing tab with the same normalized URL. */
  openOrFocusUrlTab: (url: string, sourceId?: string) => string;
  openTabFromEvent: (data: Record<string, unknown>) => string;
  updateTabFromEvent: (data: Record<string, unknown>) => void;
  failTab: (toolCallId: string | undefined, error: string) => void;
  setActiveTab: (tabId: string) => void;
  setFetchView: (tabId: string, view: 'site' | 'reader') => void;
  setDataView: (tabId: string, view: 'visual' | 'json') => void;
  updateLiveTab: (tabId: string, patch: Partial<BrowserTab>) => void;
  findTabByToolCallId: (toolCallId: string) => BrowserTab | undefined;
  ensureLiveTab: (sessionId: string, data: { goal?: string; url?: string; title?: string }) => string;
  patchLiveTabBySession: (sessionId: string, patch: Partial<BrowserTab>) => void;
  closeTab: (tabId: string) => void;
  reopenTab: (tabId: string) => boolean;
  clearStaticTabs: () => void;
  pruneInactiveLiveTabs: (sessions: Record<string, { status?: string }>) => void;
  downgradeLiveTabsOnClose: () => void;
  removeLiveTabForSession: (sessionId: string) => void;
  navigateTab: (tabId: string, url: string) => void;
  reset: () => void;
}

export const useBrowserTabStore = create<BrowserTabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  tabSnapshots: {},
  dismissedTabIds: loadDismissedTabIds(),

  openTabFromToolCall: (tool, toolCallId, params) => {
    const id = toolCallId ? `tab_${toolCallId}` : `tab_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const existing = get().tabs.find((t) => t.id === id);
    if (existing) {
      set({ activeTabId: id });
      return id;
    }
    if (get().dismissedTabIds.has(id)) {
      return id;
    }
    const mode = modeFromTool(tool);
    const url = typeof params.url === 'string' ? params.url : undefined;
    const tab: BrowserTab = {
      id,
      toolCallId,
      tool,
      mode,
      status: 'loading',
      title: titleFromToolCall(tool, params),
      createdAt: Date.now(),
      ...(typeof params.query === 'string' ? { query: params.query } : {}),
      ...(url ? { url, proxyUrl: proxyUrlFor(url), fetchView: 'reader' } : {}),
      ...(typeof params.domain === 'string' ? { domain: params.domain } : {}),
      ...(typeof params.goal === 'string' ? { goal: params.goal } : {}),
      ...(typeof params.action === 'string' ? { domainAction: params.action } : {}),
    };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
    return id;
  },

  openOrFocusUrlTab: (url, sourceId) => {
    const normalized = normalizeBrowserUrl(url);
    if (!normalized) return get().activeTabId || '';
    const existing = get().tabs.find(
      (t) => t.url && normalizeBrowserUrl(t.url) === normalized,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    return get().openTabFromToolCall(
      'web_fetch',
      sourceId || stableUrlTabSourceId(normalized),
      { url: normalized },
    );
  },

  openTabFromEvent: (data) => {
    const id = typeof data.tabId === 'string' ? data.tabId : `tab_${Date.now()}`;
    const existing = get().tabs.find((t) => t.id === id);
    if (existing) {
      set({ activeTabId: id });
      return id;
    }
    const tab = buildTabFromOpenEvent(data, id);
    if (get().dismissedTabIds.has(id)) {
      set((state) => ({
        tabSnapshots: { ...state.tabSnapshots, [id]: tab },
      }));
      return id;
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
    return id;
  },

  updateTabFromEvent: (data) => {
    const tabId = typeof data.tabId === 'string' ? data.tabId : null;
    if (!tabId) return;
    const status = (typeof data.status === 'string' ? data.status : 'complete') as BrowserTabStatus;
    const payload = data.payload && typeof data.payload === 'object'
      ? data.payload as Record<string, unknown>
      : undefined;
    const error = typeof data.error === 'string' ? data.error : undefined;

    const applyUpdate = (tab: BrowserTab): BrowserTab => {
      if (status === 'error') {
        return { ...tab, status: 'error', error: error || 'Request failed' };
      }
      if (payload) return applyPayload(tab, payload);
      return { ...tab, status };
    };

    set((state) => {
      const inTabs = state.tabs.some((tab) => tab.id === tabId);
      if (inTabs) {
        return {
          tabs: state.tabs.map((tab) => (tab.id === tabId ? applyUpdate(tab) : tab)),
          activeTabId: tabId,
        };
      }
      if (state.dismissedTabIds.has(tabId) || state.tabSnapshots[tabId]) {
        const base = state.tabSnapshots[tabId] || state.tabs.find((t) => t.id === tabId);
        if (!base) return state;
        return {
          tabSnapshots: {
            ...state.tabSnapshots,
            [tabId]: applyUpdate(base),
          },
        };
      }
      return state;
    });
  },

  failTab: (toolCallId, error) => {
    if (!toolCallId) return;
    const id = `tab_${toolCallId}`;
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, status: 'error', error } : tab,
      ),
    }));
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  setFetchView: (tabId, view) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, fetchView: view } : tab,
      ),
    }));
  },

  setDataView: (tabId, view) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, dataView: view } : tab,
      ),
    }));
  },

  updateLiveTab: (tabId, patch) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, ...patch } : tab,
      ),
    }));
  },

  findTabByToolCallId: (toolCallId) => {
    const id = `tab_${toolCallId}`;
    return get().tabs.find((t) => t.id === id || t.toolCallId === toolCallId);
  },

  ensureLiveTab: (sessionId, data) => {
    const id = `tab_live_${sessionId}`;
    if (get().dismissedTabIds.has(id)) {
      const title = data.title || (data.goal
        ? (data.goal.length > 36 ? `${data.goal.slice(0, 35)}…` : data.goal)
        : 'Live session');
      const snapshot: BrowserTab = {
        id,
        tool: 'browser',
        mode: 'live',
        status: 'loading',
        title,
        createdAt: Date.now(),
        runPhase: 'live',
        sessionId,
        ...(data.goal ? { goal: data.goal } : {}),
        ...(data.url ? { url: data.url, pageUrl: data.url } : {}),
      };
      set((state) => ({
        tabSnapshots: { ...state.tabSnapshots, [id]: snapshot },
      }));
      return id;
    }
    const existing = get().tabs.find((t) => t.id === id);
    if (existing) {
      set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? {
          ...t,
          sessionId,
          ...(data.goal ? { goal: data.goal } : {}),
          ...(data.url ? { url: data.url, pageUrl: data.url } : {}),
          ...(data.title ? { title: data.title } : {}),
        } : t),
        activeTabId: id,
      }));
      return id;
    }
    const title = data.title || (data.goal
      ? (data.goal.length > 36 ? `${data.goal.slice(0, 35)}…` : data.goal)
      : 'Live session');
    const tab: BrowserTab = {
      id,
      tool: 'browser',
      mode: 'live',
      status: 'loading',
      title,
      createdAt: Date.now(),
      runPhase: 'live',
      sessionId,
      ...(data.goal ? { goal: data.goal } : {}),
      ...(data.url ? { url: data.url, pageUrl: data.url } : {}),
    };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
    return id;
  },

  patchLiveTabBySession: (sessionId, patch) => {
    const id = `tab_live_${sessionId}`;
    set((state) => {
      if (state.tabs.some((t) => t.id === id)) {
        return {
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, sessionId, ...patch } : t)),
        };
      }
      if (state.dismissedTabIds.has(id) && state.tabSnapshots[id]) {
        return {
          tabSnapshots: {
            ...state.tabSnapshots,
            [id]: { ...state.tabSnapshots[id], sessionId, ...patch },
          },
        };
      }
      return state;
    });
  },

  closeTab: (tabId) => {
    const dismissedTabIds = persistDismissedTabId(tabId);
    set((state) => {
      const closing = state.tabs.find((t) => t.id === tabId);
      const tabs = state.tabs.filter((t) => t.id !== tabId);
      return {
        tabs,
        dismissedTabIds,
        tabSnapshots: closing
          ? { ...state.tabSnapshots, [tabId]: closing }
          : state.tabSnapshots,
        activeTabId: pickActiveTabId(tabs, tabId, state.activeTabId),
      };
    });
  },

  reopenTab: (tabId) => {
    const dismissedTabIds = persistUndismissedTabId(tabId);
    const snap = get().tabSnapshots[tabId];
    if (!snap) {
      set({ dismissedTabIds });
      return false;
    }
    set((state) => ({
      dismissedTabIds,
      tabs: state.tabs.some((t) => t.id === tabId) ? state.tabs : [...state.tabs, snap],
      activeTabId: tabId,
    }));
    return true;
  },

  clearStaticTabs: () => {
    set((state) => {
      const removed = state.tabs.filter((t) => isStaticBrowserTab(t));
      const removedIds = new Set(removed.map((t) => t.id));
      if (removedIds.size === 0) return state;
      const dismissedTabIds = persistDismissedTabIds(removedIds);
      const tabSnapshots = { ...state.tabSnapshots };
      for (const tab of removed) tabSnapshots[tab.id] = tab;
      const tabs = state.tabs.filter((t) => !isStaticBrowserTab(t));
      const activeTabId = state.activeTabId && !removedIds.has(state.activeTabId)
        ? state.activeTabId
        : (tabs[tabs.length - 1]?.id ?? null);
      return { tabs, activeTabId, dismissedTabIds, tabSnapshots };
    });
  },

  pruneInactiveLiveTabs: (sessions) => {
    set((state) => {
      const toRemove = state.tabs
        .filter((t) => (
          t.mode === 'live'
          && t.id !== state.activeTabId
          && !t.runId
          && !t.streamUrl
          && !isLiveBrowserSessionActive(t, sessions)
        ))
        .map((t) => t.id);
      if (toRemove.length === 0) return state;
      const removeSet = new Set(toRemove);
      const tabSnapshots = { ...state.tabSnapshots };
      for (const tab of state.tabs) {
        if (removeSet.has(tab.id)) tabSnapshots[tab.id] = tab;
      }
      const tabs = state.tabs.filter((t) => !removeSet.has(t.id));
      const activeTabId = state.activeTabId && !removeSet.has(state.activeTabId)
        ? state.activeTabId
        : (tabs[tabs.length - 1]?.id ?? null);
      return { tabs, activeTabId, tabSnapshots };
    });
  },

  downgradeLiveTabsOnClose: () => {
    set((state) => ({
      tabs: state.tabs.map((t) => (
        t.mode === 'live'
          ? { ...t, runPhase: 'complete' as const, streamUrl: undefined, status: 'complete' as const }
          : t
      )),
    }));
  },

  removeLiveTabForSession: (sessionId) => {
    get().closeTab(`tab_live_${sessionId}`);
  },

  navigateTab: (tabId: string, url: string) => {
    const normalized = normalizeBrowserUrl(url);
    if (!normalized) return;
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              url: normalized,
              proxyUrl: proxyUrlFor(normalized),
              status: 'loading' as const,
              title: hostFromUrl(normalized),
              readerContent: undefined,
              readerContentFull: undefined,
              pageTitle: undefined,
              fetchView: 'site' as const,
            }
          : t
      ),
    }));
  },

  reset: () => set({
    tabs: [],
    activeTabId: null,
    tabSnapshots: {},
    dismissedTabIds: loadDismissedTabIds(),
  }),
}));

export const BROWSER_WEB_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'arxiv',
  'domain_intel',
  'composio_search',
  'browser',
  'discover',
  'execute',
]);

export function isBrowserWebTool(tool: string): boolean {
  return BROWSER_WEB_TOOLS.has(tool);
}
