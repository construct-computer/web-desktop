/**
 * Utility functions extracted from agentStore.ts.
 *
 * Pure functions for tool descriptions, window type mapping,
 * auth card persistence, and frame caching.
 */

import type { ChatMessage } from './agentStoreTypes';
import type { WindowType } from '@/types';
import { isTextFile, isDocumentFile } from '../lib/utils';
import { useWindowStore } from './windowStore';

// ── Auth card persistence ──────────────────────────────────────────────────

import { STORAGE_KEYS } from '@/lib/config';

const AUTH_CARDS_STORAGE_KEY = STORAGE_KEYS.authConnectCards;

interface StoredAuthCard {
  toolkit: string;
  name: string;
  description: string;
  url: string;
  timestamp: number;
}

export function saveAuthCards(cards: Map<string, StoredAuthCard>): void {
  try {
    sessionStorage.setItem(AUTH_CARDS_STORAGE_KEY, JSON.stringify(Array.from(cards.entries())));
  } catch {}
}

export function loadAuthCards(): Map<string, StoredAuthCard> {
  try {
    const raw = sessionStorage.getItem(AUTH_CARDS_STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch { return new Map(); }
}

/**
 * Track notification IDs for auth_connect events so the AuthConnectCard
 * can dismiss them when the user connects from the chat card instead.
 */
export const authConnectNotifIds = new Map<string, string>();

/** Pending auth cards — persisted to sessionStorage. */
export const pendingAuthCards = loadAuthCards();

/** Mark a toolkit as connected and remove its card. */
export function clearAuthCard(toolkit: string): void {
  pendingAuthCards.delete(toolkit.toLowerCase());
  saveAuthCards(pendingAuthCards);
}

// ── Frame caching (bypasses React state for performance) ───────────────────

/**
 * Module-level binary frame cache. Keyed by daemon tab ID (e.g. 'tab-0')
 * or subagentId for agent-sourced screenshots.
 */
const _tabBlobCache = new Map<string, Blob>();

/**
 * Per-window frame renderers — each BrowserWindow registers its own renderer.
 */
const _frameRenderers = new Map<string, (blob: Blob) => void>();
const _canvasClearFns = new Map<string, () => void>();

export function registerFrameRenderer(windowId: string, renderer: ((blob: Blob) => void) | null): void {
  if (renderer) {
    _frameRenderers.set(windowId, renderer);
  } else {
    _frameRenderers.delete(windowId);
  }
}

export function registerCanvasClear(windowId: string, fn: (() => void) | null): void {
  if (fn) {
    _canvasClearFns.set(windowId, fn);
  } else {
    _canvasClearFns.delete(windowId);
  }
}

export function getCachedFrameBlob(tabId: string): Blob | undefined {
  return _tabBlobCache.get(tabId);
}

export function getTabBlobCache(): Map<string, Blob> {
  return _tabBlobCache;
}

export function getFrameRenderers(): Map<string, (blob: Blob) => void> {
  return _frameRenderers;
}

export function getCanvasClearFns(): Map<string, () => void> {
  return _canvasClearFns;
}

// ── Window lookup helpers ──────────────────────────────────────────────────

export function findWindowForDaemonTab(daemonTabId: string): string | undefined {
  const windows = useWindowStore.getState().windows;
  return windows.find(w => w.type === 'browser' && w.metadata?.daemonTabId === daemonTabId)?.id;
}

export function findWindowForTinyfish(subagentId: string): string | undefined {
  const windows = useWindowStore.getState().windows;
  return windows.find(w => w.type === 'browser' && w.metadata?.tinyfishSubagentId === subagentId)?.id;
}

export function findWindowForSubagent(subagentId: string): string | undefined {
  const windows = useWindowStore.getState().windows;
  return windows.find(w => w.type === 'browser' && w.metadata?.subagentId === subagentId)?.id;
}

// ── Chat message helpers ───────────────────────────────────────────────────

import { MAX_CHAT_MESSAGES } from '@/lib/config';

export function appendMessage(messages: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  // Deduplicate consecutive identical error messages (e.g. abort errors from multiple sources)
  if (msg.isError && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.isError && last.content === msg.content) {
      return messages;
    }
  }
  const next = [...messages, msg];
  return next.length > MAX_CHAT_MESSAGES ? next.slice(next.length - MAX_CHAT_MESSAGES) : next;
}

// ── Tool description mapping ───────────────────────────────────────────────

/** Build a human-readable activity description from a tool_call event */
export function describeToolCall(tool: string, params?: Record<string, unknown>): { text: string; activityType: ChatMessage['activityType'] } {
  const p = params || {};

  // Browser tools
  if (tool === 'local_browser' || tool === 'browser' || tool.startsWith('browser_')) {
    const action = (p.action as string) || tool.replace('browser_', '');
    const url = p.url as string | undefined;
    const text = p.text as string | undefined;
    const selector = p.selector as string | undefined;
    const ref = p.ref as string | undefined;

    switch (action) {
      case 'navigate':
      case 'browser_navigate':
        return { text: `Navigating to ${url || 'page'}`, activityType: 'browser' };
      case 'click':
      case 'browser_click':
        return { text: `Clicking ${text ? `"${text}"` : selector || ref || 'element'}`, activityType: 'browser' };
      case 'type':
      case 'browser_type':
        return { text: `Typing "${(p.text as string || '').slice(0, 50)}${(p.text as string || '').length > 50 ? '...' : ''}"`, activityType: 'browser' };
      case 'scroll':
      case 'browser_scroll':
        return { text: `Scrolling ${(p.direction as string) || 'page'}`, activityType: 'browser' };
      case 'snapshot':
      case 'browser_snapshot':
        return { text: 'Reading page content', activityType: 'browser' };
      case 'screenshot':
      case 'browser_screenshot':
        return { text: 'Taking screenshot', activityType: 'browser' };
      case 'window_new':
      case 'browser_window_new':
      case 'tab_new':
      case 'browser_tab_new':
        return { text: `Opening new browser window${url ? `: ${url}` : ''}`, activityType: 'browser' };
      case 'window_close':
      case 'browser_window_close':
      case 'tab_close':
      case 'browser_tab_close':
        return { text: 'Closing browser window', activityType: 'browser' };
      case 'window_focus':
      case 'browser_window_focus':
      case 'tab_switch':
      case 'browser_tab_switch':
        return { text: 'Focusing browser window', activityType: 'browser' };
      default:
        return { text: `Browser: ${action}`, activityType: 'browser' };
    }
  }

  if (tool === 'exec') {
    const cmd = (p.command as string) || '';
    const display = cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
    return { text: `Running \`${display}\``, activityType: 'terminal' };
  }

  if (tool === 'read' || tool === 'file_read') return { text: `Reading ${p.path || p.file || 'file'}`, activityType: 'file' };
  if (tool === 'write' || tool === 'file_write') return { text: `Writing ${p.path || p.file || 'file'}`, activityType: 'file' };
  if (tool === 'edit' || tool === 'file_edit') return { text: `Editing ${p.path || p.file || 'file'}`, activityType: 'file' };
  if (tool === 'list') return { text: `Listing ${p.path || p.directory || '.'}`, activityType: 'file' };

  if (tool === 'desktop') return { text: `Desktop: ${p.action || 'action'}`, activityType: 'desktop' };

  if (tool === 'web_search') {
    const query = p.query as string | undefined;
    const url = p.url as string | undefined;
    const goal = p.goal as string | undefined;
    if (url && goal) {
      const shortGoal = goal.length > 50 ? goal.slice(0, 50) + '...' : goal;
      return { text: `TinyFish: ${shortGoal}`, activityType: 'tinyfish' };
    }
    const shortQuery = query && query.length > 50 ? query.slice(0, 50) + '...' : query;
    return { text: `Searching: ${shortQuery || 'web'}`, activityType: 'tool' };
  }

  if (tool === 'remote_browser' || tool === 'web_scrape') {
    const url = p.url as string | undefined;
    const goal = p.goal as string | undefined;
    if (url && goal) {
      const shortGoal = goal.length > 50 ? goal.slice(0, 50) + '...' : goal;
      return { text: `Scraping: ${shortGoal}`, activityType: 'tinyfish' };
    }
    return { text: `Web scraping${url ? `: ${url}` : ''}`, activityType: 'tinyfish' };
  }

  if (tool === 'notify') return { text: `Notification: ${p.title || 'alert'}`, activityType: 'desktop' };

  if (tool === 'google_drive') {
    const action = p.action as string | undefined;
    switch (action) {
      case 'status': return { text: 'Checking Google Drive status', activityType: 'file' };
      case 'list': return { text: 'Listing Google Drive files', activityType: 'file' };
      case 'upload': return { text: `Uploading ${(p.file_path as string)?.split('/').pop() || 'file'} to Google Drive`, activityType: 'file' };
      case 'download': return { text: 'Downloading file from Google Drive', activityType: 'file' };
      case 'search': return { text: `Searching Drive for "${p.query || '...'}"`, activityType: 'file' };
      default: return { text: `Google Drive: ${action || 'operation'}`, activityType: 'file' };
    }
  }

  if (tool === 'email') {
    const action = p.action as string | undefined;
    const to = p.to as string | undefined;
    const subject = p.subject as string | undefined;
    switch (action) {
      case 'status': return { text: 'Checking email status', activityType: 'tool' };
      case 'send': {
        const shortSubject = subject ? (subject.length > 40 ? subject.slice(0, 40) + '...' : subject) : '';
        return { text: `Sending email${to ? ` to ${to}` : ''}${shortSubject ? `: "${shortSubject}"` : ''}`, activityType: 'tool' };
      }
      case 'reply': return { text: 'Replying to email', activityType: 'tool' };
      case 'inbox': return { text: 'Checking inbox', activityType: 'tool' };
      case 'thread': return { text: 'Reading email thread', activityType: 'tool' };
      case 'search': return { text: `Searching emails for "${p.query || '...'}"`, activityType: 'tool' };
      default: return { text: `Email: ${action || 'operation'}`, activityType: 'tool' };
    }
  }

  if (tool === 'calendar') {
    const action = p.action as string | undefined;
    const summary = p.summary as string | undefined;
    const shortSummary = summary ? (summary.length > 40 ? summary.slice(0, 40) + '...' : summary) : '';
    switch (action) {
      case 'list_events': return { text: 'Checking task schedule', activityType: 'calendar' };
      case 'get_event': return { text: 'Reading scheduled task', activityType: 'calendar' };
      case 'create_event': return { text: `Scheduling task${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' };
      case 'update_event': return { text: `Updating task${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' };
      case 'delete_event': return { text: 'Removing scheduled task', activityType: 'calendar' };
      case 'quick_add': return { text: 'Quick-scheduling task', activityType: 'calendar' };
      default: return { text: `Task schedule: ${action || 'operation'}`, activityType: 'calendar' };
    }
  }

  if (tool === 'google_calendar') {
    const action = p.action as string | undefined;
    const summary = p.summary as string | undefined;
    const shortSummary = summary ? (summary.length > 40 ? summary.slice(0, 40) + '...' : summary) : '';
    switch (action) {
      case 'status': return { text: 'Checking Google Calendar connection', activityType: 'calendar' };
      case 'list_events': return { text: 'Checking Google Calendar', activityType: 'calendar' };
      case 'get_event': return { text: 'Reading Google Calendar event', activityType: 'calendar' };
      case 'create_event': return { text: `Adding to Google Calendar${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' };
      case 'update_event': return { text: `Updating Google Calendar event${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' };
      case 'delete_event': return { text: 'Removing Google Calendar event', activityType: 'calendar' };
      case 'quick_add': return { text: 'Quick-adding to Google Calendar', activityType: 'calendar' };
      case 'list_calendars': return { text: 'Listing Google calendars', activityType: 'calendar' };
      default: return { text: `Google Calendar: ${action || 'operation'}`, activityType: 'calendar' };
    }
  }

  if (tool === 'telegram') {
    const action = p.action as string | undefined;
    switch (action) {
      case 'status': return { text: 'Checking Telegram status', activityType: 'tool' };
      case 'send_message': return { text: `Sending Telegram message${p.username ? ` to @${p.username}` : ''}`, activityType: 'tool' };
      case 'send_notification': return { text: 'Sending Telegram notification', activityType: 'tool' };
      default: return { text: `Telegram: ${action || 'operation'}`, activityType: 'tool' };
    }
  }

  if (tool === 'audit_log') {
    const action = p.action as string | undefined;
    switch (action) {
      case 'list': return { text: `Reviewing activity history${p.query ? ` for "${p.query}"` : ''}`, activityType: 'tool' };
      case 'stats': return { text: 'Checking activity stats', activityType: 'tool' };
      default: return { text: `Audit log: ${action || 'query'}`, activityType: 'tool' };
    }
  }

  if (tool === 'delegate_task') {
    const goal = p.goal as string | undefined;
    const subtasks = p.subtasks;
    const count = Array.isArray(subtasks) ? subtasks.length : '?';
    const shortGoal = goal ? (goal.length > 50 ? goal.slice(0, 50) + '...' : goal) : 'complex task';
    return { text: `Delegating: ${shortGoal} (${count} subagents)`, activityType: 'delegation' };
  }

  if (tool === 'consult_experts') {
    const question = p.question as string | undefined;
    const shortQ = question ? (question.length > 50 ? question.slice(0, 50) + '...' : question) : 'question';
    return { text: `Consulting advisors: ${shortQ}`, activityType: 'delegation' };
  }

  if (tool === 'background_task') {
    const action = p.action as string | undefined;
    switch (action) {
      case 'spawn': return { text: `Launching background task: ${((p.goal as string) || 'task').slice(0, 50)}`, activityType: 'background' };
      case 'status': return { text: 'Checking background task status', activityType: 'background' };
      case 'cancel': return { text: 'Cancelling background task', activityType: 'background' };
      case 'list': return { text: 'Listing background tasks', activityType: 'background' };
      default: return { text: `Background task: ${action || 'operation'}`, activityType: 'background' };
    }
  }

  if (tool === 'spawn_agent') {
    const goal = p.goal as string | undefined;
    return { text: `Spawning agent: ${(goal || 'task').slice(0, 60)}`, activityType: 'delegation' };
  }
  if (tool === 'wait_for_agents') {
    const ids = p.agent_ids as string[] | undefined;
    return { text: `Waiting for ${ids?.length || ''} agent${ids?.length === 1 ? '' : 's'} to complete`, activityType: 'delegation' };
  }
  if (tool === 'check_agent_status') return { text: 'Checking agent status', activityType: 'delegation' };
  if (tool === 'cancel_agent') return { text: 'Cancelling agent', activityType: 'delegation' };
  if (tool === 'list_active_agents') return { text: 'Listing active agents', activityType: 'delegation' };
  if (tool === 'update_plan') {
    if ((p.action as string) === 'create') return { text: `Planning: ${((p.goal as string) || 'task').slice(0, 50)}`, activityType: 'tool' };
    return { text: 'Updating plan', activityType: 'tool' };
  }
  if (tool === 'add_observation') return { text: 'Recording observation', activityType: 'tool' };
  if (tool === 'respond_directly' || tool === 'respond_to_user') return { text: '', activityType: 'tool' };
  if (tool === 'ask_user') {
    const question = p.question as string | undefined;
    return { text: `Asking: ${(question || 'question').slice(0, 50)}`, activityType: 'tool' };
  }

  if (tool === 'composio') {
    const action = p.action as string | undefined;
    switch (action) {
      case 'execute': return { text: p.tool_slug ? formatComposioSlug(p.tool_slug as string) : 'Executing Composio tool', activityType: 'tool' };
      case 'search': return { text: `Searching apps${p.query ? `: "${(p.query as string).slice(0, 40)}"` : ''}`, activityType: 'tool' };
      case 'status': return { text: `Checking ${p.toolkit ? titleCaseToolkit(p.toolkit as string) : 'app'} connection`, activityType: 'tool' };
      default: return { text: `Composio: ${action || 'operation'}`, activityType: 'tool' };
    }
  }

  return { text: `Using ${tool}`, activityType: 'tool' };
}

/** Convert a Composio slug like NOTION_CREATE_A_NEW_PAGE → "Notion: create a new page" */
export function formatComposioSlug(slug: string): string {
  const idx = slug.indexOf('_');
  if (idx === -1) return slug;
  const toolkitRaw = slug.slice(0, idx).toLowerCase();
  const actionRaw = slug.slice(idx + 1).toLowerCase().replace(/_/g, ' ');
  return `${titleCaseToolkit(toolkitRaw)}: ${actionRaw}`;
}

/** Extract a display-friendly tool name from composio params */
export function composioDisplayTool(params?: Record<string, unknown>): string {
  if (!params) return 'composio';
  const slug = params.tool_slug as string | undefined;
  if (slug) {
    const idx = slug.indexOf('_');
    return idx > 0 ? slug.slice(0, idx).toLowerCase() : slug.toLowerCase();
  }
  const toolkit = params.toolkit as string | undefined;
  if (toolkit) return toolkit.toLowerCase();
  return 'composio';
}

/** Title-case a toolkit name with known brand casing */
export function titleCaseToolkit(name: string): string {
  const lower = name.toLowerCase();
  const brands: Record<string, string> = {
    github: 'GitHub', hubspot: 'HubSpot', linkedin: 'LinkedIn',
    clickup: 'ClickUp', googlecalendar: 'Google Calendar',
    googledrive: 'Google Drive', googlesheets: 'Google Sheets',
    googledocs: 'Google Docs', mongodb: 'MongoDB', postgresql: 'PostgreSQL',
    youtube: 'YouTube', bitbucket: 'Bitbucket', gmail: 'Gmail',
    microsoft_teams: 'Microsoft Teams', dropbox: 'Dropbox',
  };
  return brands[lower] || (lower.charAt(0).toUpperCase() + lower.slice(1));
}

// ── Tool-to-window mapping ─────────────────────────────────────────────────

export function toolToWindowType(tool: string, params?: Record<string, unknown>): WindowType | null {
  if (tool === 'browser' || tool.startsWith('browser_')) return 'browser';
  if (tool === 'exec') return 'terminal';
  if (tool === 'read' || tool === 'write' || tool === 'edit' || tool === 'list') {
    const path = params?.path as string | undefined;
    if (path && isDocumentFile(path)) return 'document-viewer';
    if (path && !isTextFile(path)) return 'files';
    return 'editor';
  }
  if (tool === 'file_read' || tool === 'file_write' || tool === 'file_edit') {
    const path = params?.path as string | undefined;
    if (path && isDocumentFile(path)) return 'document-viewer';
    if (path && !isTextFile(path)) return 'files';
    return 'editor';
  }
  if (tool === 'google_drive') return 'files';
  if (tool === 'agent_calendar' || tool === 'calendar' || tool === 'google_calendar') return 'calendar';
  if (tool === 'email') return 'email';
  return null;
}

export function desktopActionToWindowType(action: string): WindowType | null {
  switch (action) {
    case 'open_browser': return 'browser';
    case 'open_terminal': return 'terminal';
    case 'open_file':
    case 'open_editor': return 'editor';
    case 'open_settings': return 'settings';
    default: return null;
  }
}
