/**
 * Utility functions extracted from agentStore.ts.
 *
 * Pure functions for tool descriptions, window type mapping,
 * auth card persistence, and frame caching.
 */

import type { ChatMessage } from './agentStoreTypes';
import type { WindowType } from '@/types';
import { routeToolToWindow } from '../lib/toolWindowRouting';
import { readerMarkdownSnippet } from '../lib/readerMarkdownNormalize';
import { detectStructuredContent } from '../lib/structuredData';
import { useWindowStore } from './windowStore';

// ── Auth card persistence ──────────────────────────────────────────────────

import { STORAGE_KEYS } from '@/lib/config';

const AUTH_CARDS_STORAGE_KEY = STORAGE_KEYS.authConnectCards;

export interface StoredAuthCard {
  kind?: 'composio' | 'app';
  toolkit: string;
  name: string;
  description: string;
  url?: string;
  logo?: string;
  appId?: string;
  sessionKey?: string;
  expiresAt?: number;
  pendingActionId?: string;
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

export function findWindowForBrowser(subagentId: string): string | undefined {
  const windows = useWindowStore.getState().windows;
  return windows.find(w => w.type === 'browser' && w.metadata?.browserSubagentId === subagentId)?.id;
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

function truncateActivityText(s: string, max = 58): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatActivityUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return truncateActivityText(`${u.hostname}${path}`, 72);
  } catch {
    return truncateActivityText(url, 72);
  }
}

/** Pull a human-readable snippet from typical tool args (used for generic tools). */
function summarizeCommonToolParams(p: Record<string, unknown>): string | null {
  const keys = ['query', 'goal', 'prompt', 'title', 'subject', 'text', 'task', 'question', 'url', 'path', 'workspace_path', 'channel', 'session_key', 'tool_name', 'id', 'name', 'description'];
  for (const key of keys) {
    const v = p[key];
    if (typeof v === 'string' && v.trim()) {
      if (key === 'url') return formatActivityUrl(v);
      return truncateActivityText(v, 56);
    }
  }
  if (typeof p.action === 'string' && p.action.trim()) {
    const { action: _a, ...rest } = p;
    const sub = summarizeCommonToolParams(rest);
    return sub ? `${p.action}: ${sub}` : String(p.action);
  }
  return null;
}

function humanizeToolIdForActivity(tool: string): string {
  return tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short verb for tools without a dedicated branch — better than "Using tool_name". */
const TOOL_ACTIVITY_VERB: Record<string, string> = {
  web_fetch: 'Fetching',
  tool_search: 'Finding tools',
  read_agent_output: 'Reading stored output',
  schedule_task: 'Scheduling',
  agent_schedule: 'Scheduling',
  task_create: 'Creating task',
  task_update: 'Updating task',
  task_list: 'Listing tasks',
  task_get: 'Reading task',
  slack: 'Slack',
  github: 'GitHub',
  arxiv: 'arXiv search',
  domain_intel: 'Domain intel',
  app: 'Apps',
  browser: 'Browser',
  remote_browser_session: 'Browser session',
  cancel_agents: 'Cancelling helpers',
  coding_guide: 'Loading guide',
  local_app_guide: 'Loading guide',
  web_design_guide: 'Loading guide',
  list_active_sessions: 'Listing active sessions',
  get_session_progress: 'Session progress',
  send_to_session: 'Messaging session',
  stop_session: 'Stopping session',
  interrupt_session: 'Interrupting session',
  notify_user: 'Notifying user',
};

function defaultToolActivity(tool: string, p: Record<string, unknown>): { text: string; activityType: ChatMessage['activityType'] } {
  const verb = TOOL_ACTIVITY_VERB[tool] || humanizeToolIdForActivity(tool);
  const detail = summarizeCommonToolParams(p);
  if (detail) return { text: `${verb}: ${detail}`, activityType: 'tool' };
  return { text: verb, activityType: 'tool' };
}

/** Build a human-readable activity description from a tool_call event */
export function describeToolCall(tool: string, params?: Record<string, unknown>): { text: string; activityType: ChatMessage['activityType'] } {
  const p = params || {};

  // Browser tools
  if (tool === 'browser') {
    const intent = p.intent as string | undefined;
    const url = p.url as string | undefined;
    const instruction = p.instruction as string | undefined;
    if (intent === 'screenshot') return { text: `Screenshot: ${url ? formatActivityUrl(url) : 'page'}`, activityType: 'web' };
    if (intent === 'read') return { text: `Reading rendered page: ${url ? formatActivityUrl(url) : 'page'}`, activityType: 'web' };
    if (intent === 'evaluate') return { text: `Evaluating page JavaScript${url ? `: ${formatActivityUrl(url)}` : ''}`, activityType: 'web' };
    if (intent === 'files') return { text: 'Syncing browser files', activityType: 'file' };
    if (intent === 'status') return { text: 'Checking browser status', activityType: 'web' };
    if (intent === 'stop') return { text: 'Stopping browser session', activityType: 'web' };
    if (instruction) return { text: `Browsing: ${instruction.slice(0, 55)}${instruction.length > 55 ? '…' : ''}`, activityType: 'web' };
    if (url) return { text: `Browsing: ${formatActivityUrl(url)}`, activityType: 'web' };
    return { text: 'Browsing the web', activityType: 'web' };
  }

  if (tool === 'local_browser' || tool.startsWith('browser_')) {
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

  if (tool === 'exec' || tool === 'terminal') {
    const cmd = (p.command as string) || '';
    const display = cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
    return { text: `Running \`${display}\``, activityType: 'terminal' };
  }
  if (tool === 'files') {
    const action = p.action as string | undefined;
    const path = (p.path as string) || (p.from as string) || 'file';
    switch (action) {
      case 'read': return { text: `Reading ${path}`, activityType: 'file' };
      case 'write': return { text: `Writing ${path}`, activityType: 'file' };
      case 'list': return { text: `Listing ${path || '/'}`, activityType: 'file' };
      case 'search': return { text: `Searching for ${p.query || 'files'}`, activityType: 'file' };
      case 'delete': return { text: `Deleting ${path}`, activityType: 'file' };
      default: return { text: `Files: ${action || 'operation'}`, activityType: 'file' };
    }
  }
  if (tool === 'document_guide') {
    return { text: `Loading ${p.format || 'document'} guide`, activityType: 'tool' };
  }
  if (tool === 'coding_guide') {
    return { text: 'Loading coding guide', activityType: 'tool' };
  }
  if (tool === 'local_app_guide') {
    return { text: 'Loading local app guide', activityType: 'tool' };
  }
  if (tool === 'web_design_guide') {
    return { text: 'Loading web design guide', activityType: 'tool' };
  }

  if (tool === 'read_file') {
    return { text: `Reading ${p.path || 'file'}`, activityType: 'file' };
  }
  if (tool === 'write_file') {
    return { text: `Writing ${p.path || 'file'}`, activityType: 'file' };
  }
  if (tool === 'list_directory') {
    return { text: `Listing ${p.path || '/'}`, activityType: 'file' };
  }
  if (tool === 'search_files') {
    return { text: `Searching for ${p.query || 'files'}`, activityType: 'file' };
  }
  if (tool === 'delete_file') {
    return { text: `Deleting ${p.path || 'file'}`, activityType: 'file' };
  }

  if (tool === 'memory') {
    const action = p.action as string | undefined;
    switch (action) {
      case 'recall': return { text: 'Checking memory', activityType: 'tool' };
      case 'list': return { text: 'Listing knowledge', activityType: 'tool' };
      case 'forget': return { text: 'Removing saved knowledge', activityType: 'tool' };
      default: return { text: `Knowledge: ${action || 'operation'}`, activityType: 'tool' };
    }
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
      return { text: `Web: ${shortGoal}`, activityType: 'web' };
    }
    const shortQuery = query && query.length > 50 ? query.slice(0, 50) + '...' : query;
    return { text: `Searching: ${shortQuery || 'web'}`, activityType: 'web' };
  }

  if (tool === 'web_fetch') {
    const url = p.url as string | undefined;
    const selector = typeof p.selector === 'string' ? p.selector.trim() : '';
    const loc = url ? formatActivityUrl(url) : 'page';
    return { text: selector ? `Fetching: ${loc} (${selector})` : `Fetching: ${loc}`, activityType: 'web' };
  }

  if (tool === 'remote_browser' || tool === 'web_scrape') {
    const url = p.url as string | undefined;
    const goal = p.goal as string | undefined;
    if (goal) {
      const shortGoal = goal.length > 55 ? `${goal.slice(0, 54)}…` : goal;
      return { text: `Browsing: ${shortGoal}`, activityType: 'web' };
    }
    if (url) return { text: `Browsing: ${formatActivityUrl(url)}`, activityType: 'web' };
    return { text: 'Browsing the web', activityType: 'web' };
  }

  if (tool === 'remote_browser_session') {
    const country = typeof p.proxy_country === 'string' && p.proxy_country ? p.proxy_country : '';
    return { text: country ? `Browser session (${country})` : 'Opening browser session', activityType: 'web' };
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

  if (tool === 'slack') {
    const action = p.action as string | undefined;
    const channel = p.channel as string | undefined;
    const text = p.text as string | undefined;
    switch (action) {
      case 'status':
        return { text: 'Checking Slack connection', activityType: 'tool' };
      case 'send_message': {
        const preview = text ? truncateActivityText(text, 52) : '';
        return { text: `Slack: sending${channel ? ` to ${channel}` : ''}${preview ? ` — ${preview}` : ''}`, activityType: 'tool' };
      }
      case 'send_card': {
        const title = p.title as string | undefined;
        return { text: `Slack card${channel ? ` → ${channel}` : ''}${title ? `: ${truncateActivityText(title, 40)}` : ''}`, activityType: 'tool' };
      }
      case 'list_channels':
        return { text: 'Listing Slack channels', activityType: 'tool' };
      case 'read_history':
        return { text: `Reading Slack${channel ? `: ${channel}` : ''}`, activityType: 'tool' };
      case 'update_message':
        return { text: 'Updating Slack message', activityType: 'tool' };
      case 'delete_message':
        return { text: 'Deleting Slack message', activityType: 'tool' };
      case 'add_reaction':
        return { text: 'Adding Slack reaction', activityType: 'tool' };
      case 'remove_reaction':
        return { text: 'Removing Slack reaction', activityType: 'tool' };
      default:
        return { text: `Slack: ${action || 'action'}`, activityType: 'tool' };
    }
  }

  if (tool === 'task_create') {
    const title = p.title as string | undefined;
    return { text: `Creating task: ${truncateActivityText(title || 'untitled', 56)}`, activityType: 'tool' };
  }
  if (tool === 'task_update') {
    const id = p.task_id;
    const status = p.status as string | undefined;
    return { text: `Updating task #${id}${status ? ` → ${status}` : ''}`, activityType: 'tool' };
  }
  if (tool === 'task_list') {
    return { text: p.show_all ? 'Listing all tasks' : 'Listing active tasks', activityType: 'tool' };
  }
  if (tool === 'task_get') {
    return { text: `Reading task #${p.task_id ?? '?'}`, activityType: 'tool' };
  }

  if (tool === 'schedule_task') {
    const title = p.title as string | undefined;
    const prompt = p.prompt as string | undefined;
    const head = title?.trim() || (prompt ? truncateActivityText(prompt, 48) : 'scheduled run');
    const repeat = p.repeat as string | undefined;
    return { text: repeat ? `Scheduling (repeat): ${truncateActivityText(head, 50)}` : `Scheduling: ${truncateActivityText(head, 50)}`, activityType: 'calendar' };
  }

  if (tool === 'agent_schedule') {
    const action = p.action as string | undefined;
    const title = p.title as string | undefined;
    const prompt = p.prompt as string | undefined;
    const head = title?.trim() || (prompt ? truncateActivityText(prompt, 48) : 'scheduled run');
    switch (action) {
      case 'list':
        return { text: 'Checking agent schedule', activityType: 'calendar' };
      case 'cancel':
        return { text: `Cancelling schedule${head ? `: ${truncateActivityText(head, 50)}` : ''}`, activityType: 'calendar' };
      case 'update':
        return { text: `Updating schedule${head ? `: ${truncateActivityText(head, 50)}` : ''}`, activityType: 'calendar' };
      default:
        return { text: head ? `Scheduling: ${truncateActivityText(head, 50)}` : 'Scheduling on agent calendar', activityType: 'calendar' };
    }
  }

  if (tool === 'tool_search') {
    const q = p.query as string | undefined;
    return { text: `Finding tools: ${truncateActivityText(q || '…', 56)}`, activityType: 'tool' };
  }

  if (tool === 'read_agent_output') {
    const id = p.id as string | undefined;
    return { text: `Reading stored output${id ? `: ${truncateActivityText(id, 40)}` : ''}`, activityType: 'tool' };
  }

  if (tool === 'app') {
    const action = p.action as string | undefined;
    const appId = p.app_id as string | undefined;
    const toolName = p.tool_name as string | undefined;
    switch (action) {
      case 'list': return { text: 'Listing apps', activityType: 'tool' };
      case 'call': return { text: `App call${appId ? ` (${appId})` : ''}${toolName ? `: ${toolName}` : ''}`, activityType: 'tool' };
      case 'search': return { text: `Searching app registry: ${truncateActivityText((p.query as string) || '…', 48)}`, activityType: 'tool' };
      case 'create_declarative': return { text: `Creating app: ${truncateActivityText((p.name as string) || appId || 'app', 48)}`, activityType: 'tool' };
      case 'update_declarative': return { text: `Updating app: ${truncateActivityText(appId || '…', 48)}`, activityType: 'tool' };
      case 'patch_component': return { text: `Updating component${appId ? `: ${appId}` : ''}`, activityType: 'tool' };
      case 'delete_local': return { text: `Deleting app: ${truncateActivityText(appId || '…', 48)}`, activityType: 'tool' };
      case 'get_app_state': return { text: `Reading app state${appId ? `: ${appId}` : ''}`, activityType: 'tool' };
      case 'set_app_state': return { text: `Updating app state${appId ? `: ${appId}` : ''}`, activityType: 'tool' };
      default: return { text: `Apps: ${action || 'action'}`, activityType: 'tool' };
    }
  }

  if (tool === 'github') {
    const action = p.action as string | undefined;
    const repo = p.repo as string | undefined;
    const base = repo ? `${action || 'github'} (${repo})` : (action || 'GitHub');
    return { text: `GitHub: ${base}`, activityType: 'tool' };
  }

  if (tool === 'arxiv') {
    const query = p.query as string | undefined;
    return { text: `arXiv: ${truncateActivityText(query || 'search', 56)}`, activityType: 'tool' };
  }

  if (tool === 'domain_intel') {
    const domain = p.domain as string | undefined;
    const action = p.action as string | undefined;
    return { text: `Domain ${action || 'lookup'}: ${truncateActivityText(domain || '…', 48)}`, activityType: 'tool' };
  }

  if (tool === 'calendar' || tool === 'agent_calendar') {
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
    return { text: `Delegating: ${shortGoal} (${count} helper${count === 1 ? '' : 's'})`, activityType: 'delegation' };
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
    const taskText = (p.task as string | undefined) || (p.goal as string | undefined);
    const agentType = p.agent_type as string | undefined;
    const body = (taskText || 'task').slice(0, 58) + ((taskText && taskText.length > 58) ? '…' : '');
    const label = agentType ? `${agentType}: ${body}` : body;
    return { text: `Starting helper: ${label}`, activityType: 'delegation' };
  }
  if (tool === 'spawn_agents') {
    const tasks = p.tasks as Array<{ agent_type?: string; task?: string }> | undefined;
    if (Array.isArray(tasks) && tasks.length > 0) {
      const first = tasks[0].task || tasks[0].agent_type || 'task';
      const preview = first.slice(0, 44) + (first.length > 44 ? '…' : '');
      const extra = tasks.length > 1 ? ` (+${tasks.length - 1} more)` : '';
      return { text: `Starting ${tasks.length} helpers: ${preview}${extra}`, activityType: 'delegation' };
    }
    return { text: 'Starting helpers', activityType: 'delegation' };
  }
  if (tool === 'wait_for_agents') {
    const ids = (p.child_ids as string[] | undefined) || (p.agent_ids as string[] | undefined);
    const n = ids?.length ?? 0;
    return { text: `Waiting for ${n} helper${n === 1 ? '' : 's'}`, activityType: 'delegation' };
  }
  if (tool === 'cancel_agents') {
    const ids = (p.child_ids as string[] | undefined) || (p.agent_ids as string[] | undefined);
    const n = ids?.length ?? 0;
    return { text: `Cancelling ${n} helper${n === 1 ? '' : 's'}`, activityType: 'delegation' };
  }
  if (tool === 'check_agent_status') return { text: 'Checking helper status', activityType: 'delegation' };
  if (tool === 'cancel_agent') return { text: 'Cancelling helper', activityType: 'delegation' };
  if (tool === 'list_active_agents') return { text: 'Listing active helpers', activityType: 'delegation' };
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

  if (tool === 'integrations') {
    const action = p.action as string | undefined;
    const tk = p.toolkit as string | undefined;
    const app = p.app_id as string | undefined;
    switch (action) {
      case 'composio_connect': return { text: tk ? `Connecting ${tk}` : 'Connecting integration', activityType: 'tool' };
      case 'composio_list': return { text: 'Listing Composio connections', activityType: 'tool' };
      case 'composio_finalize': return { text: 'Finalizing Composio connection', activityType: 'tool' };
      case 'composio_disconnect': return { text: tk ? `Disconnecting ${tk}` : 'Disconnecting integration', activityType: 'tool' };
      case 'registry_app_status': return { text: app ? `App connection status: ${app}` : 'App connection status', activityType: 'tool' };
      case 'registry_app_connect': return { text: app ? `Connecting app: ${app}` : 'Connecting registry app', activityType: 'tool' };
      case 'registry_app_disconnect': return { text: app ? `Disconnecting app: ${app}` : 'Disconnecting registry app', activityType: 'tool' };
      default: return { text: `Integrations: ${action || '…'}`, activityType: 'tool' };
    }
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

  return defaultToolActivity(tool, p);
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
    bitbucket: 'Bitbucket', gmail: 'Gmail',
    microsoft_teams: 'Microsoft Teams', dropbox: 'Dropbox',
  };
  return brands[lower] || (lower.charAt(0).toUpperCase() + lower.slice(1));
}

// ── Tool-to-window mapping ─────────────────────────────────────────────────
// Canonical routing lives in lib/toolWindowRouting. These thin wrappers are
// re-exported for backward compatibility so callers stay in sync.

export function toolToWindowType(tool: string, params?: Record<string, unknown>): WindowType | null {
  return routeToolToWindow(tool, params)?.type ?? null;
}

export { desktopActionToWindowType } from '../lib/toolWindowRouting';

export function describeToolFailure(
  tool: string,
  params: Record<string, unknown> | undefined,
  opts: { exitCode?: number; error?: string } = {},
): string {
  const exitSuffix = opts.exitCode != null ? ` · exit ${opts.exitCode}` : '';
  const rawError = opts.error || '';
  const skippedBecause = rawError.match(/^Skipped because (\S+) failed:\s*(.+)$/i);
  if (skippedBecause) {
    const [, rootTool, detail] = skippedBecause;
    return `Skipped (${rootTool} failed) · ${detail.slice(0, 100)}`;
  }
  if (/^Skipped: (a )?sibling tool /i.test(rawError)) {
    return `Skipped (blocked by earlier failure) · ${rawError.replace(/^Skipped: (a )?sibling tool /i, '').slice(0, 100)}`;
  }
  const sandboxDetail = rawError.replace(/^Sandbox error:\s*/i, '').slice(0, 100);

  if (tool === 'exec' || tool === 'terminal') {
    const cmd = (params?.command as string) || '';
    const display = cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
    if (sandboxDetail) return `Failed \`${display}\` · ${sandboxDetail}`;
    return `Failed \`${display}\`${exitSuffix}`;
  }
  if (tool === 'files') {
    const action = params?.action as string | undefined;
    const path = (params?.path as string) || (params?.from as string) || 'file';
    return `Failed files ${action || 'operation'} on ${path}${exitSuffix}`;
  }
  if (tool === 'browser' || tool === 'remote_browser' || tool.startsWith('browser_')) {
    const detail = rawError.slice(0, 140);
    return detail ? `Browser failed · ${detail}` : `Browser failed${exitSuffix}`;
  }
  if (tool === 'web_search' || tool === 'web_fetch') {
    const detail = rawError.slice(0, 120);
    return detail ? `Failed ${tool === 'web_search' ? 'search' : 'fetch'} · ${detail}` : `Failed ${tool}${exitSuffix}`;
  }
  return `Failed ${tool}${exitSuffix}`;
}

const WEB_BROWSER_TOOLS = new Set([
  'web_search', 'web_fetch', 'arxiv', 'domain_intel',
  'browser', 'remote_browser',
]);

/** True when an activity buffer should use ToolCallBanner polish (web/browser tools). */
export function isWebBrowserToolActivity(tool: string | undefined, activityType?: string): boolean {
  if (!tool && activityType !== 'web' && activityType !== 'browser') return false;
  if (tool && WEB_BROWSER_TOOLS.has(tool)) return true;
  if (tool?.startsWith('browser_')) return true;
  return activityType === 'web' || activityType === 'browser';
}

export type ToolActivityPatch = {
  toolCallId?: string;
  tool?: string;
  params?: Record<string, unknown>;
  exitCode?: number;
  error?: string;
};

export function patchToolActivityFailure<T extends {
  role: string;
  tool?: string;
  toolCallId?: string;
  activityType?: string;
  activityStatus?: string;
  content: string;
}>(
  messages: T[],
  opts: ToolActivityPatch,
): T[] {
  const { toolCallId, tool, params, exitCode, error } = opts;
  if (!toolCallId && !tool) return messages;

  let matchIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'activity') continue;
    if (toolCallId && msg.toolCallId === toolCallId) {
      matchIndex = i;
      break;
    }
    if (!toolCallId && tool && msg.tool === tool && msg.activityStatus !== 'failed') {
      matchIndex = i;
      break;
    }
    if (!toolCallId && tool === 'terminal' && msg.activityType === 'terminal' && msg.activityStatus !== 'failed') {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex < 0) return messages;

  const existing = messages[matchIndex];
  const content = describeToolFailure(
    existing.tool || tool || 'tool',
    params,
    { exitCode, error },
  );
  return messages.map((msg, index) => (
    index === matchIndex
      ? { ...msg, content, activityStatus: 'failed' as const, isError: true }
      : msg
  ));
}

export function patchToolActivitySuccess<T extends {
  role: string;
  tool?: string;
  toolCallId?: string;
  activityStatus?: string;
}>(
  messages: T[],
  opts: { toolCallId?: string; tool?: string },
): T[] {
  const { toolCallId, tool } = opts;
  if (!toolCallId && !tool) return messages;

  let matchIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'activity') continue;
    if (msg.activityStatus === 'failed' || msg.activityStatus === 'completed') continue;
    if (toolCallId && msg.toolCallId === toolCallId) {
      matchIndex = i;
      break;
    }
    if (!toolCallId && tool && msg.tool === tool) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex < 0) return messages;

  return messages.map((msg, index) => (
    index === matchIndex
      ? { ...msg, activityStatus: 'completed' as const }
      : msg
  ));
}

type StreamingToolActivity = {
  role: string;
  tool?: string;
  toolCallId?: string;
  toolCallIndex?: number;
  activityStatus?: string;
  activityType?: ChatMessage['activityType'];
  content: string;
  streamingArgsPreview?: string;
  iconPlatform?: string;
  iconUrl?: string;
};

export function upsertStreamingToolCallDelta<T extends StreamingToolActivity>(
  messages: T[],
  opts: {
    index: number;
    name: string;
    preview: string;
    content: string;
    activityType?: ChatMessage['activityType'];
  },
): T[] {
  const { index, name, preview, content, activityType } = opts;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'activity') continue;
    if (msg.toolCallIndex === index && msg.activityStatus === 'running') {
      return messages.map((m, idx) => (
        idx === i
          ? {
            ...m,
            tool: name,
            content,
            activityType: activityType || m.activityType,
            streamingArgsPreview: preview,
          }
          : m
      ));
    }
  }
  return [...messages, {
    role: 'activity',
    content,
    timestamp: new Date(),
    tool: name,
    activityType: activityType || 'tool',
    activityStatus: 'running',
    toolCallIndex: index,
    streamingArgsPreview: preview,
  } as unknown as T];
}

export function attachStreamingToolCallStart<T extends StreamingToolActivity>(
  messages: T[],
  opts: {
    tool: string;
    toolCallId?: string;
    content: string;
    activityType?: ChatMessage['activityType'];
    iconPlatform?: string;
    iconUrl?: string;
  },
): { messages: T[]; merged: boolean } {
  const { tool, toolCallId, content, activityType, iconPlatform, iconUrl } = opts;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'activity') continue;
    if (msg.activityStatus !== 'running') continue;
    if (msg.toolCallId) continue;
    if (msg.tool !== tool) continue;
    if (msg.toolCallIndex == null && !msg.streamingArgsPreview) continue;
    return {
      merged: true,
      messages: messages.map((m, idx) => (
        idx === i
          ? {
            ...m,
            tool,
            content,
            toolCallId,
            activityType: activityType || m.activityType,
            iconPlatform: iconPlatform ?? m.iconPlatform,
            iconUrl: iconUrl ?? m.iconUrl,
          }
          : m
      )),
    };
  }
  return { merged: false, messages };
}

/** Mark all trailing browser activity rows as failed after browser:error. */
export function patchTrailingBrowserActivitiesFailed<T extends {
  role: string;
  tool?: string;
  activityType?: string;
  activityStatus?: string;
  content: string;
  isError?: boolean;
  browserAction?: unknown;
}>(
  messages: T[],
  error: string,
): T[] {
  const failDetail = error.length > 120 ? `${error.slice(0, 117)}…` : error;
  let hitNonActivity = false;
  const indices = new Set<number>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'activity') {
      hitNonActivity = true;
      continue;
    }
    if (hitNonActivity) break;
    const isBrowser = msg.tool === 'browser'
      || msg.tool === 'remote_browser'
      || msg.activityType === 'web'
      || !!msg.browserAction;
    if (isBrowser && msg.activityStatus !== 'failed' && msg.activityStatus !== 'completed') {
      indices.add(i);
    }
  }
  if (indices.size === 0) {
    return [...messages, {
      role: 'activity' as const,
      content: `Browser failed · ${failDetail}`,
      activityType: 'web' as const,
      tool: 'browser',
      activityStatus: 'failed' as const,
      isError: true,
    } as T];
  }
  let first = true;
  return messages.map((msg, index) => {
    if (!indices.has(index)) return msg;
    const content = first
      ? (msg.content.startsWith('Failed') ? msg.content : `Failed · ${failDetail}`)
      : msg.content;
    first = false;
    return { ...msg, content, activityStatus: 'failed' as const, isError: true };
  });
}

/** Mark trailing in-progress browser activities as completed after browser:complete. */
export function patchTrailingBrowserActivitiesCompleted<T extends {
  role: string;
  tool?: string;
  activityType?: string;
  activityStatus?: string;
  browserAction?: unknown;
}>(messages: T[]): T[] {
  const indices = new Set<number>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'activity') break;
    const isBrowser = msg.tool === 'browser'
      || msg.tool === 'remote_browser'
      || msg.activityType === 'web'
      || !!msg.browserAction;
    if (isBrowser && msg.activityStatus !== 'failed' && msg.activityStatus !== 'completed') {
      indices.add(i);
    }
  }
  if (indices.size === 0) return messages;
  return messages.map((msg, index) => (
    indices.has(index) ? { ...msg, activityStatus: 'completed' as const } : msg
  ));
}

export function buildWebPreviewFromTabPayload(
  tool: string,
  payload: Record<string, unknown>,
): { kind: 'search' | 'fetch'; query?: string; url?: string; pageTitle?: string; snippet?: string; structuredSummary?: string; contentFormat?: 'json' | 'markdown'; resultCount?: number; results?: Array<{ title: string; url: string; snippet: string }>; truncated?: boolean } | undefined {
  if (tool === 'web_search' || tool === 'composio_search' || tool === 'discover' || tool === 'execute' || Array.isArray(payload.results)) {
    const results = (payload.results as Array<Record<string, unknown>> || []).slice(0, 3).map((r) => ({
      title: String(r.title ?? ''),
      url: String(r.url ?? ''),
      snippet: String(r.snippet ?? '').slice(0, 160),
    }));
    return {
      kind: 'search',
      query: typeof payload.query === 'string' ? payload.query : undefined,
      resultCount: Array.isArray(payload.results) ? payload.results.length : results.length,
      results,
    };
  }
  if (tool === 'browser') {
    const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl
      : typeof payload.url === 'string' ? payload.url : undefined;
    const done = payload.runPhase === 'complete';
    let pageTitle = 'Browser session';
    if (pageUrl) {
      try { pageTitle = new URL(pageUrl).hostname; } catch { pageTitle = pageUrl; }
    }
    return {
      kind: 'fetch',
      url: pageUrl,
      pageTitle,
      snippet: done ? 'Run finished.' : 'Live browser session in progress…',
    };
  }
  if (tool === 'web_fetch' || typeof payload.content === 'string') {
    const content = String(payload.content ?? '');
    const pageTitle = typeof payload.title === 'string' ? payload.title : undefined;
    const url = typeof payload.url === 'string' ? payload.url : undefined;
    const structured = detectStructuredContent(content, url);
    if (structured.format === 'json') {
      return {
        kind: 'fetch',
        url,
        pageTitle,
        contentFormat: 'json',
        structuredSummary: structured.summary,
        truncated: payload.truncated === true,
      };
    }
    return {
      kind: 'fetch',
      url,
      pageTitle,
      snippet: readerMarkdownSnippet(content, { pageTitle, url }),
      truncated: payload.truncated === true,
    };
  }
  return undefined;
}

export function attachWebPreviewToActivity<T extends {
  role: string;
  toolCallId?: string;
  webPreview?: unknown;
}>(
  messages: T[],
  toolCallId: string,
  preview: NonNullable<ReturnType<typeof buildWebPreviewFromTabPayload>>,
): T[] {
  let matchIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'activity' && messages[i].toolCallId === toolCallId) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex < 0) return messages;
  return messages.map((msg, index) => (
    index === matchIndex ? { ...msg, webPreview: preview } : msg
  ));
}

export type BrowserRunHistorySummary = {
  run_id: string;
  session_key: string | null;
  task: string | null;
  started_at: number;
  ended_at: number | null;
  status: 'running' | 'success' | 'error' | 'cancelled';
  live_url?: string | null;
};

type BrowserRunHistoryMessage = {
  role: string;
  content: string;
  timestamp: Date;
  tool?: string;
  activityType?: string;
  activityStatus?: string;
  browserAction?: { actionType?: string | null; url?: string };
};

/** Inject collapsed browser-run summaries when live progress events were not persisted. */
export function appendBrowserRunHistorySummaries<M extends BrowserRunHistoryMessage>(
  messages: M[],
  runs: BrowserRunHistorySummary[],
  sessionKey: string,
): M[] {
  const hasBrowserTimeline = messages.some((m) =>
    m.role === 'activity'
    && (m.tool === 'browser' || m.tool === 'remote_browser' || !!m.browserAction)
    && (m.content.startsWith('Browsing ') || !!m.browserAction),
  );
  if (hasBrowserTimeline) return messages;

  const firstMessageAt = messages[0]?.timestamp?.getTime?.() ?? null;
  if (firstMessageAt == null) return messages;

  const sessionRuns = runs
    .filter((r) => {
      if (r.session_key !== sessionKey || r.status === 'running') return false;
      const runAt = r.ended_at ?? r.started_at;
      return runAt >= firstMessageAt;
    })
    .sort((a, b) => (b.ended_at ?? b.started_at) - (a.ended_at ?? a.started_at))
    .slice(0, 5);
  if (sessionRuns.length === 0) return messages;

  const extras = sessionRuns.map((run) => {
    const task = (run.task || 'browser task').trim();
    const shortTask = task.length > 72 ? `${task.slice(0, 71)}…` : task;
    return {
      role: 'activity' as const,
      content: run.status === 'success'
        ? `Previous browser run · ${shortTask}`
        : `Previous browser run failed · ${shortTask}`,
      timestamp: new Date(run.ended_at ?? run.started_at),
      activityType: 'web' as const,
      tool: 'browser',
      activityStatus: run.status === 'success' ? 'completed' as const : 'failed' as const,
      browserAction: {
        actionType: 'task',
        ...(run.live_url ? { url: run.live_url } : {}),
      },
    } as M;
  });

  return [...messages, ...extras].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
