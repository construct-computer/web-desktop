/**
 * Emulated browser tabs for web_search, web_fetch, research tools, and live sessions.
 */

import { create } from 'zustand';
import { API_BASE_URL } from '@/lib/constants';

export type BrowserTabMode = 'search' | 'fetch' | 'live' | 'arxiv' | 'youtube' | 'domain';
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

  url?: string;
  pageTitle?: string;
  readerContent?: string;
  readerTruncated?: boolean;
  publishedTime?: string;
  fetchView?: 'site' | 'reader';
  proxyUrl?: string;

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
  transcript?: string;
  videoId?: string;
  durationSeconds?: number;
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

function proxyUrlFor(target: string): string {
  return `${API_BASE_URL}/web/preview?url=${encodeURIComponent(target)}`;
}

function modeFromTool(tool: string): BrowserTabMode {
  switch (tool) {
    case 'web_search': return 'search';
    case 'web_fetch': return 'fetch';
    case 'arxiv': return 'arxiv';
    case 'youtube': return 'youtube';
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
    case 'youtube':
      return url ? hostFromUrl(url) : 'YouTube';
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
  return { ...tab, query, results, status: 'complete' };
}

function applyFetchPayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  const url = typeof payload.url === 'string' ? payload.url : tab.url;
  return {
    ...tab,
    url,
    pageTitle: typeof payload.title === 'string' ? payload.title : tab.pageTitle,
    readerContent: typeof payload.content === 'string' ? payload.content : tab.readerContent,
    readerTruncated: payload.truncated === true,
    publishedTime: typeof payload.publishedTime === 'string' ? payload.publishedTime : tab.publishedTime,
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

function applyYoutubePayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  return {
    ...tab,
    videoId: typeof payload.videoId === 'string' ? payload.videoId : tab.videoId,
    url: typeof payload.url === 'string' ? payload.url : tab.url,
    transcript: typeof payload.transcript === 'string' ? payload.transcript : tab.transcript,
    durationSeconds: typeof payload.durationSeconds === 'number' ? payload.durationSeconds : tab.durationSeconds,
    pageTitle: typeof payload.title === 'string' ? payload.title : tab.pageTitle,
    status: 'complete',
  };
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

  return tab.runPhase === 'live';
}

function pickActiveTabId(tabs: BrowserTab[], removedId: string, previousActive: string | null): string | null {
  if (tabs.length === 0) return null;
  if (previousActive && previousActive !== removedId && tabs.some((t) => t.id === previousActive)) {
    return previousActive;
  }
  return tabs[tabs.length - 1]?.id ?? null;
}

function applyPayload(tab: BrowserTab, payload: Record<string, unknown>): BrowserTab {
  switch (tab.mode) {
    case 'search': return applySearchPayload(tab, payload);
    case 'fetch': return applyFetchPayload(tab, payload);
    case 'arxiv': return applyArxivPayload(tab, payload);
    case 'youtube': return applyYoutubePayload(tab, payload);
    case 'domain': return applyDomainPayload(tab, payload);
    default:
      return { ...tab, payload, status: 'complete' };
  }
}

interface BrowserTabStore {
  tabs: BrowserTab[];
  activeTabId: string | null;
  openTabFromToolCall: (tool: string, toolCallId: string | undefined, params: Record<string, unknown>) => string;
  openTabFromEvent: (data: Record<string, unknown>) => string;
  updateTabFromEvent: (data: Record<string, unknown>) => void;
  failTab: (toolCallId: string | undefined, error: string) => void;
  setActiveTab: (tabId: string) => void;
  setFetchView: (tabId: string, view: 'site' | 'reader') => void;
  updateLiveTab: (tabId: string, patch: Partial<BrowserTab>) => void;
  findTabByToolCallId: (toolCallId: string) => BrowserTab | undefined;
  ensureLiveTab: (sessionId: string, data: { goal?: string; url?: string; title?: string }) => string;
  patchLiveTabBySession: (sessionId: string, patch: Partial<BrowserTab>) => void;
  closeTab: (tabId: string) => void;
  clearStaticTabs: () => void;
  pruneInactiveLiveTabs: (sessions: Record<string, { status?: string }>) => void;
  removeLiveTabForSession: (sessionId: string) => void;
  reset: () => void;
}

export const useBrowserTabStore = create<BrowserTabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTabFromToolCall: (tool, toolCallId, params) => {
    const id = toolCallId ? `tab_${toolCallId}` : `tab_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const existing = get().tabs.find((t) => t.id === id);
    if (existing) {
      set({ activeTabId: id });
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

  openTabFromEvent: (data) => {
    const id = typeof data.tabId === 'string' ? data.tabId : `tab_${Date.now()}`;
    const existing = get().tabs.find((t) => t.id === id);
    if (existing) {
      set({ activeTabId: id });
      return id;
    }
    const tool = typeof data.tool === 'string' ? data.tool : 'web_fetch';
    const mode = (typeof data.mode === 'string' ? data.mode : modeFromTool(tool)) as BrowserTabMode;
    const url = typeof data.url === 'string' ? data.url : undefined;
    const tab: BrowserTab = {
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

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        if (status === 'error') {
          return { ...tab, status: 'error', error: error || 'Request failed' };
        }
        if (payload) return applyPayload(tab, payload);
        return { ...tab, status };
      }),
      activeTabId: tabId,
    }));
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
    set((state) => ({
      tabs: state.tabs.map((t) => t.id === id ? { ...t, sessionId, ...patch } : t),
    }));
  },

  closeTab: (tabId) => {
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== tabId);
      return {
        tabs,
        activeTabId: pickActiveTabId(tabs, tabId, state.activeTabId),
      };
    });
  },

  clearStaticTabs: () => {
    set((state) => {
      const tabs = state.tabs.filter((t) => !isStaticBrowserTab(t));
      const removedIds = new Set(
        state.tabs.filter((t) => isStaticBrowserTab(t)).map((t) => t.id),
      );
      const activeTabId = state.activeTabId && !removedIds.has(state.activeTabId)
        ? state.activeTabId
        : (tabs[tabs.length - 1]?.id ?? null);
      return { tabs, activeTabId };
    });
  },

  pruneInactiveLiveTabs: (sessions) => {
    set((state) => {
      const toRemove = state.tabs
        .filter((t) => t.mode === 'live' && !isLiveBrowserSessionActive(t, sessions))
        .map((t) => t.id);
      if (toRemove.length === 0) return state;
      const removeSet = new Set(toRemove);
      const tabs = state.tabs.filter((t) => !removeSet.has(t.id));
      const activeTabId = state.activeTabId && !removeSet.has(state.activeTabId)
        ? state.activeTabId
        : (tabs[tabs.length - 1]?.id ?? null);
      return { tabs, activeTabId };
    });
  },

  removeLiveTabForSession: (sessionId) => {
    get().closeTab(`tab_live_${sessionId}`);
  },

  reset: () => set({ tabs: [], activeTabId: null }),
}));

export const BROWSER_WEB_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'arxiv',
  'youtube',
  'domain_intel',
]);

export function isBrowserWebTool(tool: string): boolean {
  return BROWSER_WEB_TOOLS.has(tool);
}
