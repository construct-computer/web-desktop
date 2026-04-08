import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import * as api from '@/services/api';
import type { SessionInfo } from '@/services/api';
import { browserWS, agentWS, type AgentEvent } from '@/services/websocket';
import type { AgentWithConfig, WindowType } from '@/types';
import { useWindowStore } from './windowStore';
import { useEditorStore } from './editorStore';
import { openDocumentViewer } from './documentViewerStore';
import { useNotificationStore } from './notificationStore';
import { useAgentTrackerStore } from './agentTrackerStore';
import { useAppStore, localAppIframeRefs } from './appStore';
import { log } from '@/lib/logger';
import analytics from '@/lib/analytics';

// ── Extracted modules ──────────────────────────────────────────────────────
// Utility functions extracted to reduce this file's size.
// Types remain defined inline here (canonical source) for build compatibility.
export { authConnectNotifIds, pendingAuthCards, clearAuthCard, registerFrameRenderer, registerCanvasClear, getCachedFrameBlob } from './agentStoreUtils';

import { authConnectNotifIds, pendingAuthCards, saveAuthCards, loadAuthCards, getTabBlobCache, getFrameRenderers, getCanvasClearFns, findWindowForDaemonTab as _findWindowForDaemonTab, findWindowForTinyfish as _findWindowForTinyfish, findWindowForSubagent as _findWindowForSubagent } from './agentStoreUtils';

// Auth card persistence moved to agentStoreUtils.ts

const logger = log('Store');

export interface AskUserOption {
  label: string;
  description?: string;
  value: string;
}

export interface AskUserData {
  questionId: string;
  question: string;
  options: AskUserOption[];
  allowCustom: boolean;
  /** Set after the user picks an option */
  selectedValue?: string;
}

export interface ChatMessage {
  role: 'user' | 'agent' | 'activity' | 'system';
  content: string;
  timestamp: Date;
  /** For activity messages: which tool triggered it */
  tool?: string;
  /** For activity messages: icon hint for rendering */
  activityType?: 'browser' | 'tinyfish' | 'terminal' | 'file' | 'desktop' | 'calendar' | 'tool' | 'delegation' | 'background' | 'delegation-group' | 'consultation-group' | 'background-group' | 'orchestration-group';
  /** True for error/stopped/iteration-limit messages — rendered with error styling */
  isError?: boolean;
  /** True specifically for user-initiated stop — rendered with muted styling instead of error red */
  isStopped?: boolean;
  /** For delegation-group/consultation-group/background-group messages: links to tracker operation */
  operationId?: string;
  /** Interactive question data (rendered as clickable option cards) */
  askUser?: AskUserData;
  /** File paths attached to this message (uploaded to workspace/uploads/) */
  attachments?: string[];
  /** Source platform for external messages (used to render platform-specific UI). */
  source?: 'telegram' | 'slack' | 'email';
}

/** Build a human-readable activity description from a tool_call event */
function describeToolCall(tool: string, params?: Record<string, unknown>): { text: string; activityType: ChatMessage['activityType'] } {
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
        return { text: `Focusing browser window`, activityType: 'browser' };
      default:
        return { text: `Browser: ${action}`, activityType: 'browser' };
    }
  }

  // Terminal / exec / sandbox
  if (tool === 'exec' || tool === 'terminal') {
    const cmd = (p.command as string) || '';
    const display = cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
    return { text: `Running \`${display}\``, activityType: 'terminal' };
  }
  if (tool === 'sandbox_write_file') {
    return { text: `Writing ${p.path || 'file'} to sandbox`, activityType: 'terminal' };
  }
  if (tool === 'sandbox_read_file') {
    return { text: `Reading ${p.path || 'file'} from sandbox`, activityType: 'terminal' };
  }
  if (tool === 'save_to_workspace') {
    return { text: `Saving ${p.workspace_path || 'file'} to workspace`, activityType: 'file' };
  }
  if (tool === 'load_from_workspace') {
    return { text: `Loading ${p.workspace_path || 'file'} into sandbox`, activityType: 'file' };
  }
  if (tool === 'view_image') {
    return { text: `Viewing image ${p.path || ''}`, activityType: 'tool' };
  }
  if (tool === 'document_guide') {
    return { text: `Loading ${p.format || 'document'} guide`, activityType: 'tool' };
  }

  // Workspace file tools
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

  // Memory tool
  if (tool === 'memory') {
    const action = p.action as string | undefined;
    switch (action) {
      case 'remember': return { text: 'Storing memory', activityType: 'tool' };
      case 'recall': return { text: 'Recalling memories', activityType: 'tool' };
      case 'forget': return { text: 'Forgetting memory', activityType: 'tool' };
      default: return { text: `Memory: ${action || 'operation'}`, activityType: 'tool' };
    }
  }

  // Legacy file tools
  if (tool === 'read' || tool === 'file_read') {
    return { text: `Reading ${p.path || p.file || 'file'}`, activityType: 'file' };
  }
  if (tool === 'write' || tool === 'file_write') {
    return { text: `Writing ${p.path || p.file || 'file'}`, activityType: 'file' };
  }
  if (tool === 'edit' || tool === 'file_edit') {
    return { text: `Editing ${p.path || p.file || 'file'}`, activityType: 'file' };
  }
  if (tool === 'list') {
    return { text: `Listing ${p.path || p.directory || '.'}`, activityType: 'file' };
  }

  // Desktop tool
  if (tool === 'desktop') {
    const action = p.action as string | undefined;
    return { text: `Desktop: ${action || 'action'}`, activityType: 'desktop' };
  }

  // Web search — fast search or TinyFish scraping (backward compat)
  if (tool === 'web_search') {
    const query = p.query as string | undefined;
    const url = p.url as string | undefined;
    const goal = p.goal as string | undefined;
    // If url+goal present, it's a TinyFish scrape (backward compat)
    if (url && goal) {
      const shortGoal = goal.length > 50 ? goal.slice(0, 50) + '...' : goal;
      return { text: `TinyFish: ${shortGoal}`, activityType: 'tinyfish' };
    }
    const shortQuery = query && query.length > 50 ? query.slice(0, 50) + '...' : query;
    return { text: `Searching: ${shortQuery || 'web'}`, activityType: 'tool' };
  }
  // Remote browser (TinyFish cloud browser automation) (backward compat for web_scrape)
  if (tool === 'remote_browser' || tool === 'web_scrape') {
    const url = p.url as string | undefined;
    const goal = p.goal as string | undefined;
    if (url && goal) {
      const shortGoal = goal.length > 50 ? goal.slice(0, 50) + '...' : goal;
      return { text: `Scraping: ${shortGoal}`, activityType: 'tinyfish' };
    }
    return { text: `Web scraping${url ? `: ${url}` : ''}`, activityType: 'tinyfish' };
  }

  // Notify tool
  if (tool === 'notify') {
    return { text: `Notification: ${p.title || 'alert'}`, activityType: 'desktop' };
  }

  // Google Drive tool
  if (tool === 'google_drive') {
    const action = p.action as string | undefined;
    const filePath = p.file_path as string | undefined;
    const query = p.query as string | undefined;
    switch (action) {
      case 'status':
        return { text: 'Checking Google Drive status', activityType: 'file' };
      case 'list':
        return { text: 'Listing Google Drive files', activityType: 'file' };
      case 'upload': {
        const name = filePath ? filePath.split('/').pop() : 'file';
        return { text: `Uploading ${name} to Google Drive`, activityType: 'file' };
      }
      case 'download':
        return { text: `Downloading file from Google Drive`, activityType: 'file' };
      case 'search':
        return { text: `Searching Drive for "${query || '...'}"`, activityType: 'file' };
      default:
        return { text: `Google Drive: ${action || 'operation'}`, activityType: 'file' };
    }
  }

  // Email tool
  if (tool === 'email') {
    const action = p.action as string | undefined;
    const to = p.to as string | undefined;
    const subject = p.subject as string | undefined;
    const query = p.query as string | undefined;
    switch (action) {
      case 'status':
        return { text: 'Checking email status', activityType: 'tool' };
      case 'send': {
        const shortSubject = subject ? (subject.length > 40 ? subject.slice(0, 40) + '...' : subject) : '';
        return { text: `Sending email${to ? ` to ${to}` : ''}${shortSubject ? `: "${shortSubject}"` : ''}`, activityType: 'tool' };
      }
      case 'reply':
        return { text: 'Replying to email', activityType: 'tool' };
      case 'inbox':
        return { text: 'Checking inbox', activityType: 'tool' };
      case 'thread':
        return { text: 'Reading email thread', activityType: 'tool' };
      case 'search':
        return { text: `Searching emails for "${query || '...'}"`, activityType: 'tool' };
      default:
        return { text: `Email: ${action || 'operation'}`, activityType: 'tool' };
    }
  }

  // Agent's local calendar (task scheduler)
  if (tool === 'calendar') {
    const action = p.action as string | undefined;
    const summary = p.summary as string | undefined;
    const shortSummary = summary ? (summary.length > 40 ? summary.slice(0, 40) + '...' : summary) : '';

    switch (action) {
      case 'list_events':
        return { text: 'Checking task schedule', activityType: 'calendar' as const };
      case 'get_event':
        return { text: 'Reading scheduled task', activityType: 'calendar' as const };
      case 'create_event':
        return { text: `Scheduling task${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' as const };
      case 'update_event':
        return { text: `Updating task${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' as const };
      case 'delete_event':
        return { text: 'Removing scheduled task', activityType: 'calendar' as const };
      case 'quick_add':
        return { text: 'Quick-scheduling task', activityType: 'calendar' as const };
      default:
        return { text: `Task schedule: ${action || 'operation'}`, activityType: 'calendar' as const };
    }
  }

  // User's Google Calendar
  if (tool === 'google_calendar') {
    const action = p.action as string | undefined;
    const summary = p.summary as string | undefined;
    const shortSummary = summary ? (summary.length > 40 ? summary.slice(0, 40) + '...' : summary) : '';

    switch (action) {
      case 'status':
        return { text: 'Checking Google Calendar connection', activityType: 'calendar' as const };
      case 'list_events':
        return { text: 'Checking Google Calendar', activityType: 'calendar' as const };
      case 'get_event':
        return { text: 'Reading Google Calendar event', activityType: 'calendar' as const };
      case 'create_event':
        return { text: `Adding to Google Calendar${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' as const };
      case 'update_event':
        return { text: `Updating Google Calendar event${shortSummary ? `: "${shortSummary}"` : ''}`, activityType: 'calendar' as const };
      case 'delete_event':
        return { text: 'Removing Google Calendar event', activityType: 'calendar' as const };
      case 'quick_add':
        return { text: 'Quick-adding to Google Calendar', activityType: 'calendar' as const };
      case 'list_calendars':
        return { text: 'Listing Google calendars', activityType: 'calendar' as const };
      default:
        return { text: `Google Calendar: ${action || 'operation'}`, activityType: 'calendar' as const };
    }
  }

  // Telegram tool
  if (tool === 'telegram') {
    const action = p.action as string | undefined;
    const username = p.username as string | undefined;
    switch (action) {
      case 'status':
        return { text: 'Checking Telegram status', activityType: 'tool' };
      case 'send_message':
        return { text: `Sending Telegram message${username ? ` to @${username}` : ''}`, activityType: 'tool' };
      case 'send_notification':
        return { text: 'Sending Telegram notification', activityType: 'tool' };
      default:
        return { text: `Telegram: ${action || 'operation'}`, activityType: 'tool' };
    }
  }

  // Audit log tool
  if (tool === 'audit_log') {
    const action = p.action as string | undefined;
    const query = p.query as string | undefined;
    switch (action) {
      case 'list':
        return { text: `Reviewing activity history${query ? ` for "${query}"` : ''}`, activityType: 'tool' };
      case 'stats':
        return { text: 'Checking activity stats', activityType: 'tool' };
      default:
        return { text: `Audit log: ${action || 'query'}`, activityType: 'tool' };
    }
  }

  // Delegate task (delegation orchestration)
  if (tool === 'delegate_task') {
    const goal = p.goal as string | undefined;
    const subtasks = p.subtasks;
    const count = Array.isArray(subtasks) ? subtasks.length : '?';
    const shortGoal = goal ? (goal.length > 50 ? goal.slice(0, 50) + '...' : goal) : 'complex task';
    return { text: `Delegating: ${shortGoal} (${count} subagents)`, activityType: 'delegation' };
  }

  // Consult advisors (Consultation)
  if (tool === 'consult_experts') {
    const question = p.question as string | undefined;
    const shortQ = question ? (question.length > 50 ? question.slice(0, 50) + '...' : question) : 'question';
    return { text: `Consulting advisors: ${shortQ}`, activityType: 'delegation' };
  }

  // Background task
  if (tool === 'background_task') {
    const action = p.action as string | undefined;
    const goal = p.goal as string | undefined;
    switch (action) {
      case 'spawn': {
        const shortGoal = goal ? (goal.length > 50 ? goal.slice(0, 50) + '...' : goal) : 'task';
        return { text: `Launching background task: ${shortGoal}`, activityType: 'background' };
      }
      case 'status':
        return { text: 'Checking background task status', activityType: 'background' };
      case 'cancel':
        return { text: 'Cancelling background task', activityType: 'background' };
      case 'list':
        return { text: 'Listing background tasks', activityType: 'background' };
      default:
        return { text: `Background task: ${action || 'operation'}`, activityType: 'background' };
    }
  }

  // ── Orchestrator tools ──
  if (tool === 'spawn_agent') {
    const goal = p.goal as string | undefined;
    const shortGoal = goal ? (goal.length > 60 ? goal.slice(0, 60) + '...' : goal) : 'task';
    return { text: `Spawning agent: ${shortGoal}`, activityType: 'delegation' };
  }
  if (tool === 'wait_for_agents') {
    const ids = p.agent_ids as string[] | undefined;
    return { text: `Waiting for ${ids?.length || ''} agent${ids?.length === 1 ? '' : 's'} to complete`, activityType: 'delegation' };
  }
  if (tool === 'check_agent_status') {
    return { text: `Checking agent status`, activityType: 'delegation' };
  }
  if (tool === 'cancel_agent') {
    return { text: `Cancelling agent`, activityType: 'delegation' };
  }
  if (tool === 'list_active_agents') {
    return { text: `Listing active agents`, activityType: 'delegation' };
  }
  if (tool === 'update_plan') {
    const action = p.action as string | undefined;
    if (action === 'create') {
      const goal = p.goal as string | undefined;
      return { text: `Planning: ${goal?.slice(0, 50) || 'task'}`, activityType: 'tool' };
    }
    return { text: `Updating plan`, activityType: 'tool' };
  }
  if (tool === 'add_observation') {
    return { text: `Recording observation`, activityType: 'tool' };
  }
  // respond_directly should not show as a tool bubble — it's handled via text_delta
  if (tool === 'respond_directly' || tool === 'respond_to_user') {
    return { text: '', activityType: 'tool' };
  }
  // ask_user — interactive question
  if (tool === 'ask_user') {
    const question = p.question as string | undefined;
    const short = question && question.length > 50 ? question.slice(0, 50) + '...' : question;
    return { text: `Asking: ${short || 'question'}`, activityType: 'tool' };
  }

  // Composio tool — show the actual toolkit/action instead of "Using composio"
  if (tool === 'composio') {
    const action = p.action as string | undefined;
    const toolSlug = p.tool_slug as string | undefined;
    const query = p.query as string | undefined;
    const toolkit = p.toolkit as string | undefined;

    switch (action) {
      case 'execute': {
        if (toolSlug) {
          return { text: formatComposioSlug(toolSlug), activityType: 'tool' };
        }
        return { text: 'Executing Composio tool', activityType: 'tool' };
      }
      case 'search': {
        const shortQuery = query && query.length > 40 ? query.slice(0, 40) + '...' : query;
        return { text: `Searching apps${shortQuery ? `: "${shortQuery}"` : ''}`, activityType: 'tool' };
      }
      case 'status': {
        const name = toolkit ? titleCaseToolkit(toolkit) : 'app';
        return { text: `Checking ${name} connection`, activityType: 'tool' };
      }
      default:
        return { text: `Composio: ${action || 'operation'}`, activityType: 'tool' };
    }
  }

  // Generic fallback
  return { text: `Using ${tool}`, activityType: 'tool' };
}

/** Convert a Composio slug like NOTION_CREATE_A_NEW_PAGE → "Notion: create a new page" */
function formatComposioSlug(slug: string): string {
  const idx = slug.indexOf('_');
  if (idx === -1) return slug;
  const toolkitRaw = slug.slice(0, idx).toLowerCase();
  const actionRaw = slug.slice(idx + 1).toLowerCase().replace(/_/g, ' ');
  return `${titleCaseToolkit(toolkitRaw)}: ${actionRaw}`;
}

/** Extract a display-friendly tool name from composio params for badges/pills.
 *  e.g. { tool_slug: "NOTION_CREATE_A_NEW_PAGE" } → "notion"
 *       { toolkit: "jira" } → "jira"
 *       { query: "..." } → "composio" */
function composioDisplayTool(params?: Record<string, unknown>): string {
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
function titleCaseToolkit(name: string): string {
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

import { isTextFile, isDocumentFile, openAuthRedirect } from '../lib/utils';

// ── Auto-close infrastructure ─────────────────────────────────────
// Windows auto-opened by agent tool calls close after a grace period
// of inactivity. User-opened windows are never auto-closed.

const autoCloseTimers = new Map<string, ReturnType<typeof setTimeout>>();
const autoOpenedWindowIds = new Set<string>();

/** Grace periods per window type (ms). Longer for tools the agent chains. */
const WINDOW_CLOSE_GRACE: Record<string, number> = {
  terminal: 8000,
  browser: 10000,
  editor: 5000,
  files: 5000,
  'document-viewer': 5000,
  email: 10000,
  calendar: 5000,
};

function scheduleAutoClose(windowType: string) {
  cancelAutoClose(windowType);
  const delay = WINDOW_CLOSE_GRACE[windowType] || 5000;
  autoCloseTimers.set(windowType, setTimeout(() => {
    autoCloseTimers.delete(windowType);
    const wStore = useWindowStore.getState();
    const toClose = wStore.windows.filter(
      (w) => w.type === windowType && autoOpenedWindowIds.has(w.id),
    );
    for (const w of toClose) {
      wStore.closeWindow(w.id);
      autoOpenedWindowIds.delete(w.id);
    }
  }, delay));
}

function cancelAutoClose(windowType: string) {
  const timer = autoCloseTimers.get(windowType);
  if (timer) {
    clearTimeout(timer);
    autoCloseTimers.delete(windowType);
  }
}

function closeAllAutoOpened(delayMs = 2000) {
  // Cancel all pending timers
  for (const [type] of autoCloseTimers) cancelAutoClose(type);
  // Close after a short delay so user can see final state
  setTimeout(() => {
    const wStore = useWindowStore.getState();
    for (const wId of autoOpenedWindowIds) {
      const win = wStore.windows.find((w) => w.id === wId);
      if (win) wStore.closeWindow(wId);
    }
    autoOpenedWindowIds.clear();
  }, delayMs);
}

// Map tool names to the window type they should open on the desktop.
// Every tool that produces user-visible activity should map here.
function toolToWindowType(tool: string, params?: Record<string, unknown>): WindowType | null {
  // ── Browser ──────────────────────────────────────────────────────
  if (tool === 'browser' || tool.startsWith('browser_')) return 'browser';
  // web_scrape/web_search open browser via tinyfish:start event, not here

  // ── Terminal / Sandbox ───────────────────────────────────────────
  if (tool === 'exec' || tool === 'terminal') return 'terminal';
  // sandbox file ops are silent (prep steps — terminal is already open from terminal command)
  // save_to_workspace / load_from_workspace are transfer ops (silent)

  // ── Files / Workspace ────────────────────────────────────────────
  // Only open files window for browsing/reading — writes and deletes happen silently
  if (tool === 'read_file') return 'files';
  if (tool === 'list_directory') return 'files';
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

  // ── Google Drive ─────────────────────────────────────────────────
  if (tool === 'google_drive' || tool === 'drive_list' || tool === 'drive_download'
      || tool === 'drive_upload' || tool === 'drive_search') return 'files';

  // ── Calendar ─────────────────────────────────────────────────────
  if (tool === 'agent_calendar' || tool === 'calendar' || tool === 'google_calendar'
      || tool === 'create_calendar_event' || tool === 'update_calendar_event'
      || tool === 'delete_calendar_event' || tool === 'list_calendar_events') return 'calendar';

  // ── Email ────────────────────────────────────────────────────────
  if (tool === 'email' || tool === 'send_email' || tool === 'read_email') return 'email';

  // ── No window (silent tools) ──────────────────────────────────────
  // memory, sandbox_write/read_file, save/load_from_workspace, write_file,
  // edit_file, delete_file, search_files, move_file, view_image, document_guide,
  // desktop, ask_user, notify, slack, telegram, spawn_agent, schedule_task,
  // task_*, composio, tool_search, read_agent_output, web_search, web_scrape
  return null;
}

// Map desktop actions to window types
function desktopActionToWindowType(action: string): WindowType | null {
  switch (action) {
    case 'open_browser': return 'browser';
    case 'open_terminal': return 'terminal';
    case 'open_file':
    case 'open_editor': return 'editor';
    case 'open_settings': return 'settings';
    case 'open_calendar': return 'calendar';
    case 'open_email': return 'email';
    case 'open_files': return 'files';
    case 'open_memory': return 'memory';
    case 'open_auditlogs': return 'auditlogs';
    case 'open_about': return 'about';
    default: return null;
  }
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  /** If set, this tab belongs to a delegation subagent or background task. */
  subagentId?: string;
  /** Human-readable label for the subagent that owns this tab. */
  subagentLabel?: string;
  /** Target workspace for this tab's window (set by delegation workspace routing). */
  workspaceId?: string;
}

export interface SystemStats {
  cpuPercent: number;
  cpuCount: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  pids: number;
  netInSpeed: number;   // bytes/sec (download)
  netOutSpeed: number;  // bytes/sec (upload)
  netInBytes: number;   // cumulative (for delta tracking)
  netOutBytes: number;  // cumulative (for delta tracking)
  uptime: number;       // seconds
}

export interface TodoItem {
  id: number;
  text: string;
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
}

export interface TodoListState {
  goal: string;
  items: TodoItem[];
}

interface BrowserState {
  url: string;
  title: string;
  screenshot: string | null;
  isLoading: boolean;
  connected: boolean;
  tabs: BrowserTab[];
  activeTabId: string | null;
  /**
   * Per-subagent TinyFish live browser stream URLs. Key is subagentId or 'main'.
   * When a tab's subagentId (or 'main' for the main agent) has an entry here,
   * the viewport shows the TinyFish iframe instead of a screenshot.
   */
  tinyfishStreams: Record<string, string>;
  /** Which tab the daemon currently has active (from tabs WS poll). */
  daemonActiveTabId: string | null;
  /** Subagent tab annotations keyed by tab index. Stable across daemon polls. */
  /**
   * Maps daemon tab index → subagent annotation. Also includes a parallel
   * subagentId-keyed lookup for stable matching when indices drift.
   */
  subagentTabMap: Record<number, { subagentId: string; subagentLabel?: string; workspaceId?: string }>;
  /** Reverse lookup: subagentId → annotation (used when index-based lookup fails due to drift). */
  subagentAnnotations: Record<string, { subagentId: string; subagentLabel?: string; workspaceId?: string; hintIndex: number }>;
  /** Session key hint for the next browser window created by the reconciler.
   *  Used to resolve the correct workspace via resolveWorkspaceForSession(). */
  pendingBrowserSessionKey?: string;
  /** Set of daemon tab IDs (or cache keys) that have received at least one frame.
   *  Used to decide per-window whether to show canvas or placeholder. */
  tabsWithFrames: Record<string, true>;
}


/** State of a per-platform agent execution lane. */
export interface PlatformAgentState {
  platform: string;
  running: boolean;
  currentTask?: string;
  sessionKey?: string;
  startedAt?: number;
  queueLength: number;
  /** The tool currently being executed by this platform agent. */
  currentTool?: string;
  /** Recent tool activity log for display in the tracker. */
  toolHistory?: Array<{ tool: string; timestamp: number }>;
  /** Current thinking/activity text (what the agent is doing right now). */
  thinking?: string | null;
  /** Step progress (current iteration / max). */
  stepProgress?: { step: number; maxSteps: number } | null;
  /** Accumulated response text from the agent. */
  responseText?: string;
  /** Error message if the agent failed. */
  error?: string | null;
  /** Per-session todo list items. */
  todoItems?: Array<{ id: number; text: string; status: string }>;
  /** Todo list goal. */
  todoGoal?: string;
  /** Timestamp when the agent finished (for history). */
  completedAt?: number;
  /** Per-agent chat messages (tool activities, delegation cards, etc.) */
  chatMessages?: ChatMessage[];
  /** Which apps this agent is actively using (for dock indicators). */
  agentActivity?: Record<string, boolean>;
}

interface ComputerStore {
  // The user's single computer (instance + container)
  computer: AgentWithConfig | null;
  instanceId: string | null;
  isLoading: boolean;
  error: string | null;

  // API key configuration status
  hasApiKey: boolean;
  hasTinyfishKey: boolean;
  hasAgentmailKey: boolean;
  configChecked: boolean;
  /** Platform-provided shared keys (users don't need to configure these). */
  platformKeys: { hasOpenrouter: boolean; hasTinyfish: boolean; hasAgentmail: boolean };

  // Real-time state for the computer
  browserState: BrowserState;
  chatMessages: ChatMessage[];
  /** True while switching sessions — prevents empty state flash in MessageList */
  sessionSwitching: boolean;
  agentThinking: string | null;
  /** Streaming thinking text from the LLM. null = not thinking, '' = started (no tokens yet). */
  agentThinkingStream: string | null;
  /** Base64 data URLs for image attachments pending send (cleared on send). */
  pendingImageData: string[];
  /** Session-level token usage tracking */
  sessionTokens: { prompt: number; completion: number; total: number; cost: number };
  /** True while the agent loop is actively running (may span many tool iterations) */
  agentRunning: boolean;
  /** Current agent status string from backend (thinking, executing, compacting, etc.) */
  agentStatusLabel: string | null;
  /** Set of session keys with active agent loops (for multi-session typing indicators) */
  runningSessions: Set<string>;
  agentConnected: boolean;
  /** True when usage cap exceeded and agent is on the lite fallback model. */
  isOnLiteModel: boolean;
  agentActivity: Record<string, boolean>; // which apps the agent is actively using
  systemStats: SystemStats | null;
  /** Live todo list from the agent's todo_list tool */
  todoList: TodoListState | null;
  /** Number of user messages waiting in the agent's inbox */
  queuedMessageCount: number;
  /** Current task progress (step-level tracking) */
  taskProgress: {
    taskId: string;
    step: number;
    maxSteps: number;
    continuation: number;
    maxContinuations: number;
    currentTool?: string;
  } | null;

  /** Per-platform agent execution status (desktop, slack, telegram, calendar). */
  platformAgents: Record<string, PlatformAgentState>;

  /** Number of unread emails received while the email window is not focused. */
  emailUnreadCount: number;

  /** Number of pending Slack approval requests (for badge display). */
  pendingApprovalCount: number;

  /** Real-time terminal output chunks from sandbox execStream. */
  terminalOutputSeq: number;

  // Chat sessions
  chatSessions: SessionInfo[];
  activeSessionKey: string;

  // Actions
  fetchComputer: () => Promise<void>;
  checkConfigStatus: () => Promise<void>;
  updateComputer: (data: { openrouterApiKey?: string; tinyfishApiKey?: string; agentmailApiKey?: string; agentmailInboxUsername?: string; model?: string; ownerName?: string; ownerEmail?: string; agentName?: string }) => Promise<boolean>;

  // Subscriptions
  subscribeToComputer: () => void;
  unsubscribeFromComputer: () => void;

  // Chat
  loadChatHistory: () => Promise<void>;
  sendChatMessage: (content: string, attachments?: string[]) => void;
  /** Respond to an ask_user interactive question. */
  respondToAskUser: (questionId: string, value: string, label: string) => void;
  /** Set the message being replied to (shown as quote above input). */
  setReplyingTo: (msg: ChatMessage | null) => void;
  /** The message being replied to. */
  replyingTo: ChatMessage | null;
  /** Stop all running agent lanes (global abort). */
  stopAgent: () => void;
  /** Stop a specific platform's lanes (e.g. 'slack', 'telegram'). */
  stopPlatformAgent: (platform: string) => void;
  /** Stop the current desktop chat session lane only. */
  stopChatSession: () => void;
  /** Clear all chat history and start fresh. */
  clearChatHistory: () => void;

  // Sessions
  loadSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  switchSession: (key: string) => Promise<void>;
  deleteSession: (key: string) => Promise<void>;
  renameSession: (key: string, title: string) => Promise<void>;

  // Browser
  setBrowserFrame: (frame: Blob, forceDisplay?: boolean, subagentId?: string, taggedTabId?: string) => void;
  /** Open a new browser window (creates daemon tab). Returns the window ID. */
  openBrowserWindow: (url?: string) => string;
  /** Close a browser window (closes daemon tab). */
  closeBrowserWindow: (windowId: string) => void;
  /** Called when a browser window gains focus — switches daemon to that tab. */
  focusBrowserWindow: (windowId: string) => void;
  /** Navigate the focused browser window to a URL. */
  navigateTo: (url: string, windowId?: string) => void;
  // Email
  clearEmailUnread: () => void;

  // Slack permissions
  clearPendingApprovals: () => void;

  // Event handlers
  handleAgentEvent: (event: AgentEvent) => void;
}

/**
 * Safety timeout: if agentRunning is set but no agent events arrive within
 * this period, reset the running state. Prevents the UI from being stuck in
 * "Working..." forever when a message was sent but the response never came
 * (e.g. WS reconnection lost the events).
 */
import { AGENT_RUNNING_TIMEOUT_MS, MAX_CHAT_MESSAGES, STORAGE_KEYS as CONFIG_STORAGE_KEYS, TOAST_DURATION_MS, TOAST_DURATION_LONG_MS } from '@/lib/config';

/** Append a message and trim the array if it exceeds the cap. */
function appendMessage(messages: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  // Deduplicate consecutive identical error messages
  if (msg.isError && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.isError && last.content === msg.content) {
      return messages;
    }
  }
  const next = [...messages, msg];
  return next.length > MAX_CHAT_MESSAGES ? next.slice(next.length - MAX_CHAT_MESSAGES) : next;
}
let agentRunningTimer: ReturnType<typeof setTimeout> | null = null;
/** Guard: true while loadChatHistory is in-flight. Used to suppress
 *  text_delta events that would otherwise create duplicate message bubbles. */
let chatHistoryLoading = false;
/** In-memory cache of chat messages per session for instant switching. */
const sessionMessageCache = new Map<string, ChatMessage[]>();
/** Guard: collapse concurrent instance provisioning/refresh fetches. */
let fetchComputerPromise: Promise<void> | null = null;
/** Tracks which instance already has its desktop runtime bootstrap installed. */
let subscribedInstanceId: string | null = null;

function resetAgentRunningTimer(get: () => ComputerStore, set: (partial: Partial<ComputerStore>) => void) {
  if (agentRunningTimer) clearTimeout(agentRunningTimer);
  agentRunningTimer = setTimeout(() => {
    agentRunningTimer = null;
    const { agentRunning } = get();
    if (agentRunning) {
      // Don't reset if there are active delegations/consultations/background
      // tasks — the main agent is blocked waiting for subagents, not dead.
      const ops = useAgentTrackerStore.getState().operations;
      const hasActiveOps = Object.values(ops).some(
        (op) => op.status === 'running' || op.status === 'aggregating',
      );
      if (hasActiveOps) {
        // Subagents are still working — reschedule instead of resetting
        resetAgentRunningTimer(get, set);
        return;
      }
      // Also check if the orchestrator is waiting for child agents
      // (wait_for_agents or spawn_agent are long-running orchestrator tools)
      const pa = get().platformAgents?.['desktop'];
      const currentTool = pa?.currentTool;
      if (currentTool === 'wait_for_agents' || currentTool === 'spawn_agent') {
        resetAgentRunningTimer(get, set);
        return;
      }
      logger.warn('Agent running timeout — resetting state');
      set({
        agentThinking: null,
        agentRunning: false,
        agentActivity: {},
      });
    }
  }, AGENT_RUNNING_TIMEOUT_MS);
}

function clearAgentRunningTimer() {
  if (agentRunningTimer) {
    clearTimeout(agentRunningTimer);
    agentRunningTimer = null;
  }
}

/**
 * Module-level binary frame cache. Keyed by daemon tab ID (e.g. 'tab-0')
 * or subagentId for agent-sourced screenshots.
 * Stores raw Blob objects — used with the per-window canvas rendering
 * pipeline that bypasses React state entirely.
 */
// Frame cache, renderers and clear fns now live in agentStoreUtils.ts
// Alias for backward compat within this file (used in ~15 places)
const _tabBlobCache = getTabBlobCache();
const _frameRenderers = getFrameRenderers();
const _canvasClearFns = getCanvasClearFns();

/**
 * Per-window frame renderers — each BrowserWindow registers its own renderer
 * keyed by window ID. Frames are routed to the correct window based on the
 * daemon tab ↔ window mapping stored in window metadata.
 */
// Frame caching and window helpers now imported from agentStoreUtils.ts
// Module-level cache maps accessed via getTabBlobCache(), getFrameRenderers(), getCanvasClearFns()

/** Find the window ID that owns a given daemon tab ID */
function findWindowForDaemonTab(daemonTabId: string): string | undefined {
  const windows = useWindowStore.getState().windows;
  return windows.find(w => w.type === 'browser' && w.metadata?.daemonTabId === daemonTabId)?.id;
}

/** Find the window ID for a TinyFish subagent */
function findWindowForTinyfish(subagentId: string): string | undefined {
  const windows = useWindowStore.getState().windows;
  return windows.find(w => w.type === 'browser' && w.metadata?.tinyfishSubagentId === subagentId)?.id;
}

/** Find the window ID for a subagent browser tab */
function findWindowForSubagent(subagentId: string): string | undefined {
  const windows = useWindowStore.getState().windows;
  return windows.find(w => w.type === 'browser' && w.metadata?.subagentId === subagentId)?.id;
}

export const useComputerStore = create<ComputerStore>()(
  subscribeWithSelector((set, get) => ({
    computer: null,
    instanceId: null,
    isLoading: false,
    error: null,
    hasApiKey: false,
    hasTinyfishKey: false,
    hasAgentmailKey: false,
    configChecked: false,
    platformKeys: { hasOpenrouter: false, hasTinyfish: false, hasAgentmail: false },
    browserState: {
      url: '',
      title: '',
      screenshot: null,
      isLoading: false,
      connected: false,
      tabs: [],
      activeTabId: null,
      tinyfishStreams: {},
      daemonActiveTabId: null,
      subagentTabMap: {},
      subagentAnnotations: {},
      tabsWithFrames: {},
    },
    chatMessages: [],
    replyingTo: null as ChatMessage | null,
    sessionSwitching: false,
    agentThinking: null,
    agentThinkingStream: null,
    pendingImageData: [],
    sessionTokens: { prompt: 0, completion: 0, total: 0, cost: 0 },
    agentRunning: false,
    agentStatusLabel: null,
    runningSessions: new Set<string>(),
    agentConnected: false,
    isOnLiteModel: false,
    agentActivity: {},
    systemStats: null,
    todoList: null,
    queuedMessageCount: 0,
    taskProgress: null,
    platformAgents: {},
    emailUnreadCount: 0,
    pendingApprovalCount: 0,
    terminalOutputSeq: 0,
    chatSessions: [],
    activeSessionKey: 'default',

    fetchComputer: async () => {
      if (fetchComputerPromise) return fetchComputerPromise;

      fetchComputerPromise = (async () => {
        const { computer: existing } = get();
        // Only show full loading state on initial fetch; subsequent calls refresh silently
        if (!existing) {
          set({ isLoading: true, error: null });
        } else {
          set({ error: null });
        }

        const result = await api.getInstance();

        if (result.success) {
          const { instance } = result.data;

          // Read agent config (name, email)
          let agentIdentityName = '';
          let agentmailEmail = '';
          try {
            const cfg = await api.getAgentConfig(instance.id);
            if (cfg.success) {
              if (cfg.data.agent_name) agentIdentityName = cfg.data.agent_name;
              if (cfg.data.agentmail_inbox_username) {
                agentmailEmail = cfg.data.agentmail_inbox_username.includes('@')
                  ? cfg.data.agentmail_inbox_username
                  : `${cfg.data.agentmail_inbox_username}@agentmail.to`;
              }
            }
          } catch { /* agent may not be ready yet */ }

          const computer: AgentWithConfig = {
            id: instance.id,
            userId: instance.userId,
            name: 'Computer',
            description: 'Your personal AI computer',
            status: instance.status as AgentWithConfig['status'],
            createdAt: instance.createdAt,
            updatedAt: instance.createdAt,
            config: {
              model: '',
              goals: [],
              schedules: [],
              identityName: agentIdentityName || 'Construct Agent',
              identityDescription: 'Your AI assistant',
              agentmailEmail,
            },
          };

          set({
            computer,
            instanceId: instance.id,
            isLoading: false,
          });

          analytics.computerProvisioned();

          // Auto-connect WebSockets if computer is running
          if (instance.status === 'running') {
            get().subscribeToComputer();
          } else if (instance.status === 'starting' || instance.status === 'creating') {
            // Container not ready yet — poll until it reaches 'running'
            setTimeout(() => {
              fetchComputerPromise = null; // Allow re-fetch
              get().fetchComputer();
            }, 3000);
          }

          // Check API key configuration status
          await get().checkConfigStatus();
        } else {
          set({ error: result.error, isLoading: false });
        }
      })();

      try {
        await fetchComputerPromise;
      } finally {
        fetchComputerPromise = null;
      }
    },

    checkConfigStatus: async () => {
      const { instanceId } = get();
      if (!instanceId) {
        set({ configChecked: true, hasApiKey: false });
        return;
      }

      const result = await api.getAgentConfigStatus(instanceId);
      if (result.success) {
        const pk = result.data.platformKeys || { hasOpenrouter: false, hasTinyfish: false, hasAgentmail: false };
        set({
          hasApiKey: result.data.hasApiKey,
          hasTinyfishKey: result.data.hasTinyfishKey,
          hasAgentmailKey: result.data.hasAgentmailKey,
          configChecked: true,
          platformKeys: pk,
        });
      } else {
        // If we can't check, assume not configured
        set({ configChecked: true, hasApiKey: false, hasTinyfishKey: false, hasAgentmailKey: false });
      }
    },

    updateComputer: async (data) => {
      const { instanceId } = get();
      if (!instanceId) return false;

      // owner_email is intentionally NOT sent — backend resolves it from the
      // auth-verified DB record to prevent spoofing.
      const result = await api.updateAgentConfig(instanceId, {
        openrouter_api_key: data.openrouterApiKey,
        tinyfish_api_key: data.tinyfishApiKey,
        agentmail_api_key: data.agentmailApiKey,
        agentmail_inbox_username: data.agentmailInboxUsername,
        model: data.model,
        owner_name: data.ownerName,
        agent_name: data.agentName,
      });

      if (result.success) {
        // Optimistically update the model in the store so the UI reflects
        // the change immediately (fetchComputer will confirm from backend).
        if (data.model) {
          const { computer } = get();
          if (computer?.config) {
            set({ computer: { ...computer, config: { ...computer.config, model: data.model } } });
          }
        }
        // Refresh config status
        await get().checkConfigStatus();
        // Refetch to get updated state
        await get().fetchComputer();
        return true;
      }

      return false;
    },

    // startComputer/stopComputer removed — no containers in serverless mode.
    // Agent persists in Durable Object and is always "running".

    subscribeToComputer: () => {
      const { instanceId } = get();
      if (!instanceId) return;

      logger.info('Subscribing to computer', instanceId);

      // Connect agent WebSocket only.
      // Browser/terminal WS are disabled in serverless mode (no container).
      // browserWS.connect(instanceId);
      agentWS.connect(instanceId);

      const alreadySubscribed = subscribedInstanceId === instanceId;
      subscribedInstanceId = instanceId;
      if (alreadySubscribed) return;

      // Load sessions and persisted chat history from the container.
      // loadSessions sets activeSessionKey, then loadChatHistory uses it.
      // On a fresh browser session (new tab), start with a new chat.
      // On a refresh (same tab), restore the last active session.
      get().loadSessions().then(async () => {
        const isNewBrowserSession = !sessionStorage.getItem('construct:session-active');
        sessionStorage.setItem('construct:session-active', '1');

        if (isNewBrowserSession) {
          // New tab/window — start a fresh chat
          await get().createSession();
        } else {
          // Same tab refresh — restore last active session
          await get().loadChatHistory();
        }
      });

      // Fetch desktop state via REST as a fallback sync.
      // The agent WS also sends desktop_state on connect, but the REST call
      // covers the case where the agent WS isn't connected to the container yet.
      api.getDesktopState(instanceId).then((result) => {
        if (result.success) {
          const { windows, browser } = result.data;
          logger.info('REST desktop sync:', windows);

          // Open restored windows in a tidy grid layout.
          // Browser windows are excluded — they are created below with proper
          // daemon tab metadata, or by the tabs reconciler when daemon broadcasts arrive.
          // Editor windows are excluded — they require a file path (via editorStore)
          // and can't be restored from just the type string.
          const nonBrowserTypes = windows.filter((w: string) => w !== 'browser' && w !== 'editor' && w !== 'app') as WindowType[];
          if (nonBrowserTypes.length > 0) {
            useWindowStore.getState().openWindowsGrid(nonBrowserTypes);
          }

          // Restore persisted app windows (installed apps, Composio integrations)
          try {
            const saved = localStorage.getItem('construct:openAppWindows');
            if (saved) {
              const appWindows = JSON.parse(saved) as Array<{ title: string; icon?: string; metadata: Record<string, unknown> }>;
              const wStore = useWindowStore.getState();
              for (const aw of appWindows) {
                wStore.openWindow('app', {
                  title: aw.title,
                  icon: aw.icon,
                  metadata: aw.metadata,
                } as Partial<import('@/types').WindowConfig>);
              }
            }
          } catch { /* ignore corrupt data */ }

          // Restore cached browser state — create browser windows for each tab
          if (browser) {
            const { browserState } = get();
            const tabs = Array.isArray(browser.tabs) ? browser.tabs.map((t: any, i: number) => ({
              id: t.id || String(i),
              url: t.url || '',
              title: t.title || 'New Tab',
              active: t.active || false,
            })) : browserState.tabs;

            const active = tabs.find((t: any) => t.active) || tabs[0];
            const activeTabId = browserState.activeTabId || active?.id || null;

            // Create browser windows for each daemon tab
            const wStore = useWindowStore.getState();
            for (const tab of tabs) {
              const existingWin = wStore.windows.find(w =>
                w.type === 'browser' && w.metadata?.daemonTabId === tab.id
              );
              if (!existingWin) {
                const title = tab.title || (() => {
                  try { return tab.url ? new URL(tab.url).hostname : 'New Tab'; } catch { return 'New Tab'; }
                })();
                wStore.openWindow('browser', {
                  title,
                  metadata: { daemonTabId: tab.id },
                });
              }
            }

            set({
              browserState: {
                ...browserState,
                tabs,
                activeTabId,
                daemonActiveTabId: activeTabId,
                url: browser.url || active?.url || browserState.url,
                title: browser.title || active?.title || browserState.title,
              },
            });
          }
        }
      });

      // Set up event handlers
      browserWS.onFrame((blob: Blob, tabId?: string) => {
        get().setBrowserFrame(blob, undefined, undefined, tabId);
      });

      browserWS.onMessage((msg) => {
        const { browserState } = get();
        if (msg.type === 'stats') {
          const netInBytes = (msg.netInBytes as number) || 0;
          const netOutBytes = (msg.netOutBytes as number) || 0;
          const prev = get().systemStats;
          // Compute speed from delta between polls (5s interval)
          const dt = 5;
          let netInSpeed = 0;
          let netOutSpeed = 0;
          if (prev && prev.netInBytes > 0) {
            netInSpeed = Math.max(0, (netInBytes - prev.netInBytes) / dt);
            netOutSpeed = Math.max(0, (netOutBytes - prev.netOutBytes) / dt);
          }
          set({
            systemStats: {
              cpuPercent: (msg.cpuPercent as number) || 0,
              cpuCount: (msg.cpuCount as number) || 1,
              memUsedBytes: (msg.memUsedBytes as number) || 0,
              memTotalBytes: (msg.memTotalBytes as number) || 0,
              diskUsedBytes: (msg.diskUsedBytes as number) || 0,
              diskTotalBytes: (msg.diskTotalBytes as number) || 0,
              pids: (msg.pids as number) || 0,
              netInSpeed,
              netOutSpeed,
              netInBytes,
              netOutBytes,
              uptime: (msg.uptime as number) || 0,
            },
          });
        } else if (msg.type === 'status') {
          // Status arrives after navigate/newTab/switchTab — update URL/title
          // and clear isLoading.
          const newUrl = (msg.url as string) || browserState.url;
          const newTitle = (msg.title as string) || browserState.title;
          set({
            browserState: {
              ...browserState,
              isLoading: false,
              url: newUrl,
              title: newTitle,
            },
          });
          // Update the corresponding window title
          if (newTitle && browserState.daemonActiveTabId) {
            const winId = findWindowForDaemonTab(browserState.daemonActiveTabId);
            if (winId) {
              useWindowStore.getState().updateWindow(winId, { title: newTitle });
            }
          }
        } else if (msg.type === 'tabs') {
          // Daemon broadcasts its full tab list. We reconcile these with
          // frontend windows: create windows for new tabs, update metadata
          // for existing ones, and close windows for removed tabs.
          const rawTabs = msg.tabs as Array<{ id?: string; url?: string; title?: string; active?: boolean }> | undefined;
          if (Array.isArray(rawTabs)) {
            // Quick shallow comparison: skip if nothing changed.
            // Also check whether subagent annotations have been updated since
            // the last reconciliation — annotation changes (workspace assignments,
            // new subagent mappings) need to propagate even when daemon tabs haven't.
            const prevTabs = browserState.tabs;
            const hasAnnotationChanges = Object.keys(browserState.subagentTabMap).length !== (browserState as any)._lastAnnotationCount ||
              Object.keys(browserState.subagentAnnotations).length !== (browserState as any)._lastSubannotationCount;
            const tabsUnchanged = !hasAnnotationChanges && rawTabs.length === prevTabs.length && rawTabs.every((t, i) =>
              (t.id || String(i)) === prevTabs[i]?.id &&
              (t.url || '') === prevTabs[i]?.url &&
              (t.title || 'New Tab') === prevTabs[i]?.title &&
              (t.active || false) === prevTabs[i]?.active
            );
            if (tabsUnchanged) return;

            // Build a set of already-assigned subagent IDs to prevent
            // double-assigning when index-based and annotation-based lookups
            // both match different tabs.
            const assignedSubagents = new Set<string>();
            const tabs: BrowserTab[] = rawTabs.map((t, i) => {
              const id = t.id || String(i);
              // Primary: index-based lookup (fast path, usually correct)
              let annotation: { subagentId: string; subagentLabel?: string; workspaceId?: string } | undefined = browserState.subagentTabMap[i];
              if (annotation && assignedSubagents.has(annotation.subagentId)) {
                annotation = undefined; // Already assigned to a different index — skip
              }
              if (annotation) {
                assignedSubagents.add(annotation.subagentId);
              }
              return {
                id,
                url: t.url || '',
                title: t.title || 'New Tab',
                active: t.active || false,
                ...(annotation && {
                  subagentId: annotation.subagentId,
                  subagentLabel: annotation.subagentLabel,
                  ...(annotation.workspaceId && { workspaceId: annotation.workspaceId }),
                }),
              };
            });
            // Second pass: try to match unassigned subagent annotations by hint index
            // (handles index drift from tab opens/closes between event and poll)
            for (const [subId, anno] of Object.entries(browserState.subagentAnnotations)) {
              if (assignedSubagents.has(subId)) continue;
              // Search near the hint index first, then globally
              const searchOrder = [anno.hintIndex, anno.hintIndex - 1, anno.hintIndex + 1];
              for (const idx of searchOrder) {
                if (idx >= 0 && idx < tabs.length && !tabs[idx].subagentId) {
                  tabs[idx].subagentId = anno.subagentId;
                  tabs[idx].subagentLabel = anno.subagentLabel;
                  if (anno.workspaceId) tabs[idx].workspaceId = anno.workspaceId;
                  assignedSubagents.add(subId);
                  break;
                }
              }
            }

            // Track daemon's active tab (for frame routing)
            const daemonActive = tabs.find((t) => t.active) || tabs[0];
            const daemonActiveTabId = daemonActive?.id || null;

            // ── Reconcile daemon tabs ↔ browser windows ──────────────────
            const wStore = useWindowStore.getState();
            const browserWindows = wStore.windows.filter(w => w.type === 'browser');

            // Build sets for reconciliation
            const daemonTabIds = new Set(tabs.map(t => t.id));
            const windowTabIds = new Set(
              browserWindows
                .filter(w => w.metadata?.daemonTabId)
                .map(w => w.metadata!.daemonTabId as string)
            );

            // Create windows for NEW daemon tabs (not yet mapped to a window)
            // Track adopted window IDs to avoid stale-reference bugs:
            // wStore.updateWindow() creates new Zustand objects but our local
            // browserWindows array still holds old references, so without this
            // Set the same unassigned window would be matched on every iteration.
            const adoptedWindowIds = new Set<string>();
            for (const tab of tabs) {
              if (!windowTabIds.has(tab.id)) {
                // Try to adopt an unassigned browser window (no daemonTabId).
                // Priority:
                //   1. Window whose pendingUrl matches this tab's URL (exact match)
                //   2. Window with any pendingUrl (best-effort for race cases)
                //   3. Any unassigned window (fallback for ensureWindowOpen() shells)
                // This prevents orphan windows from ensureWindowOpen() or openBrowserWindow().
                const pendingWindow =
                  browserWindows.find(w =>
                    !w.metadata?.daemonTabId &&
                    !w.metadata?.tinyfishSubagentId &&
                    w.metadata?.pendingUrl !== undefined &&
                    w.metadata?.pendingUrl === tab.url &&
                    !adoptedWindowIds.has(w.id)
                  ) ||
                  browserWindows.find(w =>
                    !w.metadata?.daemonTabId &&
                    !w.metadata?.tinyfishSubagentId &&
                    w.metadata?.pendingUrl !== undefined &&
                    !adoptedWindowIds.has(w.id)
                  ) ||
                  browserWindows.find(w =>
                    !w.metadata?.daemonTabId &&
                    !w.metadata?.tinyfishSubagentId &&
                    !adoptedWindowIds.has(w.id)
                  );
                if (pendingWindow) {
                  adoptedWindowIds.add(pendingWindow.id);
                  const windowPendingUrl = pendingWindow.metadata?.pendingUrl as string | undefined;
                  // Assign this daemon tab to the unassigned window
                  wStore.updateWindow(pendingWindow.id, {
                    metadata: {
                      ...pendingWindow.metadata,
                      daemonTabId: tab.id,
                      pendingUrl: undefined,
                      _newTabRetries: undefined,
                      url: tab.url || undefined,
                      ...(tab.subagentId && { subagentId: tab.subagentId }),
                    },
                    title: tab.title || tab.url || 'New Tab',
                  });
                  // If the shell window had a pending URL (user typed it while
                  // waiting for daemon) and the daemon tab is blank, navigate now.
                  if (windowPendingUrl && (!tab.url || tab.url === 'about:blank' || tab.url === '')) {
                    browserWS.sendAction({ action: 'navigateTab', tabId: tab.id, url: windowPendingUrl });
                  }
                } else {
                  // Create a new window for this daemon tab
                  const title = tab.title || (() => {
                    try { return tab.url ? new URL(tab.url).hostname : 'New Tab'; } catch { return 'New Tab'; }
                  })();
                  // Determine the correct workspace for this browser window:
                  // 1. Subagent tabs: use the delegation workspace from tab.workspaceId
                  // 2. Non-subagent tabs: use pendingBrowserSessionKey to resolve workspace
                  // 3. Default: 'main' (desktop workspace), NEVER activeWorkspaceId
                  let browserWsId = tab.workspaceId;
                  if (!browserWsId && browserState.pendingBrowserSessionKey) {
                    browserWsId = useWindowStore.getState().resolveWorkspaceForSession(
                      browserState.pendingBrowserSessionKey,
                    );
                    // Clear the pending hint after use (one-shot)
                    set(s => ({
                      browserState: { ...s.browserState, pendingBrowserSessionKey: undefined },
                    }));
                  }
                  if (!browserWsId) browserWsId = 'main';
                  wStore.openWindow('browser', {
                    title,
                    workspaceId: browserWsId,
                    metadata: {
                      daemonTabId: tab.id,
                      url: tab.url || undefined,
                      ...(tab.subagentId && { subagentId: tab.subagentId }),
                      ...(tab.subagentLabel && { subagentLabel: tab.subagentLabel }),
                    },
                  });
                }
              } else {
                // Update existing window title/metadata if URL/title changed
                const existingWindow = browserWindows.find(w =>
                  w.metadata?.daemonTabId === tab.id
                );
                if (existingWindow) {
                  const newTitle = tab.title || (() => {
                    try { return tab.url ? new URL(tab.url).hostname : 'New Tab'; } catch { return 'New Tab'; }
                  })();
                  const currentUrl = existingWindow.metadata?.url as string | undefined;
                  const needsTitleUpdate = existingWindow.title !== newTitle;
                  const needsUrlUpdate = tab.url && currentUrl !== tab.url;
                  if (needsTitleUpdate || needsUrlUpdate) {
                    wStore.updateWindow(existingWindow.id, {
                      ...(needsTitleUpdate && { title: newTitle }),
                      ...(needsUrlUpdate && {
                        metadata: { ...existingWindow.metadata, url: tab.url },
                      }),
                    });
                  }
                }
              }
            }

            // Close windows for REMOVED daemon tabs or handle orphaned windows
            for (const win of browserWindows) {
              // Skip TinyFish windows (they don't have daemon tabs)
              if (win.metadata?.tinyfishSubagentId) continue;

              const winTabId = win.metadata?.daemonTabId as string | null;
              if (winTabId) {
                // Window has a daemon tab assigned — close if that tab no longer exists
                if (!daemonTabIds.has(winTabId)) {
                  _tabBlobCache.delete(winTabId);
                  _frameRenderers.delete(win.id);
                  _canvasClearFns.delete(win.id);
                  wStore.closeWindow(win.id);
                }
              } else if (!adoptedWindowIds.has(win.id)) {
                // Orphaned shell window: no daemonTabId and wasn't adopted.
                // This happens when openBrowserWindow()'s newTab message was
                // silently dropped (browser WS wasn't connected). Instead of
                // closing the window, retry newTab so the next tabs broadcast
                // can adopt it. Give up after 3 retries to avoid infinite loops.
                const retries = (win.metadata?._newTabRetries as number) || 0;
                if (retries < 3) {
                  const pendingUrl = win.metadata?.pendingUrl as string | undefined;
                  browserWS.sendAction({ action: 'newTab', ...(pendingUrl ? { url: pendingUrl } : {}) });
                  wStore.updateWindow(win.id, {
                    metadata: { ...win.metadata, _newTabRetries: retries + 1 },
                  });
                } else {
                  // Max retries exceeded — close the orphaned window
                  _frameRenderers.delete(win.id);
                  _canvasClearFns.delete(win.id);
                  wStore.closeWindow(win.id);
                }
              }
            }

            // Update BrowserState (internal tracking).
            // Track annotation counts so the next reconciliation can detect
            // annotation-only changes without a full deep compare.
            set({
              browserState: {
                ...browserState,
                tabs,
                activeTabId: daemonActiveTabId,
                daemonActiveTabId,
                url: daemonActive?.url || browserState.url,
                title: daemonActive?.title || browserState.title,
                isLoading: false,
                _lastAnnotationCount: Object.keys(browserState.subagentTabMap).length,
                _lastSubannotationCount: Object.keys(browserState.subagentAnnotations).length,
              } as any,
            });
          }
        }
      });

      browserWS.onConnection((connected) => {
        set({ browserState: { ...get().browserState, connected } });
      });

      agentWS.onEvent((event) => {
        get().handleAgentEvent(event);
      });

      agentWS.onConnection((connected) => {
        set({ agentConnected: connected });
      });
    },

    unsubscribeFromComputer: () => {
      logger.info('Unsubscribing from computer');
      subscribedInstanceId = null;
      clearAgentRunningTimer();
      // browserWS.disconnect(); // disabled in serverless mode
      agentWS.disconnect();

      // Clean up per-window frame renderers
      _frameRenderers.clear();
      _canvasClearFns.clear();
      _tabBlobCache.clear();

      set({
        browserState: { url: '', title: '', screenshot: null, isLoading: false, connected: false, tabs: [], activeTabId: null, tinyfishStreams: {}, daemonActiveTabId: null, subagentTabMap: {}, subagentAnnotations: {}, tabsWithFrames: {} },
        agentConnected: false,
        agentRunning: false,
        agentThinking: null,
        agentActivity: {},
        systemStats: null,
        todoList: null,
      });
    },

    loadChatHistory: async () => {
      const { instanceId, activeSessionKey } = get();
      if (!instanceId) return;

      // If /clear was used recently (flag survives refresh), skip loading
      // stale history from the backend — the agent may not have finished
      // persisting the clear yet. The flag is consumed here so the NEXT
      // refresh loads normally (by then the agent will have persisted).
      try {
        if (localStorage.getItem('construct:history-cleared') === '1') {
          localStorage.removeItem('construct:history-cleared');
          logger.info('Skipping chat history load — /clear was used recently');
          return;
        }
      } catch { /* */ }

      // Prevent concurrent loads from racing (multiple subscribeToComputer calls)
      if (chatHistoryLoading) return;
      chatHistoryLoading = true;

      // Capture the session key before the async fetch so we can detect
      // if the user switched sessions while the request was in flight.
      const requestedSessionKey = activeSessionKey;

      try {
        const result = await api.getAgentHistory(instanceId, requestedSessionKey);

        // If the user switched sessions while we were fetching, discard
        // the stale result to avoid showing the wrong session's messages.
        if (get().activeSessionKey !== requestedSessionKey) {
          logger.info('Discarding stale chat history for session', requestedSessionKey);
          return;
        }

        if (!result.success) {
          logger.warn('Failed to load chat history:', result.error);
          return;
        }

        const { messages, operation_metadata } = result.data;
        if (!messages || messages.length === 0) return;

        // ── Build operation metadata maps from BOTH sources:
        // 1. operation_metadata from the /history response (scans ALL messages,
        //    including those outside the context window)
        // 2. Inline <!-- ..._meta:... --> comments in context-windowed messages
        //    (fallback for older agents that don't return operation_metadata)
        type DelegationMeta = {
          delegationId: string;
          goal?: string;
          status: string;
          durationMs: number;
          subagents: Array<{ id: string; goal: string; status: string; result?: string; turns: number; durationMs: number }>;
        };
        type ConsultationMeta = {
          consultationId: string;
          question?: string;
          status: string;
          durationMs: number;
          advisors: Array<{ role: string; status: string; durationMs: number; response?: string }>;
        };
        type BackgroundMeta = {
          taskId: string;
          goal?: string;
          maxTurns?: number;
        };

        // Goal-based lookup for delegations (fixes sequential index mismatch)
        const delegationByGoal = new Map<string, DelegationMeta>();
        const delegationById = new Map<string, DelegationMeta>();
        const consultationByQuestion = new Map<string, ConsultationMeta>();
        const backgroundByGoal = new Map<string, BackgroundMeta>();

        // Primary source: operation_metadata from /history (covers ALL messages)
        if (operation_metadata) {
          for (const meta of operation_metadata) {
            if (meta.type === 'delegation' && meta.delegationId) {
              const d = meta as unknown as DelegationMeta;
              delegationById.set(d.delegationId, d);
              if (d.goal) delegationByGoal.set(d.goal, d);
            } else if (meta.type === 'consultation' && meta.consultationId) {
              const c = meta as unknown as ConsultationMeta;
              if (c.question) consultationByQuestion.set(c.question, c);
            } else if (meta.type === 'background' && meta.taskId) {
              const b = meta as unknown as BackgroundMeta;
              if (b.goal) backgroundByGoal.set(b.goal, b);
            }
          }
        }

        // Fallback: scan inline metadata in context-windowed messages
        for (const msg of messages) {
          if (msg.role === 'tool' && typeof msg.content === 'string') {
            const delegMatch = msg.content.match(/<!-- delegation_meta:(.*?) -->/);
            if (delegMatch) {
              try {
                const meta = JSON.parse(delegMatch[1]) as DelegationMeta;
                if (meta.delegationId && !delegationById.has(meta.delegationId)) {
                  delegationById.set(meta.delegationId, meta);
                  if (meta.goal) delegationByGoal.set(meta.goal, meta);
                }
              } catch { /* */ }
            }
            const consultMatch = msg.content.match(/<!-- consultation_meta:(.*?) -->/);
            if (consultMatch) {
              try {
                const meta = JSON.parse(consultMatch[1]) as ConsultationMeta;
                if (meta.question && !consultationByQuestion.has(meta.question)) {
                  consultationByQuestion.set(meta.question, meta);
                }
              } catch { /* */ }
            }
            const bgMatch = msg.content.match(/<!-- background_meta:(.*?) -->/);
            if (bgMatch) {
              try {
                const meta = JSON.parse(bgMatch[1]) as BackgroundMeta;
                if (meta.goal && !backgroundByGoal.has(meta.goal)) {
                  backgroundByGoal.set(meta.goal, meta);
                }
              } catch { /* */ }
            }
          }
        }

        // Map agent messages (system/user/assistant/tool) to frontend ChatMessages.
        // Reconstruct tool call activity logs from assistant message tool_calls arrays.
        const history: ChatMessage[] = [];

        for (const msg of messages) {
          if (msg.role === 'user' && msg.content) {
            const content = typeof msg.content === 'string'
              ? msg.content
              : String(msg.content);
            // Skip injected screenshot placeholders
            if (content === '[Screenshot of the current browser page]') continue;
            // Skip system-injected messages (nudges, auto-continue prompts, error recovery)
            if (content.startsWith('[System]') || content.startsWith('[System:') || content.startsWith('[System —')) continue;
            // Skip tool result messages injected as user role (text-based tool calling)
            if (content.startsWith('[Tool result for ')) continue;
            // Skip injected multimodal messages (screenshot + text pairs)
            if (Array.isArray(msg.content)) continue;
            // Extract source platform from metadata (set by cross-platform redirect)
            // or infer from session key (for messages in native platform sessions)
            let source: ChatMessage['source'];
            if (msg.metadata) {
              try {
                const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
                const p = meta?.platformReply?.platform;
                if (p === 'telegram' || p === 'slack' || p === 'email') source = p;
              } catch { /* */ }
            }
            if (!source) {
              if (requestedSessionKey.startsWith('telegram_')) source = 'telegram';
              else if (requestedSessionKey.startsWith('slack_')) source = 'slack';
              else if (requestedSessionKey.startsWith('email_')) source = 'email';
            }
            history.push({ role: 'user', content, timestamp: new Date(msg.created_at), source });
          } else if (msg.role === 'assistant') {
            // Emit activity entries for each tool_call before the text content
            const toolCalls = msg.tool_calls as Array<{
              type: string;
              function: { name: string; arguments: string };
            }> | undefined;
            if (toolCalls && Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                const tool = tc.function?.name || 'tool';
                let params: Record<string, unknown> | undefined;
                try { params = JSON.parse(tc.function?.arguments || '{}'); } catch { /* */ }

                // Delegation/consultation/background tools get proper group
                // messages so they render as OperationCards (matching the live
                // event path where delegation:started etc. create them).
                if (tool === 'delegate_task') {
                  const goal = (params?.goal as string) || 'complex task';
                  const subtasks = params?.subtasks;
                  const count = Array.isArray(subtasks) ? subtasks.length : 0;
                  const shortGoal = goal.length > 60 ? goal.slice(0, 60) + '...' : goal;

                  const tracker = useAgentTrackerStore.getState();

                  // Match metadata by goal text (robust against context window
                  // eviction and ordering mismatches).
                  const meta = delegationByGoal.get(goal);

                  // Check if a tracker operation already exists (e.g., from
                  // localStorage persistence or WS state replay).
                  const existingOp = Object.values(tracker.operations).find(
                    op => op.type === 'delegation' && op.goal === goal,
                  );

                  const operationId = existingOp?.id || meta?.delegationId || `hist_deleg_${history.length}`;

                  if (!existingOp) {
                    // Create the operation in the tracker
                    tracker.startOperation(operationId, 'delegation', goal, count);
                    // Reconstruct subagent rows from metadata so the tracker
                    // shows expandable subagent details even after page refresh.
                    if (meta?.subagents) {
                      for (let si = 0; si < meta.subagents.length; si++) {
                        const s = meta.subagents[si];
                        tracker.addSubAgent(operationId, {
                          id: s.id || `${operationId}_s${si}`,
                          type: 'subagent',
                          label: `Subagent ${si}`,
                          goal: s.goal,
                          status: s.status === 'completed' ? 'complete' : s.status === 'failed' ? 'failed' : 'complete',
                          startedAt: Date.now(),
                          completedAt: Date.now(),
                          durationMs: s.durationMs,
                          iterations: s.turns,
                          result: s.result,
                          activities: [],
                        });
                      }
                    }
                    tracker.updateOperationStatus(operationId, meta?.status === 'failed' ? 'failed' : 'complete', meta?.durationMs);
                  }

                  history.push({
                    role: 'activity', content: `Delegation: ${shortGoal} (${count} subagents)`,
                    timestamp: new Date(msg.created_at), tool, activityType: 'delegation-group', operationId,
                  });
                  continue;
                }
                if (tool === 'consult_experts') {
                  const question = (params?.question as string) || 'question';
                  const shortQ = question.length > 60 ? question.slice(0, 60) + '...' : question;

                  const tracker = useAgentTrackerStore.getState();
                  const existingOp = Object.values(tracker.operations).find(
                    op => op.type === 'consultation' && op.goal === question,
                  );

                  // Match consultation metadata by question text
                  const meta = consultationByQuestion.get(question);
                  const operationId = existingOp?.id || meta?.consultationId || `hist_consult_${history.length}`;

                  if (!existingOp) {
                    const advisorCount = meta?.advisors?.length || 0;
                    tracker.startOperation(operationId, 'consultation', question, advisorCount);
                    // Reconstruct advisor rows from metadata
                    if (meta?.advisors) {
                      for (let ai = 0; ai < meta.advisors.length; ai++) {
                        const a = meta.advisors[ai];
                        tracker.addSubAgent(operationId, {
                          id: `${operationId}_a${ai}`,
                          type: 'subagent',
                          label: a.role,
                          goal: `${a.role} perspective on: ${question.slice(0, 80)}`,
                          status: a.status === 'completed' ? 'complete' : a.status === 'failed' ? 'failed' : 'complete',
                          startedAt: Date.now(),
                          completedAt: Date.now(),
                          durationMs: a.durationMs,
                          result: a.response,
                          activities: [],
                        });
                      }
                    }
                    tracker.updateOperationStatus(operationId, meta?.status === 'failed' ? 'failed' : 'complete', meta?.durationMs);
                  }
                  history.push({
                    role: 'activity', content: `Consultation: ${shortQ}`,
                    timestamp: new Date(msg.created_at), tool, activityType: 'consultation-group', operationId,
                  });
                  continue;
                }
                if (tool === 'background_task' && (params?.action as string) === 'spawn') {
                  const goal = (params?.goal as string) || 'background task';
                  const shortGoal = goal.length > 60 ? goal.slice(0, 60) + '...' : goal;

                  const tracker = useAgentTrackerStore.getState();
                  const existingOp = Object.values(tracker.operations).find(
                    op => op.type === 'background' && op.goal === goal,
                  );

                  const bgMeta = backgroundByGoal.get(goal);
                  const operationId = existingOp?.id || (bgMeta?.taskId ? `bg_${bgMeta.taskId}` : `hist_bg_${history.length}`);

                  if (!existingOp) {
                    tracker.startOperation(operationId, 'background', goal, 1);
                    tracker.updateOperationStatus(operationId, 'complete');
                  }
                  history.push({
                    role: 'activity', content: `Background: ${shortGoal}`,
                    timestamp: new Date(msg.created_at), tool, activityType: 'background-group', operationId,
                  });
                  continue;
                }

                const { text, activityType } = describeToolCall(tool, params);
                history.push({
                  role: 'activity',
                  content: text,
                  timestamp: new Date(msg.created_at),
                  tool,
                  activityType,
                });
              }
            }
            // Then the assistant text (if any)
            if (msg.content) {
              const content = typeof msg.content === 'string'
                ? msg.content
                : String(msg.content);
              history.push({ role: 'agent', content, timestamp: new Date(msg.created_at) });
            }
          }
        }

        if (history.length === 0) return;

        // Before replacing, check if event replay (which runs before this
        // fetch completes) created live delegation/consultation/background
        // group messages with active tracker operations. These represent
        // still-running operations and must survive the history replacement.
        const currentMessages = get().chatMessages;
        const tracker = useAgentTrackerStore.getState();
        const historyOperationIds = new Set(
          history.filter(m => m.operationId).map(m => m.operationId),
        );
        for (const m of currentMessages) {
          if (
            m.operationId &&
            !historyOperationIds.has(m.operationId) &&
            tracker.operations[m.operationId] &&
            (tracker.operations[m.operationId].status === 'running' || tracker.operations[m.operationId].status === 'aggregating') &&
            (m.activityType === 'delegation-group' || m.activityType === 'consultation-group' || m.activityType === 'background-group')
          ) {
            history.push(m);
          }
        }

        // Replace chat with server history (plus any preserved live operations).
        // Re-inject any pending auth_connect cards that were persisted to sessionStorage.
        const pendingCards = loadAuthCards();
        for (const [, card] of pendingCards) {
          const marker = `<!--AUTH_CONNECT:${JSON.stringify({ toolkit: card.toolkit, name: card.name, description: card.description, url: card.url })}-->`;
          history.push({
            role: 'agent',
            content: `${marker}\n\nI'll automatically continue once you've connected.`,
            timestamp: new Date(card.timestamp),
          });
        }

        set({ chatMessages: history });
        // Update session cache for instant switching later
        const currentKey = get().activeSessionKey;
        if (currentKey) sessionMessageCache.set(currentKey, history);
        logger.info(`Loaded ${history.length} messages from chat history`);
      } catch (err) {
        logger.warn('Error loading chat history:', err);
      } finally {
        chatHistoryLoading = false;
      }
    },

    sendChatMessage: async (content, attachments) => {
      let { instanceId, activeSessionKey, chatMessages, chatSessions } = get();
      if (!instanceId) return;

      // Auto-create a session if none exist (e.g. user deleted all chats)
      if (chatSessions.length === 0) {
        await get().createSession();
        activeSessionKey = get().activeSessionKey;
        chatMessages = get().chatMessages;
      }

      // If this is the first user message in the session, rename the session
      // to the first 46 characters of the message for easy identification.
      const isFirstMessage = !chatMessages.some(m => m.role === 'user');
      if (isFirstMessage && content.trim()) {
        const title = content.trim().slice(0, 46);
        // Optimistic UI update
        set(state => ({
          chatSessions: state.chatSessions.map(s =>
            s.key === activeSessionKey ? { ...s, title } : s
          ),
        }));
        // Persist to backend so title survives refresh
        api.renameAgentSession(instanceId, activeSessionKey, title);
      }

      // Add user message to chat immediately (both desktop singleton and per-agent feed)
      const userMsg: ChatMessage = { role: 'user', content, timestamp: new Date(), attachments };
      set(state => {
        const pa = state.platformAgents.desktop;
        const agentChatUpdates: Partial<typeof state> = {};
        if (pa) {
          agentChatUpdates.platformAgents = {
            ...state.platformAgents,
            desktop: {
              ...pa,
              chatMessages: [...(pa.chatMessages || []), userMsg],
            },
          };
        }
        const nextRunning = new Set(state.runningSessions);
        nextRunning.add(activeSessionKey);
        return {
          ...agentChatUpdates,
          chatMessages: appendMessage(state.chatMessages, userMsg),
          agentThinking: '',
          agentRunning: true,
          runningSessions: nextRunning,
        };
      });

      // Send via WebSocket with the active session key.
      // sendChat returns false if the message was dropped (WS not connected
      // and not currently connecting). In that case, show an error so the
      // user knows to retry.
      // Collect base64 image data for any image attachments (for multimodal/vision)
      const imageDataUrls: string[] = [];
      const pendingImages = get().pendingImageData;
      if (pendingImages && pendingImages.length > 0) {
        imageDataUrls.push(...pendingImages);
        set({ pendingImageData: [] });
      }

      // If there are attachments, prepend file paths to the message so the agent has context.
      // When image data is being sent as base64 (via imageDataUrls), exclude image file paths
      // from the text to prevent the model from hallucinating descriptions based on filenames.
      const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?)$/i;
      let messageForAgent = content;
      if (attachments && attachments.length > 0) {
        const hasImageData = imageDataUrls.length > 0;
        const nonImagePaths = hasImageData
          ? attachments.filter(p => !IMAGE_PATH_RE.test(p))
          : attachments;
        if (nonImagePaths.length > 0) {
          const attachList = nonImagePaths.map(p => `- ${p}`).join('\n');
          messageForAgent = `${content}\n\n[Attached files — these files have been uploaded and are available for you to read/process:\n${attachList}\n]`;
        }
      }

      const sent = agentWS.sendChat(messageForAgent, activeSessionKey, imageDataUrls.length > 0 ? imageDataUrls : undefined);
      if (!sent) {
        set(state => ({
          chatMessages: appendMessage(state.chatMessages, {
            role: 'agent',
            content: 'Not connected to agent. Please wait for the connection and try again.',
            timestamp: new Date(),
            isError: true,
          }),
          agentThinking: null,
          agentRunning: false,
        }));
      } else {
        // Start a safety timeout — if no agent events arrive within the
        // timeout window, reset agentRunning so the UI doesn't get stuck.
        resetAgentRunningTimer(get, set);
      }
    },

    respondToAskUser: (questionId, value, _label) => {
      // 1. Mark the question as answered in chat messages
      set(state => ({
        chatMessages: state.chatMessages.map(m =>
          m.askUser?.questionId === questionId
            ? { ...m, askUser: { ...m.askUser, selectedValue: value } }
            : m
        ),
      }));

      // 2. Send the response to the agent via WebSocket
      // Check if this is a permission request (value is 'allow' or 'deny')
      if (value === 'allow' || value === 'deny') {
        agentWS.send({
          type: 'ask_user_response',
          toolCallId: questionId,
          approved: value === 'allow',
        });
      } else {
        agentWS.send({
          type: 'ask_user_response',
          questionId,
          value,
        });
      }
    },

    stopAgent: () => {
      // Optimistically update the UI immediately — don't wait for the
      // agent's 'stopped' event which may take seconds to arrive.
      clearAgentRunningTimer();
      set(state => {
        // Reset all platform agents to not-running (unconditional — clear stale state too)
        const pa = { ...state.platformAgents };
        for (const key of Object.keys(pa)) {
          if (pa[key]) {
            pa[key] = { ...pa[key], running: false, currentTool: undefined, thinking: null };
          }
        }
        return {
          chatMessages: state.agentRunning ? appendMessage(state.chatMessages, {
            role: 'agent',
            content: 'Stopped by user',
            timestamp: new Date(),
            isError: true,
            isStopped: true,
          }) : state.chatMessages,
          agentThinking: null,
          agentThinkingStream: null,
          agentRunning: false,
          agentActivity: {},
          queuedMessageCount: 0,
          taskProgress: null,
          platformAgents: pa,
        };
      });

      // Mark all running orchestration operations & their subagents as cancelled
      const tracker = useAgentTrackerStore.getState();
      for (const [id, op] of Object.entries(tracker.operations)) {
        if (op.status === 'running' || op.status === 'aggregating') {
          tracker.updateOperationStatus(id, 'failed');
          for (const sub of op.subAgents) {
            if (sub.status === 'running' || sub.status === 'pending') {
              tracker.updateSubAgent(id, sub.id, { status: 'cancelled' });
            }
          }
        }
      }

      // Send the abort command — aborts ALL running lanes
      agentWS.sendAbort();
    },

    stopPlatformAgent: (platform: string) => {
      // Targeted abort: stop all lanes for a specific platform.
      // Used by the Agent Tracker to stop Slack/Telegram/Email tasks.
      agentWS.sendAbort({ platform });
    },

    stopChatSession: () => {
      const { activeSessionKey, agentRunning, platformAgents } = get();
      // Check both agentRunning (orchestrator lane) and platformAgents (child events)
      // — children may still be running even after the orchestrator lane finishes.
      const isDesktopRunning = agentRunning || platformAgents.desktop?.running;
      if (!isDesktopRunning) return;

      // Optimistically update the UI for the current chat session
      clearAgentRunningTimer();
      set(state => ({
        chatMessages: appendMessage(state.chatMessages, {
          role: 'agent',
          content: 'Stopped by user',
          timestamp: new Date(),
          isError: true,
          isStopped: true,
        }),
        agentThinking: null,
        agentThinkingStream: null,
        agentRunning: false,
        agentActivity: {},
        queuedMessageCount: 0,
        taskProgress: null,
      }));

      // Mark all running orchestration operations as failed
      const tracker = useAgentTrackerStore.getState();
      for (const [id, op] of Object.entries(tracker.operations)) {
        if (op.status === 'running' || op.status === 'aggregating') {
          tracker.updateOperationStatus(id, 'failed');
          for (const sub of op.subAgents) {
            if (sub.status === 'running' || sub.status === 'pending') {
              tracker.updateSubAgent(id, sub.id, { status: 'cancelled' });
            }
          }
        }
      }

      // Targeted abort: stop only the current desktop chat session lane
      agentWS.sendAbort({ sessionKey: activeSessionKey });
    },

    setReplyingTo: (msg: ChatMessage | null) => { set({ replyingTo: msg }); },

    clearChatHistory: () => {
      // Force stop all running agents first
      clearAgentRunningTimer();
      agentWS.sendAbort();
      // Clear session cache for current session
      const currentKey = get().activeSessionKey;
      if (currentKey) sessionMessageCache.delete(currentKey);
      // Clear frontend chat messages
      set({
        chatMessages: [],
        agentThinking: null,
        agentThinkingStream: null,
        agentRunning: false,
        agentActivity: {},
        queuedMessageCount: 0,
        taskProgress: null,
        sessionTokens: { prompt: 0, completion: 0, total: 0, cost: 0 },
      });
      // Clear platform agent chat feeds
      set(state => {
        const updated: typeof state.platformAgents = {};
        for (const [k, pa] of Object.entries(state.platformAgents)) {
          updated[k] = { ...pa, chatMessages: [], responseText: '', toolHistory: [], running: false, currentTool: undefined, thinking: null, stepProgress: null };
        }
        return { platformAgents: updated };
      });
      // Clear tracker operations — mark everything as cancelled
      const tracker = useAgentTrackerStore.getState();
      for (const [id, op] of Object.entries(tracker.operations)) {
        if (op.status === 'running' || op.status === 'aggregating') {
          tracker.updateOperationStatus(id, 'failed');
          for (const sub of op.subAgents) {
            if (sub.status === 'running' || sub.status === 'pending') {
              tracker.updateSubAgent(id, sub.id, { status: 'cancelled' });
            }
          }
        }
      }
      tracker.resetAll();
      // Tell the agent to clear its memory for this session
      agentWS.send({ type: 'clear_history', session_key: currentKey || 'default' });
      // Set a flag so that if the user refreshes before the agent finishes
      // persisting the clear, loadChatHistory() won't reload stale messages.
      try { localStorage.setItem('construct:history-cleared', '1'); } catch { /* */ }
    },

    // ── Session management ──────────────────────────────────

    loadSessions: async () => {
      const { instanceId } = get();
      if (!instanceId) return;

      try {
        const result = await api.getAgentSessions(instanceId);
        if (result.success) {
          set({
            chatSessions: result.data.sessions,
            activeSessionKey: result.data.active_key,
          });
        }
      } catch (err) {
        logger.warn('Error loading sessions:', err);
      }
    },

    createSession: async (title?: string) => {
      const { instanceId, activeSessionKey, chatMessages, chatSessions } = get();
      if (!instanceId) return;

      // If current session is already empty, just stay on it
      if (!title && activeSessionKey && chatMessages.length === 0) {
        return;
      }

      // Check if there's another empty "New Chat" session we can reuse.
      // Check both the in-memory cache AND uncached sessions (which are
      // likely empty if never visited). The backend also deduplicates as
      // a safety net, but catching it here avoids an unnecessary API call.
      if (!title) {
        for (const session of chatSessions) {
          if (session.key === activeSessionKey) continue;
          const isNewChat = !session.title || session.title === 'New Chat';
          if (!isNewChat) continue;
          const cached = sessionMessageCache.get(session.key);
          // If cached and empty → reuse. If never visited (no cache) → also likely empty.
          if (!cached || cached.length === 0) {
            get().switchSession(session.key);
            return;
          }
        }
      }

      try {
        const result = await api.createAgentSession(instanceId, title);
        if (result.success) {
          const session = result.data;
          const existing = get().chatSessions;
          // Backend may reuse an empty session — don't duplicate it in the list
          const alreadyInList = existing.some(s => s.key === session.key);
          set({
            chatSessions: alreadyInList ? existing : [session, ...existing],
            activeSessionKey: session.key,
            chatMessages: [],
            agentThinking: null,
            agentRunning: false,
          });
        }
      } catch (err) {
        logger.warn('Error creating session:', err);
      }
    },

    switchSession: async (key: string) => {
      const { instanceId, activeSessionKey, chatMessages } = get();
      if (!instanceId || key === activeSessionKey) return;

      // Cache current session's messages before switching
      if (activeSessionKey && chatMessages.length > 0) {
        sessionMessageCache.set(activeSessionKey, chatMessages);
      }

      try {
        const result = await api.activateAgentSession(instanceId, key);
        if (result.success) {
          const isTargetRunning = get().runningSessions.has(key);
          const cached = sessionMessageCache.get(key);

          set({
            activeSessionKey: key,
            chatMessages: cached || [],
            agentThinking: null,
            agentRunning: isTargetRunning,
            sessionSwitching: !cached, // only show loading if no cache
          });

          // Silently refresh from API (updates cache with latest)
          await get().loadChatHistory();
          set({ sessionSwitching: false });
        }
      } catch (err) {
        logger.warn('Error switching session:', err);
      }
    },

    deleteSession: async (key: string) => {
      const { instanceId } = get();
      if (!instanceId) return;

      try {
        const result = await api.deleteAgentSession(instanceId, key);
        if (result.success) {
          set({
            activeSessionKey: result.data.active_key,
            chatMessages: [],
            agentThinking: null,
          });
          // Reload full session list (a fresh session may have been created
          // if we just deleted the last one)
          await get().loadSessions();
          // Load the now-active session's history
          await get().loadChatHistory();
        }
      } catch (err) {
        logger.warn('Error deleting session:', err);
      }
    },

    renameSession: async (key: string, title: string) => {
      const { instanceId } = get();
      if (!instanceId) return;

      try {
        const result = await api.renameAgentSession(instanceId, key, title);
        if (result.success) {
          const { chatSessions } = get();
          set({
            chatSessions: chatSessions.map(s =>
              s.key === key ? { ...s, title } : s
            ),
          });
        }
      } catch (err) {
        logger.warn('Error renaming session:', err);
      }
    },


    clearEmailUnread: () => {
      set({ emailUnreadCount: 0 });
    },

    clearPendingApprovals: () => {
      set({ pendingApprovalCount: 0 });
    },

    setBrowserFrame: (frame, forceDisplay, subagentId, taggedTabId) => {
      // Frame arrives as a Blob from the WS screencast pipeline or agent
      // screenshot. Cache it and render to the correct per-window canvas,
      // bypassing React state entirely.
      const { browserState } = get();

      // Use the tagged tab ID from the frame header if available.
      // This is more reliable than daemonActiveTabId because it's attached
      // to the frame at the source (browser-server.ts) rather than inferred
      // from a separate state variable that can drift.
      const effectiveTabId = taggedTabId || (subagentId ? undefined : browserState.daemonActiveTabId);

      // Cache key: daemon tab ID, subagentId, or 'main'
      const cacheKey = subagentId || effectiveTabId || 'main';
      _tabBlobCache.set(cacheKey, frame);

      // For subagent frames, also cache under the daemon tab ID so that
      // BrowserWindow.getCachedFrameBlob(daemonTabId) works on mount.
      // Agent screenshots arrive before the daemon tab broadcast, creating
      // a cache key mismatch (frame under subagentId, lookup by daemonTabId).
      let subagentDaemonTabId: string | undefined;
      if (subagentId) {
        const tab = browserState.tabs.find(t => t.subagentId === subagentId);
        if (tab) {
          subagentDaemonTabId = tab.id;
          _tabBlobCache.set(tab.id, frame);
        }
      }

      // Find the window that should receive this frame
      let targetWindowId: string | undefined;
      if (subagentId) {
        // Try subagent window first, then TinyFish window
        targetWindowId = findWindowForSubagent(subagentId) || findWindowForTinyfish(subagentId);
      } else if (effectiveTabId) {
        // Frame from a specific daemon tab — route to its window
        targetWindowId = findWindowForDaemonTab(effectiveTabId);
      }

      // If forceDisplay and no target found, render to the first browser
      // window on the main workspace (avoid blasting all windows which
      // overwrites subagent displays).
      if (forceDisplay && !targetWindowId) {
        const wStore = useWindowStore.getState();
        const mainBrowser = wStore.windows.find(
          w => w.type === 'browser' && w.workspaceId === 'main'
        ) ?? wStore.windows.find(w => w.type === 'browser');
        if (mainBrowser) {
          const renderer = _frameRenderers.get(mainBrowser.id);
          if (renderer) renderer(frame);
        }
      } else if (targetWindowId) {
        const renderer = _frameRenderers.get(targetWindowId);
        if (renderer) renderer(frame);
      }

      // Per-tab first-frame marker: triggers React update only once per tab
      // so BrowserWindow switches from placeholder to canvas for THIS window.
      // Also set global screenshot marker for backward compat.
      const needsGlobal = !browserState.screenshot;
      const needsPerTab = cacheKey && !browserState.tabsWithFrames[cacheKey];
      const needsDaemonTab = subagentDaemonTabId && !browserState.tabsWithFrames[subagentDaemonTabId];
      if (needsGlobal || needsPerTab || needsDaemonTab) {
        const updatedTabsWithFrames = { ...browserState.tabsWithFrames };
        if (needsPerTab) updatedTabsWithFrames[cacheKey] = true as const;
        if (needsDaemonTab && subagentDaemonTabId) updatedTabsWithFrames[subagentDaemonTabId] = true as const;
        set({
          browserState: {
            ...browserState,
            screenshot: '__has_frame__',
            isLoading: needsGlobal ? false : browserState.isLoading,
            tabsWithFrames: updatedTabsWithFrames,
          },
        });
      }
    },

    openBrowserWindow: (url) => {
      // Tell daemon to open a new tab — the daemon will broadcast the new tab
      // via a 'tabs' message, and our reconciler will create the window.
      browserWS.sendAction({ action: 'newTab', ...(url ? { url } : {}) });
      // Create the window optimistically — the daemon tab mapping will be set
      // once the 'tabs' broadcast arrives with the new tab.
      const title = url ? (() => { try { return new URL(url).hostname; } catch { return url; } })() : 'New Tab';
      const windowId = useWindowStore.getState().openWindow('browser', {
        title,
        metadata: { daemonTabId: null, pendingUrl: url || null },
      });
      return windowId;
    },

    closeBrowserWindow: (windowId) => {
      const win = useWindowStore.getState().getWindow(windowId);
      if (!win || win.type !== 'browser') return;

      const daemonTabId = win.metadata?.daemonTabId as string | null;
      const tinyfishSubagentId = win.metadata?.tinyfishSubagentId as string | null;

      // Tell daemon to close the tab
      if (daemonTabId) {
        browserWS.sendAction({ action: 'closeTab', tabId: daemonTabId });
        _tabBlobCache.delete(daemonTabId);
        // Clean per-tab frame marker
        const { browserState: bs1 } = get();
        if (bs1.tabsWithFrames[daemonTabId]) {
          const { [daemonTabId]: _, ...rest } = bs1.tabsWithFrames;
          set({ browserState: { ...bs1, tabsWithFrames: rest } });
        }
      }

      // Clean up TinyFish state
      if (tinyfishSubagentId) {
        const { browserState } = get();
        const { [tinyfishSubagentId]: _removed, ...remainingStreams } = browserState.tinyfishStreams;
        const { [tinyfishSubagentId]: _removedFrame, ...remainingFrames } = browserState.tabsWithFrames;
        set({
          browserState: {
            ...browserState,
            tinyfishStreams: remainingStreams,
            tabsWithFrames: remainingFrames,
          },
        });
        _tabBlobCache.delete(tinyfishSubagentId);
      }

      // Clean up per-window renderer
      _frameRenderers.delete(windowId);
      _canvasClearFns.delete(windowId);

      // Close the window
      useWindowStore.getState().closeWindow(windowId);

      // If no browser windows remain, clear all frame state
      const remainingBrowserWindows = useWindowStore.getState().windows.filter(w => w.type === 'browser');
      if (remainingBrowserWindows.length === 0) {
        _tabBlobCache.clear();
        set({
          browserState: {
            ...get().browserState,
            screenshot: null,
            url: '',
            title: '',
            tabsWithFrames: {},
          },
        });
      }
    },

    focusBrowserWindow: (windowId) => {
      const win = useWindowStore.getState().getWindow(windowId);
      if (!win || win.type !== 'browser') return;

      const daemonTabId = win.metadata?.daemonTabId as string | null;
      if (!daemonTabId) return;

      const { browserState } = get();
      const alreadyActive = browserState.activeTabId === daemonTabId
        && browserState.daemonActiveTabId === daemonTabId;

      // Always render cached blob for instant display on focus, even if
      // already active (handles cases where the canvas was cleared/resized)
      const cached = _tabBlobCache.get(daemonTabId);
      const renderer = _frameRenderers.get(windowId);
      if (cached && renderer) {
        renderer(cached);
      }

      // Skip daemon switch + state update if this tab is already active
      // (prevents unnecessary WS messages and breaks focus loops)
      if (alreadyActive) return;

      // Tell daemon to switch to this tab so future frames arrive for it
      browserWS.sendAction({ action: 'switchTab', tabId: daemonTabId });

      // Update URL bar state
      const daemonTab = browserState.tabs.find(t => t.id === daemonTabId);
      if (daemonTab) {
        set({
          browserState: {
            ...browserState,
            activeTabId: daemonTabId,
            daemonActiveTabId: daemonTabId,
            url: daemonTab.url || browserState.url,
            title: daemonTab.title || browserState.title,
          },
        });
      }
    },

    navigateTo: (url, windowId) => {
      const { browserState } = get();

      // If browser WS isn't connected or the target window has no daemon tab
      // yet (shell window), store the URL as pendingUrl so the reconciler can
      // navigate once the daemon tab is assigned.
      if (windowId) {
        const win = useWindowStore.getState().getWindow(windowId);
        const daemonTabId = win?.metadata?.daemonTabId as string | null;
        if (!daemonTabId || !browserWS.isConnected()) {
          if (win) {
            useWindowStore.getState().updateWindow(windowId, {
              title: (() => { try { return new URL(url).hostname; } catch { return url; } })(),
              metadata: { ...win.metadata, pendingUrl: url },
            });
          }
          if (!browserWS.isConnected()) {
            logger.warn('navigateTo: browser WS not connected, stored as pendingUrl');
            return;
          }
        }
      } else if (!browserWS.isConnected()) {
        logger.warn('navigateTo: browser WS not connected, ignoring');
        return;
      }

      // If no tabs exist yet (first open), use newTab instead of navigate
      if (browserState.tabs.length === 0) {
        browserWS.sendAction({ action: 'newTab', url });
      } else if (windowId) {
        // Targeted window: use compound navigateTab to atomically switch + navigate.
        // This prevents the race where two separate messages could navigate the wrong tab.
        const win = useWindowStore.getState().getWindow(windowId);
        const daemonTabId = win?.metadata?.daemonTabId as string | null;
        if (daemonTabId) {
          browserWS.sendAction({ action: 'navigateTab', tabId: daemonTabId, url });
        } else {
          browserWS.sendAction({ action: 'navigate', url });
        }
      } else {
        browserWS.sendAction({ action: 'navigate', url });
      }
      set({
        browserState: {
          ...browserState,
          url,
          isLoading: true,
        },
      });
      // Safety timeout: clear isLoading after 30s
      setTimeout(() => {
        const { browserState: bs } = get();
        if (bs.isLoading && bs.url === url) {
          set({ browserState: { ...bs, isLoading: false } });
        }
      }, 30_000);
    },

    handleAgentEvent: (event) => {
      logger.debug('Agent event:', event.type, event.data);

      // ── Helper: resolve event platform and sync desktop singletons ──
      // Every event may carry platform/sessionKey. This helper determines
      // which agent the event belongs to and provides a function to update
      // that agent's per-agent chatMessages in platformAgents.
      const eventPlatform = (event.data?.platform as string) || 'desktop';
      const eventSessionKey = (event.data?.sessionKey as string) || 'default';
      const isDesktop = eventPlatform === 'desktop';
      // Only update the desktop singleton chatMessages if this event belongs
      // to the currently active session. Without this check, events from a
      // background session's agent loop leak into whichever session the user
      // is currently viewing.
      const isActiveSession = isDesktop && eventSessionKey === get().activeSessionKey;

      /**
       * Get or create the platformAgent entry for this event's platform.
       * NEVER returns undefined — creates a default entry if missing.
       * This prevents silent data loss from timing races between
       * platform_agent:started and other events.
       */
      const getOrCreateAgent = (state: ComputerStore): PlatformAgentState => {
        return state.platformAgents[eventPlatform] || {
          platform: eventPlatform,
          running: true,
          queueLength: 0,
          sessionKey: eventSessionKey !== 'default' ? eventSessionKey : undefined,
        };
      };

      /** Update the platform agent state for this event's platform. */
      const updateAgent = (updater: (pa: PlatformAgentState) => Partial<PlatformAgentState>) => {
        set(state => {
          const pa = getOrCreateAgent(state);
          return {
            platformAgents: {
              ...state.platformAgents,
              [eventPlatform]: { ...pa, ...updater(pa) },
            },
          };
        });
      };

      /** Append a ChatMessage to the correct agent's per-agent chat feed. */
      const appendToAgentChat = (msg: ChatMessage) => {
        set(state => {
          const pa = getOrCreateAgent(state);
          const existing = pa.chatMessages || [];
          const updates: Partial<typeof state> = {
            platformAgents: {
              ...state.platformAgents,
              [eventPlatform]: {
                ...pa,
                chatMessages: [...existing, msg],
              },
            },
          };
          // Also update the desktop singleton for backward compat
          if (isActiveSession) {
            updates.chatMessages = appendMessage(state.chatMessages, msg);
          }
          return updates;
        });
      };

      // Any event from the agent proves it's alive — reset the safety
      // timeout so we don't falsely reset agentRunning mid-task.
      if (get().agentRunning) {
        resetAgentRunningTimer(get, set);
      }

      switch (event.type) {
        case 'message': {
          // Incoming user message broadcast from the backend.
          // Desktop-typed messages are already added optimistically in
          // sendChatMessage — only add if this is a NEW message (e.g.,
          // from Telegram/Slack/Email redirected to the active desktop session).
          const msgRole = event.data?.role as string;
          const msgContent = event.data?.content as string;
          if (msgRole === 'user' && msgContent && isActiveSession) {
            const current = get().chatMessages;
            const lastUser = [...current].reverse().find(m => m.role === 'user');
            // Skip if the last user message already matches (optimistic add from desktop input)
            if (!lastUser || lastUser.content !== msgContent) {
              const msgSource = event.data?.source as ChatMessage['source'];
              appendToAgentChat({
                role: 'user',
                content: msgContent,
                timestamp: new Date(),
                ...(msgSource && { source: msgSource }),
              });
            }
          }
          break;
        }

        case 'message_break': {
          // Force the next text_delta to start a new message instead of
          // appending to the previous one.  Emitted before background tasks
          // (e.g. calendar events) so their output doesn't merge into the
          // user's current conversation bubble.
          set(state => {
            const updates: Partial<typeof state> = {};

            // Break the desktop singleton chat feed
            if (isActiveSession) {
              const lastMsg = state.chatMessages[state.chatMessages.length - 1];
              if (lastMsg && lastMsg.role === 'agent') {
                updates.chatMessages = appendMessage(state.chatMessages, { role: 'system', content: '', timestamp: new Date() });
              }
            }

            // Break the per-agent chat feed too
            const pa = state.platformAgents[eventPlatform];
            if (pa) {
              const agentChat = pa.chatMessages || [];
              const lastAgentMsg = agentChat[agentChat.length - 1];
              if (lastAgentMsg && lastAgentMsg.role === 'agent') {
                updates.platformAgents = {
                  ...state.platformAgents,
                  [eventPlatform]: {
                    ...pa,
                    chatMessages: [...agentChat, { role: 'system' as const, content: '', timestamp: new Date() }],
                  },
                };
              }
            }

            return updates;
          });
          break;
        }

        case 'text_delta': {
          // Streaming text from agent — route to the correct agent's chat feed
          const text = event.data?.delta as string || '';
          const textSubagentId = event.data?.subagentId as string | undefined;

          // Child agent text goes to tracker activity, not the main chat feed.
          // Without this guard, child text_delta creates ghost platform agent entries.
          // We accumulate text deltas into a single activity instead of creating one per token.
          if (textSubagentId && textSubagentId !== 'orchestrator') {
            useAgentTrackerStore.getState().appendSubAgentText(textSubagentId, text);
            break;
          }

          // Single atomic update: accumulate responseText + chatMessages for
          // this agent, and update desktop singletons if desktop.
          set(state => {
            const pa = getOrCreateAgent(state);
            const responseText = (pa.responseText || '') + text;

            // Update per-agent chatMessages
            const agentChat = pa.chatMessages || [];
            const lastAgentMsg = agentChat[agentChat.length - 1];
            let updatedAgentChat: ChatMessage[];
            if (lastAgentMsg && lastAgentMsg.role === 'agent' && !lastAgentMsg.isError) {
              updatedAgentChat = [...agentChat];
              updatedAgentChat[updatedAgentChat.length - 1] = {
                ...lastAgentMsg,
                content: lastAgentMsg.content + text,
              };
            } else if (!text.trim()) {
              updatedAgentChat = agentChat;
            } else {
              updatedAgentChat = [...agentChat, { role: 'agent' as const, content: text, timestamp: new Date() }];
            }

            const updates: Partial<typeof state> = {
              platformAgents: {
                ...state.platformAgents,
                [eventPlatform]: {
                  ...pa,
                  responseText,
                  thinking: null,
                  chatMessages: updatedAgentChat,
                },
              },
            };

            // Desktop singleton: keep backward compat for ChatWindow
            if (isActiveSession && !chatHistoryLoading) {
              const lastMsg = state.chatMessages[state.chatMessages.length - 1];
              if (lastMsg && lastMsg.role === 'agent' && !lastMsg.isError) {
                const updatedMessages = [...state.chatMessages];
                updatedMessages[updatedMessages.length - 1] = {
                  ...lastMsg,
                  content: lastMsg.content + text,
                };
                updates.chatMessages = updatedMessages;
                updates.agentThinking = null;
              } else if (!text.trim()) {
                updates.agentThinking = null;
              } else {
                updates.chatMessages = appendMessage(state.chatMessages, { role: 'agent', content: text, timestamp: new Date() });
                updates.agentThinking = null;
              }
            }

            return updates;
          });
          break;
        }

        case 'agent_attachments': {
          const paths = event.data?.attachments as string[] || [];
          if (paths.length === 0) break;

          set(state => {
            const updates: Partial<typeof state> = {};

            // Update platform agent chat messages
            const pa = getOrCreateAgent(state);
            const agentChat = pa.chatMessages || [];
            const lastAgentMsg = [...agentChat].reverse().find(m => m.role === 'agent');
            if (lastAgentMsg) {
              const updatedChat = agentChat.map(m =>
                m === lastAgentMsg ? { ...m, attachments: [...(m.attachments || []), ...paths] } : m
              );
              updates.platformAgents = {
                ...state.platformAgents,
                [eventPlatform]: { ...pa, chatMessages: updatedChat },
              };
            }

            // Desktop singleton
            if (isActiveSession) {
              const lastMsg = [...state.chatMessages].reverse().find(m => m.role === 'agent');
              if (lastMsg) {
                updates.chatMessages = state.chatMessages.map(m =>
                  m === lastMsg ? { ...m, attachments: [...(m.attachments || []), ...paths] } : m
                );
              }
            }

            return updates;
          });
          break;
        }

        case 'thinking': {
          // Legacy thinking event — ignore, replaced by thinking_start/delta/end
          break;
        }

        case 'thinking_start': {
          // Ignore stale events after agent was stopped
          if (!get().agentRunning) break;
          // Ignore child subagent thinking — only show main/orchestrator thinking
          const thinkSub = event.data?.subagentId as string | undefined;
          if (thinkSub && thinkSub !== 'orchestrator') break;
          // Show the thinking indicator with empty buffer
          set({ agentThinkingStream: '' });
          break;
        }

        case 'thinking_delta': {
          // Ignore stale events after agent was stopped
          if (!get().agentRunning) break;
          // Ignore child subagent thinking — only show main/orchestrator thinking
          const thinkDeltaSub = event.data?.subagentId as string | undefined;
          if (thinkDeltaSub && thinkDeltaSub !== 'orchestrator') break;
          // Append actual LLM thinking tokens
          const chunk = event.data?.content as string || '';
          if (chunk) {
            set(state => ({ agentThinkingStream: (state.agentThinkingStream || '') + chunk }));
          }
          break;
        }

        case 'thinking_end': {
          // Ignore child subagent thinking — only show main/orchestrator thinking
          const thinkEndSub = event.data?.subagentId as string | undefined;
          if (thinkEndSub && thinkEndSub !== 'orchestrator') break;
          // Signal end — the component handles the 500ms fade delay
          set({ agentThinkingStream: null });
          break;
        }

        case 'tool_call': {
          // Ignore stale events after agent was stopped
          if (!get().agentRunning) break;
          const tool = event.data?.tool as string || event.data?.name as string || 'tool';
          const params = (event.data?.params ?? event.data?.args ?? event.data?.input) as Record<string, unknown> | undefined;
          const toolSubagentId = event.data?.subagentId as string | undefined;
          // Agent may specify which workspace this tool's window should open in
          const toolWorkspaceId = event.data?.workspace_id as string | undefined;

          // Track tool activity for ALL agents using the defensive helper
          const toolPlatform = event.data?.platform as string | undefined;
          // For composio, show the toolkit name instead of "composio" in the currentTool pill
          const currentToolDisplay = tool === 'composio'
            ? composioDisplayTool(params)
            : tool;
          if (!toolSubagentId) {
            updateAgent(pa => {
              const history = (pa.toolHistory || []).slice(-19);
              history.push({ tool: currentToolDisplay, timestamp: Date.now() });
              return { currentTool: currentToolDisplay, toolHistory: history };
            });
          }

          // Build descriptive activity message
          const { text: activityText, activityType } = describeToolCall(tool, params);

          // If this tool call belongs to a subagent, route it to the tracker
          // store instead of the main chat feed.
          if (toolSubagentId) {
            useAgentTrackerStore.getState().addSubAgentActivity(toolSubagentId, {
              text: activityText,
              activityType: activityType || 'tool',
              timestamp: Date.now(),
            });
            // Auto-open the relevant window even for subagent tool calls
            // (e.g. open the browser window when a subagent navigates).
            // Skip browser — its windows are created by the tabs reconciler.
            const subagentWindowType = toolToWindowType(tool, params);
            if (subagentWindowType && subagentWindowType !== 'browser' && subagentWindowType !== 'editor') {
              // For terminal windows, use the terminalSession assigned by the agent
              // (from child:spawned event) so sequential children reuse the same
              // terminal window instead of opening a new one each time.
              let subMeta: Record<string, unknown> | undefined;
              if (subagentWindowType === 'terminal' && toolSubagentId) {
                const trackerState = useAgentTrackerStore.getState();
                // Look up the child's assigned terminal session from the tracker
                const termSession = trackerState.getSubAgentTerminalSession?.(toolSubagentId);
                subMeta = { terminalId: termSession || `term_${toolSubagentId}` };
              }
              useWindowStore.getState().ensureWindowOpen(subagentWindowType, toolWorkspaceId, subMeta);
            }
            break;
          }

          // Skip chat message for delegation/consultation/background tools —
          // their dedicated *:started events create the proper OperationCard.
          // Also skip respond_directly/respond_to_user — these are terminal
          // tools whose output arrives as text_delta, not as a tool bubble.
          // Skip spawn_agent/wait_for_agents/check_agent_status — child lifecycle
          // events (child:spawned etc.) populate the OperationCard instead.
          if (tool === 'delegate_task' || tool === 'consult_experts' || tool === 'background_task'
              || tool === 'respond_directly' || tool === 'respond_to_user'
              || tool === 'spawn_agent' || tool === 'wait_for_agents' || tool === 'check_agent_status'
              || tool === 'cancel_agent' || tool === 'list_active_agents'
              || tool === 'web_scrape') { // tinyfish:start event handles the activity + window
            break;
          }
          // Skip tools with empty descriptions (e.g. respond_directly fallback)
          if (!activityText) {
            break;
          }

          // ── Unified window routing for ALL agents ──
          // Use sessionKey from the event to resolve the correct workspace.
          // This works for desktop ('default' → 'main'), platform agents
          // (telegram_123 → telegram workspace), and subagent workspaces.
          const eventSessionKey = event.data?.sessionKey as string | undefined;
          const targetWsId = toolWorkspaceId ||
            'main';
          const isNonDesktopPlatform = toolPlatform && toolPlatform !== 'desktop';

          const windowType = toolToWindowType(tool, params);
          if (windowType && windowType !== 'browser' && windowType !== 'editor') {
            // Cancel any pending auto-close for this window type (agent is still using it)
            cancelAutoClose(windowType);
            // Open window and track as auto-opened
            const newWinId = useWindowStore.getState().ensureWindowOpen(windowType, targetWsId);
            if (newWinId) autoOpenedWindowIds.add(newWinId);
          }

          // Browser: focus existing window in THIS session's workspace, kick reconciler
          if (windowType === 'browser') {
            const wStore = useWindowStore.getState();
            const existingBrowser = wStore.windows.find(
              w => w.type === 'browser' && w.state !== 'minimized' && w.workspaceId === targetWsId
            );
            if (existingBrowser) {
              wStore.focusWindow(existingBrowser.id);
            }
            // Store the sessionKey so the browser tab reconciler can route
            // new daemon tabs to the correct workspace.
            if (eventSessionKey) {
              set(state => ({
                browserState: {
                  ...state.browserState,
                  pendingBrowserSessionKey: eventSessionKey,
                },
              }));
            }
            browserWS.sendAction({ action: 'getTabs' });
          }

          // Special case: desktop tool with action param
          let desktopWindowType: WindowType | null = null;
          if (tool === 'desktop') {
            const action = params?.action as string | undefined;
            if (action) {
              desktopWindowType = desktopActionToWindowType(action);
              if (desktopWindowType && desktopWindowType !== 'browser' && desktopWindowType !== 'editor') {
                useWindowStore.getState().ensureWindowOpen(desktopWindowType, targetWsId);
              }
            }
          }

          // Append tool activity to the correct agent's per-agent chat feed
          // For composio, show the toolkit name instead of "composio" as the tool badge
          const displayTool = tool === 'composio'
            ? composioDisplayTool(params)
            : tool;
          const toolActivityMsg: ChatMessage = {
            role: 'activity' as const,
            content: activityText,
            timestamp: new Date(),
            tool: displayTool,
            activityType,
          };
          appendToAgentChat(toolActivityMsg);

          // For non-desktop: don't update desktop singletons (agentThinking, agentActivity)
          if (isNonDesktopPlatform) {
            break;
          }

          // Desktop-only: update singletons for backward compat
          set(state => {
            const newActivity = { ...state.agentActivity };
            if (windowType) newActivity[windowType] = true;
            if (desktopWindowType) newActivity[desktopWindowType] = true;
            return {
              agentThinking: activityText + '...',
              agentActivity: newActivity,
            };
          });
          break;
        }

        case 'tool_result': {
          const tool = event.data?.tool as string || event.data?.name as string || '';
          const resultSubagentId = event.data?.subagentId as string | undefined;

          // Schedule auto-close for windows opened by this tool type
          if (!resultSubagentId) {
            const windowType = toolToWindowType(tool);
            if (windowType) scheduleAutoClose(windowType);
          }

          // Clear currentTool using the defensive helper
          if (!resultSubagentId) {
            updateAgent(() => ({ currentTool: undefined }));
          }

          // Skip main agent state updates for subagent tool results
          if (!resultSubagentId) {
            const windowType = toolToWindowType(tool);
            if (windowType) {
              const { [windowType]: _, ...rest } = get().agentActivity;
              set({ agentActivity: rest, agentThinking: null });
            } else {
              set({ agentThinking: null });
            }
          }

          // Clear TinyFish overlay when web_scrape tool completes (safety net).
          if (tool === 'web_scrape' || tool === 'web_search') {
            const tfSubagentId = (event.data?.subagentId as string) || 'main';
            const { browserState: bs } = get();
            const { [tfSubagentId]: _removed, ...remainingStreams } = bs.tinyfishStreams;

            // Close the TinyFish browser window
            const tfWindowId = findWindowForTinyfish(tfSubagentId);
            if (tfWindowId) {
              _frameRenderers.delete(tfWindowId);
              _canvasClearFns.delete(tfWindowId);
              useWindowStore.getState().closeWindow(tfWindowId);
            }

            set({
              browserState: {
                ...bs,
                tinyfishStreams: remainingStreams,
              },
            });
          }

          // Extract screenshot from browser tool results as fallback frame
          if (tool.startsWith('browser_')) {
            const result = event.data?.result as Record<string, unknown> | undefined;
            const screenshotB64 = (result?.screenshot ?? event.data?.screenshot) as string | undefined;
            if (screenshotB64) {
              // Convert base64 → Blob for the binary rendering pipeline
              const bin = atob(screenshotB64);
              const u8 = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
              const mime = screenshotB64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
              // Pass subagentId so the frame routes to the correct window
              get().setBrowserFrame(new Blob([u8], { type: mime }), false, resultSubagentId);
            }
            // Update URL/title from navigation results
            const url = (result?.url ?? event.data?.url) as string | undefined;
            const title = (result?.title ?? event.data?.title) as string | undefined;
            if (url || title) {
              const { browserState } = get();
              set({
                browserState: {
                  ...browserState,
                  url: url || browserState.url,
                  title: title || browserState.title,
                  isLoading: false,
                },
              });
            }
          }
          break;
        }

        case 'status_change': {
          const status = event.data?.status as string;
          const statusPlatform = event.data?.platform as string | undefined;
          // Skip non-desktop status changes — they are handled by the
          // platform_agent:idle event and should not reset desktop agentRunning.
          if (statusPlatform && statusPlatform !== 'desktop') break;
          // For non-active sessions going idle, just clean up runningSessions tracking
          if (status === 'idle' && !isActiveSession) {
            const nextRunning = new Set(get().runningSessions);
            nextRunning.delete(eventSessionKey);
            set({ runningSessions: nextRunning });
            break;
          }
          // Non-idle status → mark agent as running (catches app notifications
          // and other server-initiated agent loops that didn't start from chat)
          if (status !== 'idle' && isActiveSession) {
            if (!get().agentRunning) {
              resetAgentRunningTimer(get, set);
              const nextRunning = new Set(get().runningSessions);
              nextRunning.add(eventSessionKey);
              set({ agentRunning: true, runningSessions: nextRunning });
            }
            set({ agentStatusLabel: status });
          }

          if (status === 'idle') {
            // Agent loop is fully done — clear everything including TinyFish state
            clearAgentRunningTimer();
            // Auto-close all tool-opened windows after a short delay
            closeAllAutoOpened(2000);
            // Notify user that agent finished (only if it was running and tab is hidden)
            if (get().agentRunning && document.hidden) {
              useNotificationStore.getState().addNotification({
                title: 'Agent finished',
                body: 'Your request has been completed.',
                source: 'agent',
                variant: 'success',
              }, 3000);
            }
            const { browserState: bs } = get();

            // Close all TinyFish browser windows
            const wStore = useWindowStore.getState();
            const tfWindows = wStore.windows.filter(w =>
              w.type === 'browser' && w.metadata?.tinyfishSubagentId
            );
            for (const tfWin of tfWindows) {
              _frameRenderers.delete(tfWin.id);
              _canvasClearFns.delete(tfWin.id);
              wStore.closeWindow(tfWin.id);
            }

            // Clean up any lingering tracker operations/subagents — catches
            // cases where child:complete/failed events were lost or delayed.
            {
              const tracker = useAgentTrackerStore.getState();
              for (const [id, op] of Object.entries(tracker.operations)) {
                if (op.status === 'running' || op.status === 'aggregating') {
                  // Mark as complete (not failed) since the orchestrator finished normally
                  tracker.updateOperationStatus(id, 'complete');
                  for (const sub of op.subAgents) {
                    if (sub.status === 'running' || sub.status === 'pending') {
                      tracker.updateSubAgent(id, sub.id, { status: 'complete', completedAt: Date.now() });
                    }
                  }
                }
              }
            }

            // Reset the desktop platform agent to not-running
            const currentPlatformAgents = get().platformAgents;
            const updatedPlatformAgents = { ...currentPlatformAgents };
            if (updatedPlatformAgents.desktop) {
              updatedPlatformAgents.desktop = { ...updatedPlatformAgents.desktop, running: false, currentTool: undefined, thinking: null, completedAt: Date.now() };
            }

            const nextRunning = new Set(get().runningSessions);
            nextRunning.delete(eventSessionKey);

            set({
              agentThinking: null,
              agentThinkingStream: null,
              agentRunning: false,
              agentStatusLabel: null,
              runningSessions: nextRunning,
              agentActivity: {},
              queuedMessageCount: 0,
              taskProgress: null,
              platformAgents: updatedPlatformAgents,
              browserState: {
                ...bs,
                tinyfishStreams: {},
              },
            });
          }
          break;
        }

        case 'desktop_state': {
          // Initial sync: backend sends the full list of windows that should be open.
          // This fires when the agent WS connects (page load / reconnect).
          const windows = event.data?.windows as string[] | undefined;
          if (Array.isArray(windows) && windows.length > 0) {
            logger.info('Syncing desktop state:', windows);
            // Filter out browser and editor — browser windows are created by the
            // tabs reconciler when daemon tab broadcasts arrive; editor windows
            // require a file path (via editorStore) and can't be meaningfully
            // restored from just the type string.
            const nonBrowserWindows = windows.filter(w => w !== 'browser' && w !== 'editor') as WindowType[];
            if (nonBrowserWindows.length > 0) {
              useWindowStore.getState().openWindowsGrid(nonBrowserWindows);
            }
          }
          break;
        }

        case 'apps_changed': {
          useAppStore.getState().fetchApps();
          break;
        }

        case 'dev_app_tool_call': {
          const { callId, appId: devCallAppId, toolName: devToolName, arguments: devToolArgs } = event.data as {
            callId: string; appId: string; toolName: string; arguments: Record<string, unknown>;
          };
          import('@/stores/devAppStore').then(({ useDevAppStore }) => {
            useDevAppStore.getState().handleToolCall(callId, devCallAppId, devToolName, devToolArgs || {});
          });
          break;
        }

        case 'local_app_updated': {
          const updatedAppId = event.data?.appId as string;
          if (updatedAppId) {
            const localRef = localAppIframeRefs.get(updatedAppId);
            if (localRef?.current) {
              localRef.current.src = localRef.current.src; // force iframe reload
            }
          }
          useAppStore.getState().fetchApps();
          break;
        }

        case 'local_app_state_updated': {
          const stateAppId = event.data?.appId as string;
          const newState = event.data?.state;
          if (stateAppId && newState !== undefined) {
            const localRef = localAppIframeRefs.get(stateAppId);
            if (localRef?.current?.contentWindow) {
              localRef.current.contentWindow.postMessage(
                { type: 'construct:state_updated', state: newState },
                '*',
              );
            }
          }
          break;
        }

        case 'desktop_action': {
          const action = event.data?.action as string;
          const params = event.data?.params as Record<string, unknown> | undefined;
          // Resolve workspace from explicit workspace_id or sessionKey
          const actionSessionKey = event.data?.sessionKey as string | undefined;
          const actionWorkspaceId = (event.data?.workspace_id as string | undefined) ||
            'main';
          const windowType = desktopActionToWindowType(action);

          if (windowType && windowType !== 'browser' && windowType !== 'editor') {
            useWindowStore.getState().ensureWindowOpen(windowType, actionWorkspaceId);
          }

          // Opening browser creates a new browser window
          if (action === 'open_browser') {
            const url = params?.url as string | undefined;
            get().openBrowserWindow(url);
          }

          // Open a local or installed app by ID
          if (action === 'open_app') {
            const openAppId = params?.appId as string;
            if (openAppId) {
              // Check local apps first (manifest has dimensions), then MCP apps
              const localApp = useAppStore.getState().localApps.find((a) => a.id === openAppId);
              const mcpApp = useAppStore.getState().installedApps.find((a) => a.id === openAppId);
              const title = localApp?.manifest?.name || mcpApp?.name || openAppId;
              const win = localApp?.manifest?.window;
              useWindowStore.getState().openWindow('app', {
                title,
                metadata: { appId: openAppId },
                ...(win?.width && { width: win.width }),
                ...(win?.height && { height: win.height }),
                ...(win?.minWidth && { minWidth: win.minWidth }),
                ...(win?.minHeight && { minHeight: win.minHeight }),
              });
            }
          }
          break;
        }

        case 'workspace_action':
        case 'window:move_to_workspace':
        case 'browser:move_to_workspace': {
          // Removed — workspaces are client-side only
          break;
        }
        case '__deprecated_workspace_action': {
          const wsAction = event.data?.action as string | undefined;
          const wsName = event.data?.name as string | undefined;
          const wsPlatform = (event.data?.platform as import('@/types').WorkspacePlatform) ?? 'desktop';
          const wsTargetId = event.data?.workspace_id as string | undefined;

          if (wsAction === 'create' && wsName) {
            const autoSwitch = event.data?.auto_switch !== false;  // Default true
            const newId = useWindowStore.getState().createWorkspace({
              id: wsTargetId,  // Agent may pre-assign an ID (e.g. for delegate_task)
              name: wsName,
              platform: wsPlatform,
            });
            // Only switch to the new workspace if auto_switch is not disabled.
            // delegate_task sets auto_switch: false to avoid rapid cascading
            // state updates when creating multiple workspaces at once.
            if (autoSwitch) {
              useWindowStore.getState().switchWorkspace(newId);
            }
          } else if (wsAction === 'switch' && wsTargetId) {
            useWindowStore.getState().switchWorkspace(wsTargetId);
          } else if (wsAction === 'delete' && wsTargetId) {
            useWindowStore.getState().deleteWorkspace(wsTargetId);
          }
          break;
        }

        case 'window:close': {
          // Agent closed an app — tear down the frontend window.
          // Supports closing by: terminalId (metadata match), windowId,
          // windowType+workspaceId, or windowType (all of that type).
          const closeWindowId = event.data?.windowId as string | undefined;
          const closeType = event.data?.windowType as WindowType | undefined;
          const closeWsId = event.data?.workspaceId as string | undefined;
          const closeTerminalId = event.data?.terminalId as string | undefined;
          if (closeTerminalId) {
            // Close terminal window matching this terminalId in metadata
            const wStore = useWindowStore.getState();
            const match = wStore.windows.find(
              w => w.type === 'terminal' && w.metadata?.terminalId === closeTerminalId
            );
            if (match) {
              wStore.closeWindow(match.id);
              logger.info('Closed terminal window:', closeTerminalId);
            }
          } else if (closeWindowId) {
            logger.info('Agent closed window:', closeWindowId);
            useWindowStore.getState().closeWindow(closeWindowId);
          } else if (closeType && closeWsId) {
            // Close windows of this type only in the specified workspace
            const wStore = useWindowStore.getState();
            const toClose = wStore.windows.filter(
              w => w.type === closeType && w.workspaceId === closeWsId
            );
            for (const win of toClose) {
              wStore.closeWindow(win.id);
            }
            logger.info(`Closed ${toClose.length} ${closeType} window(s) in workspace ${closeWsId}`);
          } else if (closeType) {
            logger.info('Agent closed all windows of type:', closeType);
            useWindowStore.getState().closeWindowsByType(closeType);
          }
          break;
        }
        case 'todo:updated': {
          // Live todo list update from the agent's todo_list tool.
          const todo = event.data?.todo as TodoListState | null | undefined;
          set({ todoList: todo ?? null });

          // Also store per-session todo lists for the tracker.
          // The event now includes a `sessions` array with per-session data.
          const sessions = (todo as any)?.sessions as Array<{
            sessionKey: string;
            goal: string;
            items: Array<{ id: number; text: string; status: string }>;
          }> | undefined;
          if (sessions && sessions.length > 0) {
            set(state => {
              const updated = { ...state.platformAgents };
              for (const session of sessions) {
                // Find the platform agent that matches this session key
                for (const pa of Object.values(updated)) {
                  if (pa.sessionKey === session.sessionKey || (pa.platform === 'desktop' && session.sessionKey === 'default')) {
                    if (pa.platform) updated[pa.platform] = {
                      ...pa,
                      todoGoal: session.goal,
                      todoItems: session.items,
                    };
                    break;
                  }
                }
              }
              return { platformAgents: updated };
            });
          }
          break;
        }

        case 'browser:screenshot': {
          // Agent took a screenshot via browser tool. Both main and subagents
          // emit this. Main agent: forceDisplay. Subagent: display only if the
          // user is viewing that subagent's tab.
          // Convert base64 → Blob for the binary rendering pipeline.
          const base64 = event.data?.data as string || event.data?.screenshot as string;
          const screenshotSubagentId = event.data?.subagentId as string | undefined;
          if (base64) {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const mimeType = base64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
            const blob = new Blob([bytes], { type: mimeType });
            get().setBrowserFrame(blob, !screenshotSubagentId, screenshotSubagentId);
          }
          break;
        }

        case 'browser:navigated': {
          // Update tab URL/title when an agent finishes navigating.
          // Also update the corresponding browser window's title.
          const navUrl = event.data?.url as string | undefined;
          const navTitle = event.data?.title as string | undefined;
          const navSubagentId = event.data?.subagentId as string | undefined;
          if (navUrl) {
            const { browserState } = get();
            if (navSubagentId) {
              // Update the subagent's tab URL and window title
              const tabIdx = browserState.tabs.findIndex(t => t.subagentId === navSubagentId);
              if (tabIdx >= 0) {
                const tabs = [...browserState.tabs];
                tabs[tabIdx] = { ...tabs[tabIdx], url: navUrl, title: navTitle || tabs[tabIdx].title };
                set({ browserState: { ...browserState, tabs } });
              }
              // Update the window title + URL
              const winId = findWindowForSubagent(navSubagentId);
              if (winId) {
                const ws = useWindowStore.getState();
                const win = ws.windows.find(w => w.id === winId);
                ws.updateWindow(winId, {
                  ...(navTitle && { title: navTitle }),
                  metadata: { ...win?.metadata, url: navUrl },
                });
              }
            } else {
              // Main agent navigation — update state and active window title
              set({
                browserState: {
                  ...browserState,
                  url: navUrl,
                  title: navTitle || browserState.title,
                  isLoading: false,
                },
              });
              // Update the window title + URL for the daemon's active tab
              const daemonTabId = browserState.daemonActiveTabId;
              if (daemonTabId) {
                const winId = findWindowForDaemonTab(daemonTabId);
                if (winId) {
                  const ws = useWindowStore.getState();
                  const win = ws.windows.find(w => w.id === winId);
                  ws.updateWindow(winId, {
                    ...(navTitle && { title: navTitle }),
                    metadata: { ...win?.metadata, url: navUrl },
                  });
                }
              }
            }
          }
          break;
        }

        case 'browser:tab_opened': {
          // A subagent or background task opened a dedicated browser tab.
          // We only store the subagent annotation here — the actual window
          // is created by the tabs reconciler when the daemon broadcasts
          // its tab list with the correct stable tab ID. Creating windows
          // here would use the agentId as daemonTabId (wrong — daemon uses
          // "tab-N" IDs), causing duplicate windows and flickering.
          const tabIndex = event.data?.index as number;
          const subagentId = event.data?.subagentId as string;
          const label = event.data?.label as string | undefined;
          const tabWorkspaceId = event.data?.workspace_id as string | undefined;
          if (subagentId) {
            const { browserState } = get();

            // Store in subagentTabMap by index for stable matching across daemon polls.
            // Also store workspace_id so the reconciler can place the window correctly.
            const subagentTabMap = { ...browserState.subagentTabMap };
            const subagentAnnotations = { ...browserState.subagentAnnotations };
            const annotation = { subagentId, subagentLabel: label, workspaceId: tabWorkspaceId };
            if (typeof tabIndex === 'number' && tabIndex >= 0) {
              subagentTabMap[tabIndex] = annotation;
            }
            // Also store by subagentId for reverse lookup (resilient to index drift)
            subagentAnnotations[subagentId] = { ...annotation, hintIndex: typeof tabIndex === 'number' ? tabIndex : -1 };

            set({ browserState: { ...browserState, subagentTabMap, subagentAnnotations } });

            // Trigger an immediate tab poll so the reconciler creates the
            // window promptly (instead of waiting up to 2s for the next poll)
            browserWS.sendAction({ action: 'getTabs' });
          }
          break;
        }

        case 'browser:tab_closed': {
          // A subagent's dedicated tab was closed (subagent finished).
          // Close the corresponding browser window and clean up.
          const tabId = event.data?.tabId as string;
          const closedSubagentId = event.data?.subagentId as string;
          if (tabId) {
            const { browserState } = get();

            // Find and close the corresponding window
            const windowId = findWindowForDaemonTab(tabId)
              || (closedSubagentId ? findWindowForSubagent(closedSubagentId) : undefined);
            if (windowId) {
              _frameRenderers.delete(windowId);
              _canvasClearFns.delete(windowId);
              useWindowStore.getState().closeWindow(windowId);
            }

            // Clean up frame cache
            _tabBlobCache.delete(tabId);
            if (closedSubagentId) _tabBlobCache.delete(closedSubagentId);

            // Find the closed tab index for subagentTabMap shifting
            const closedIndex = browserState.tabs.findIndex(t => t.id === tabId);

            // Update subagentTabMap: remove closed index, shift higher indices
            const subagentTabMap: Record<number, { subagentId: string; subagentLabel?: string; workspaceId?: string }> = {};
            if (closedIndex >= 0) {
              for (const [idxStr, annotation] of Object.entries(browserState.subagentTabMap)) {
                const idx = Number(idxStr);
                if (idx < closedIndex) subagentTabMap[idx] = annotation;
                else if (idx > closedIndex) subagentTabMap[idx - 1] = annotation;
              }
            } else {
              for (const [idxStr, annotation] of Object.entries(browserState.subagentTabMap)) {
                if (annotation.subagentId !== closedSubagentId) {
                  subagentTabMap[Number(idxStr)] = annotation;
                }
              }
            }

            // Clean up subagentAnnotations for the closed subagent
            const subagentAnnotations = { ...browserState.subagentAnnotations };
            if (closedSubagentId) {
              delete subagentAnnotations[closedSubagentId];
            }

            // Update internal tabs tracking
            const tabs = closedIndex >= 0
              ? browserState.tabs.filter((_, i) => i !== closedIndex)
              : browserState.tabs.filter(t => t.id !== tabId);

            set({
              browserState: {
                ...browserState,
                tabs,
                activeTabId: tabs.length > 0 ? tabs[0]?.id : null,
                subagentTabMap,
                subagentAnnotations,
              },
            });
          }
          break;
        }

        case 'session:renamed': {
          // Auto-generated (or manually renamed) session title
          const sessionKey = event.data?.sessionKey as string;
          const title = event.data?.title as string;
          if (sessionKey && title) {
            const { chatSessions } = get();
            set({
              chatSessions: chatSessions.map(s =>
                s.key === sessionKey ? { ...s, title } : s
              ),
            });
          }
          break;
        }

        case 'ask_user': {
          // Agent is asking the user a question with clickable options
          const questionId = event.data?.questionId as string;
          const question = event.data?.question as string;
          const options = event.data?.options as AskUserOption[] || [];
          const allowCustom = !!event.data?.allowCustom;

          if (questionId && question) {
            const askMsg: ChatMessage = {
              role: 'agent',
              content: question,
              timestamp: new Date(),
              askUser: { questionId, question, options, allowCustom },
            };
            if (isActiveSession) {
              set(state => ({
                chatMessages: appendMessage(state.chatMessages, askMsg),
              }));
            }
          }
          break;
        }

        case 'notification': {
          // Agent sent a desktop notification — show it as a toast
          const title = event.data?.title as string || 'Agent Notification';
          const body = event.data?.body as string | undefined;
          const source = event.data?.source as string | undefined;
          const variant = event.data?.variant as 'info' | 'success' | 'error' | undefined;
          // Help requests get a longer toast duration (30s) so the user doesn't miss them
          const isHelpRequest = source === 'Help Request';
          const toastDuration = isHelpRequest ? 30_000 : undefined;
          useNotificationStore.getState().addNotification({ title, body, source, variant }, toastDuration);
          break;
        }

        case 'auth_connect': {
          // A tool requires OAuth — show a connect card in the main chat + a clickable notification
          const acToolkit = event.data?.toolkit as string || 'service';
          const acName = event.data?.name as string || acToolkit;
          const acDesc = event.data?.description as string || 'Connect your account to continue';
          const acUrl = event.data?.url as string || '';

          if (acUrl) {
            // 1. Persist the card to sessionStorage so it survives page refresh
            pendingAuthCards.set(acToolkit.toLowerCase(), {
              toolkit: acToolkit, name: acName, description: acDesc, url: acUrl, timestamp: Date.now(),
            });
            saveAuthCards(pendingAuthCards);

            // 2. Add a chat message with the AUTH_CONNECT marker so the card renders
            const marker = `<!--AUTH_CONNECT:${JSON.stringify({ toolkit: acToolkit, name: acName, description: acDesc, url: acUrl })}-->`;
            const authChatMsg: ChatMessage = {
              role: 'agent',
              content: `${marker}\n\nI'll automatically continue once you've connected.`,
              timestamp: new Date(),
            };
            if (isActiveSession) {
              set(state => ({
                chatMessages: appendMessage(state.chatMessages, authChatMsg),
              }));
            }

            // 3. Show a clickable desktop notification (30s so user doesn't miss it)
            const notifId = useNotificationStore.getState().addNotification({
              title: `Connect ${acName}`,
              body: acDesc,
              source: acName,
              variant: 'info',
              onClick: () => openAuthRedirect(acUrl),
            }, 30_000);
            if (notifId) {
              authConnectNotifIds.set(acToolkit.toLowerCase(), notifId);
            }
          }
          break;
        }

        case 'email:received': {
          // Increment unread email badge counter.
          // The notification toast is handled separately by the 'notification'
          // event emitted alongside this one from the agent.
          set(state => ({ emailUnreadCount: state.emailUnreadCount + 1 }));
          // Trigger EmailWindow refresh so new received emails appear immediately
          window.dispatchEvent(new CustomEvent('agent-email-refresh'));
          break;
        }

        case 'email:sent': {
          // Agent sent/replied/forwarded an email — trigger EmailWindow refresh
          // so the sent email appears immediately in the email app.
          window.dispatchEvent(new CustomEvent('agent-email-refresh'));
          break;
        }

        case 'slack:approval_request': {
          // A Slack GUEST user requested permission for a restricted action.
          // Increment the pending approval badge and show a notification that
          // opens the Access Control window when clicked.
          set(state => ({ pendingApprovalCount: state.pendingApprovalCount + 1 }));
          const userName = (event.data?.displayName as string) || (event.data?.slackUsername as string) || 'A Slack user';
          const toolName = event.data?.toolName as string || 'a restricted tool';
          useNotificationStore.getState().addNotification(
            {
              title: `Permission Request`,
              body: `${userName} wants to use ${toolName}`,
              source: 'Access Control',
              variant: 'info',
              onClick: () => {
                useWindowStore.getState().ensureWindowOpen('access-control');
              },
            },
            15_000, // 15s toast — give the owner time to notice
          );
          break;
        }

        case 'access:approval_request': {
          // A user requested permission for a restricted action via any platform.
          // Increment the pending approval badge and show a notification that
          // opens the Access Control window when clicked.
          set(state => ({ pendingApprovalCount: state.pendingApprovalCount + 1 }));
          const accessUserName = (event.data?.senderName as string) || (event.data?.displayName as string) || (event.data?.senderHandle as string) || (event.data?.username as string) || 'A user';
          const accessToolName = event.data?.toolName as string || 'a restricted action';
          useNotificationStore.getState().addNotification(
            {
              title: `Permission Request`,
              body: `${accessUserName} wants to use ${accessToolName}`,
              source: 'Access Control',
              variant: 'info',
              onClick: () => {
                useWindowStore.getState().ensureWindowOpen('access-control');
              },
            },
            15_000, // 15s toast — give the owner time to notice
          );
          break;
        }

        case 'message_queued': {
          // A user message was added to the agent's inbox (agent was busy)
          const position = event.data?.position as number || 1;
          set({ queuedMessageCount: position });
          break;
        }

        case 'message_dequeued': {
          // A queued message was injected into the conversation
          const count = get().queuedMessageCount;
          set({ queuedMessageCount: Math.max(0, count - 1) });
          break;
        }

        case 'task_progress': {
          const step = event.data?.step as number || 0;
          const maxSteps = event.data?.maxSteps as number || 180;
          // Store step progress for the correct agent (always, never drops)
          updateAgent(() => ({ stepProgress: { step, maxSteps } }));
          // Desktop singleton: backward compat
          if (isDesktop) {
            set({
              taskProgress: {
                taskId: event.data?.taskId as string || '',
                step,
                maxSteps,
                continuation: event.data?.continuation as number || 0,
                maxContinuations: event.data?.maxContinuations as number || 5,
                currentTool: event.data?.currentTool as string | undefined,
              },
            });
          }
          break;
        }

        case 'step_complete': {
          break;
        }

        case 'model_fallback':
          // Legacy event — no longer emitted, ignore
          break;

        case 'usage_warning': {
          const threshold = event.data?.threshold as number || 100;
          const resetsAt = event.data?.resetsAt as string | undefined;
          if (threshold >= 100) set({ isOnLiteModel: true });
          const resetStr = resetsAt
            ? new Date(resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'soon';

          const message = threshold >= 100
            ? `Usage limit reached. Resets at ${resetStr}. Consider adding credits in Settings > Subscription.`
            : `Usage at ${threshold}% for this period. Resets at ${resetStr}.`;

          appendToAgentChat({
            role: 'system',
            content: message,
            timestamp: new Date(),
          });
          break;
        }

        case 'llm_usage': {
          const prompt = event.data?.promptTokens as number || 0;
          const completion = event.data?.completionTokens as number || 0;
          const cost = event.data?.costUsd as number || 0;
          set(state => ({
            sessionTokens: {
              prompt: state.sessionTokens.prompt + prompt,
              completion: state.sessionTokens.completion + completion,
              total: state.sessionTokens.total + prompt + completion,
              cost: state.sessionTokens.cost + cost,
            },
          }));
          break;
        }

        // ── Orchestration lifecycle events ──
        case 'orchestration:started': {
          const opId = event.data?.operationId as string || '';
          const goal = event.data?.goal as string || 'Task';
          const tracker = useAgentTrackerStore.getState();
          tracker.startOperation(opId, 'orchestration', goal, undefined, eventPlatform);
          // Create the grouped OperationCard in chat
          appendToAgentChat({
            role: 'activity',
            content: goal,
            timestamp: new Date(),
            tool: 'spawn_agent',
            activityType: 'orchestration-group',
            operationId: opId,
          });
          break;
        }

        case 'orchestration:complete': {
          const opId = event.data?.operationId as string || '';
          const status = event.data?.status as string || 'complete';
          const tracker = useAgentTrackerStore.getState();
          tracker.updateOperationStatus(opId, status === 'complete' ? 'complete' : 'failed');
          break;
        }

        // ── Child agent lifecycle events (orchestrator pattern) ──
        case 'child:spawned': {
          const childId = event.data?.childId as string || '';
          const goal = event.data?.goal as string || '';
          const agentType = event.data?.agentType as string || '';
          const background = event.data?.background as boolean || false;
          const opId = event.data?.operationId as string || '';
          const maxSteps = event.data?.maxSteps as number || 50;
          const childTerminalSession = event.data?.terminalSession as string | undefined;

          // Add to tracker if operation context exists
          if (opId) {
            const tracker = useAgentTrackerStore.getState();
            tracker.addSubAgent(opId, {
              id: childId,
              type: 'subagent',
              label: childId,
              goal,
              status: 'running',
              startedAt: Date.now(),
              iterations: 0,
              maxIterations: maxSteps,
              activities: [],
              terminalSession: childTerminalSession,
            });
          }

          // Activity message removed — the OperationCard's SubAgentLine
          // already shows each spawned agent with its goal and status.
          break;
        }

        case 'child:complete': {
          const childId = event.data?.childId as string || '';
          const opId = event.data?.operationId as string || '';
          const dur = event.data?.durationMs as number || 0;
          const result = event.data?.resultPreview as string || '';

          if (opId) {
            const tracker = useAgentTrackerStore.getState();
            tracker.updateSubAgent(opId, childId, {
              status: 'complete',
              completedAt: Date.now(),
              durationMs: dur,
              result: result.slice(0, 300),
            });
          }

          // Activity message removed — SubAgentLine updates in the OperationCard.
          break;
        }

        case 'child:failed': {
          const childId = event.data?.childId as string || '';
          const opId = event.data?.operationId as string || '';
          const dur = event.data?.durationMs as number || 0;
          const error = event.data?.error as string || 'Unknown error';

          if (opId) {
            const tracker = useAgentTrackerStore.getState();
            tracker.updateSubAgent(opId, childId, {
              status: 'failed',
              completedAt: Date.now(),
              durationMs: dur,
              error,
            });
          }

          // Notify user about background task failure
          useNotificationStore.getState().addNotification({
            title: 'Background task failed',
            body: error.length > 100 ? error.slice(0, 100) + '...' : error,
            source: 'agent',
            variant: 'error',
          });
          break;
        }

        case 'child:stuck': {
          const childId = event.data?.childId as string || '';
          const reason = event.data?.reason as string || 'Unknown';
          // Find operation via the tracker's subagentIndex
          const tracker = useAgentTrackerStore.getState();
          const opId = tracker.subagentIndex[childId];
          if (opId) {
            tracker.updateSubAgent(opId, childId, {
              status: 'failed',
              completedAt: Date.now(),
              error: `Stuck: ${reason}`,
            });
          }
          break;
        }

        case 'terminal_command': {
          const cmd = event.data?.command as string || '';
          window.dispatchEvent(new CustomEvent('terminal_command', { detail: cmd }));
          break;
        }

        case 'terminal_output': {
          const _chunk = event.data?.data as string || '';
          set((s) => ({ terminalOutputSeq: s.terminalOutputSeq + 1 }));
          window.dispatchEvent(new CustomEvent('terminal_output', { detail: _chunk }));
          break;
        }

        case 'terminal_exit': {
          const exitCode = (event.data?.exitCode as number) ?? 0;
          const exitCmd = event.data?.command as string || '';
          window.dispatchEvent(new CustomEvent('terminal_exit', { detail: { exitCode, command: exitCmd } }));
          // Notify on command failure
          if (exitCode !== 0) {
            const shortCmd = exitCmd.length > 60 ? exitCmd.slice(0, 60) + '...' : exitCmd;
            useNotificationStore.getState().addNotification({
              title: 'Command failed',
              body: `\`${shortCmd}\` exited with code ${exitCode}`,
              source: 'terminal',
              variant: 'error',
            });
          }
          break;
        }

        case 'error': {
          const message = event.data?.message as string || 'Unknown error';
          const errorSubagentId = event.data?.subagentId as string | undefined;
          const errorPlatform = event.data?.platform as string | undefined;
          const errorId = event.data?.errorId as string | undefined;

          // Capture ALL errors in the debug store (even subagent ones)
          import('@/stores/errorStore').then(({ useErrorStore }) => useErrorStore.getState().capture({
            source: 'ws',
            message,
            errorId,
            context: {
              subagentId: errorSubagentId,
              platform: errorPlatform,
              ...(event.data?.source ? { serverSource: event.data.source } : {}),
              ...(event.data?.context ? { serverContext: event.data.context } : {}),
            },
          })).catch(() => {});

          // Subagent errors are transient — the subagent loop recovers
          // internally. Just log for debugging.
          if (errorSubagentId) {
            logger.warn(`Subagent ${errorSubagentId}: ${message}`);
            break;
          }

          // Track errors for ALL agents using the defensive helper
          updateAgent(() => ({ error: message }));
          appendToAgentChat({ role: 'agent', content: `Error: ${message}`, timestamp: new Date(), isError: true });
          if (isDesktop) {
            set({ agentThinking: null, agentThinkingStream: null });
          }
          // Notify user about agent error
          useNotificationStore.getState().addNotification({
            title: 'Agent error',
            body: message,
            source: 'agent',
            variant: 'error',
          }, 8000);
          break;
        }

        case 'stopped': {
          // If we already optimistically handled the stop (from stopAgent()),
          // just ensure the state is consistent without adding a duplicate message.
          clearAgentRunningTimer();

          // Always clean up tracker — catches cases where stopAgent() wasn't called
          // (e.g. abort from another source, or race with child:complete events)
          {
            const tracker = useAgentTrackerStore.getState();
            for (const [id, op] of Object.entries(tracker.operations)) {
              if (op.status === 'running' || op.status === 'aggregating') {
                tracker.updateOperationStatus(id, 'failed');
                for (const sub of op.subAgents) {
                  if (sub.status === 'running' || sub.status === 'pending') {
                    tracker.updateSubAgent(id, sub.id, { status: 'cancelled' });
                  }
                }
              }
            }
          }

          if (!get().agentRunning) {
            // Already stopped optimistically — no duplicate message needed.
            break;
          }
          // Agent stopped — use the reason from the event if available
          const stoppedMessage = (event.data?.message as string) || 'Stopped by user';
          const stoppedReason = event.data?.reason as string | undefined;
          const isUserStop = !stoppedReason || stoppedReason === 'user' || stoppedReason === 'interrupt';
          set(state => {
            const pa = { ...state.platformAgents };
            if (pa.desktop) pa.desktop = { ...pa.desktop, running: false, currentTool: undefined, thinking: null };
            const nextRunning = new Set(state.runningSessions);
            nextRunning.delete(eventSessionKey);
            return {
              ...(isActiveSession ? { chatMessages: appendMessage(state.chatMessages, { role: 'agent', content: stoppedMessage, timestamp: new Date(), isError: true, isStopped: isUserStop }) } : {}),
              agentThinking: null,
              agentThinkingStream: null,
              ...(isActiveSession ? { agentRunning: false } : {}),
              runningSessions: nextRunning,
              agentActivity: {},
              queuedMessageCount: 0,
              taskProgress: null,
              platformAgents: pa,
            };
          });
          break;
        }

        case 'iteration_limit': {
          const message = event.data?.message as string || 'Reached maximum step limit.';
          if (isActiveSession) clearAgentRunningTimer();
          set(state => {
            const pa = { ...state.platformAgents };
            if (pa.desktop) pa.desktop = { ...pa.desktop, running: false, currentTool: undefined, thinking: null };
            const nextRunning = new Set(state.runningSessions);
            nextRunning.delete(eventSessionKey);
            return {
              ...(isActiveSession ? { chatMessages: appendMessage(state.chatMessages, { role: 'agent', content: message, timestamp: new Date(), isError: true }) } : {}),
              agentThinking: null,
              agentThinkingStream: null,
              ...(isActiveSession ? { agentRunning: false } : {}),
              runningSessions: nextRunning,
              agentActivity: {},
              queuedMessageCount: 0,
              taskProgress: null,
              platformAgents: pa,
            };
          });
          break;
        }

        // TinyFish web agent events — show progress in activity log + browser view
        case 'tinyfish:start': {
          const url = event.data?.url as string || '';
          const goal = event.data?.goal as string || '';
          const tfSubagentId = event.data?.subagentId as string || 'main';
          const tfWorkspaceId = event.data?.workspace_id as string | undefined;
          const shortGoal = goal.length > 60 ? goal.slice(0, 60) + '...' : goal;
          const isSubagentTinyfish = tfSubagentId !== 'main';

          // Route to tracker if this TinyFish call belongs to a subagent
          if (isSubagentTinyfish) {
            useAgentTrackerStore.getState().addSubAgentActivity(tfSubagentId, {
              text: `TinyFish: ${shortGoal} (${url})`,
              activityType: 'tinyfish',
              timestamp: Date.now(),
            });
          }

          // Create a browser window for this TinyFish session (if not already open).
          // Route to the subagent's workspace if provided.
          const existingTfWindow = findWindowForTinyfish(tfSubagentId);
          if (!existingTfWindow) {
            const title = tfSubagentId === 'main' ? `TinyFish: ${shortGoal}` : shortGoal;
            useWindowStore.getState().openWindow('browser', {
              title,
              ...(tfWorkspaceId && { workspaceId: tfWorkspaceId }),
              metadata: {
                tinyfishSubagentId: tfSubagentId,
                ...(isSubagentTinyfish && { subagentId: tfSubagentId }),
              },
            });
          }

          set(state => ({
            agentThinking: `TinyFish: ${shortGoal}...`,
            // Only add to main chat for the main agent's TinyFish calls in the active session
            ...(!isSubagentTinyfish && isActiveSession ? {
              chatMessages: appendMessage(state.chatMessages, {
                role: 'activity' as const,
                content: `TinyFish scraping ${url}`,
                timestamp: new Date(),
                tool: 'web_search',
                activityType: 'tinyfish',
              }),
            } : {}),
            agentActivity: { ...state.agentActivity, browser: true },
          }));
          break;
        }

        case 'tinyfish:waiting': {
          // Subagent is queued waiting for a TinyFish slot to open.
          // Show this in the tracker so the user knows it's not stuck.
          const waitSubagentId = event.data?.subagentId as string || 'main';
          const queuePos = event.data?.queuePosition as number || 0;
          const maxConc = event.data?.maxConcurrent as number || 2;
          if (waitSubagentId !== 'main') {
            useAgentTrackerStore.getState().addSubAgentActivity(waitSubagentId, {
              text: `Waiting for TinyFish slot (${queuePos} in queue, max ${maxConc} concurrent)`,
              activityType: 'tinyfish',
              timestamp: Date.now(),
            });
          }
          break;
        }

        case 'tinyfish:streaming_url': {
          const streamingUrl = event.data?.streamingUrl as string;
          const tfSubagentId = event.data?.subagentId as string || 'main';
          if (streamingUrl) {
            const { browserState: bs } = get();
            set({
              browserState: {
                ...bs,
                tinyfishStreams: {
                  ...bs.tinyfishStreams,
                  [tfSubagentId]: streamingUrl,
                },
              },
            });
            // Update the TinyFish window's metadata with the streaming URL
            const tfWindowId = findWindowForTinyfish(tfSubagentId);
            if (tfWindowId) {
              const win = useWindowStore.getState().getWindow(tfWindowId);
              if (win) {
                useWindowStore.getState().updateWindow(tfWindowId, {
                  metadata: { ...win.metadata, tinyfishStreamUrl: streamingUrl },
                });
              }
            }
          }
          break;
        }

        case 'tinyfish:progress': {
          const purpose = event.data?.purpose as string || 'Working...';
          const progressSubagentId = event.data?.subagentId as string || 'main';
          const isSubagentProgress = progressSubagentId !== 'main';

          // Route to tracker if this belongs to a subagent
          if (isSubagentProgress) {
            useAgentTrackerStore.getState().addSubAgentActivity(progressSubagentId, {
              text: `TinyFish: ${purpose}`,
              activityType: 'tinyfish',
              timestamp: Date.now(),
            });
            break;
          }

          // Batch into single set() (M16)
          set(state => ({
            agentThinking: `TinyFish: ${purpose}`,
            ...(isActiveSession ? {
              chatMessages: appendMessage(state.chatMessages, {
                role: 'activity' as const,
                content: `TinyFish: ${purpose}`,
                timestamp: new Date(),
                tool: 'web_search',
                activityType: 'tinyfish',
              }),
            } : {}),
          }));
          break;
        }

        case 'tinyfish:complete': {
          const tfSubagentId = event.data?.subagentId as string || 'main';
          const { browserState: bs } = get();
          // Remove this subagent's stream URL
          const { [tfSubagentId]: _removedStream, ...remainingStreams } = bs.tinyfishStreams;

          // Close the TinyFish browser window
          const tfWindowId = findWindowForTinyfish(tfSubagentId);
          if (tfWindowId) {
            _frameRenderers.delete(tfWindowId);
            _canvasClearFns.delete(tfWindowId);
            useWindowStore.getState().closeWindow(tfWindowId);
          }

          set({
            agentThinking: null,
            browserState: {
              ...bs,
              tinyfishStreams: remainingStreams,
            },
          });
          const { browser: _, ...restActivity } = get().agentActivity;
          // Only clear browser activity if no more TinyFish streams active
          if (Object.keys(remainingStreams).length === 0) {
            set({ agentActivity: restActivity });
          }
          break;
        }

        case 'tinyfish:error': {
          const tfSubagentId = event.data?.subagentId as string || 'main';
          const { browserState: bs } = get();
          const { [tfSubagentId]: _removedStream, ...remainingStreams } = bs.tinyfishStreams;

          // Close the TinyFish browser window
          const tfWindowId = findWindowForTinyfish(tfSubagentId);
          if (tfWindowId) {
            _frameRenderers.delete(tfWindowId);
            _canvasClearFns.delete(tfWindowId);
            useWindowStore.getState().closeWindow(tfWindowId);
          }

          set({
            agentThinking: null,
            browserState: {
              ...bs,
              tinyfishStreams: remainingStreams,
            },
          });
          break;
        }

        // File system events — open/refresh files in the editor (text only)
        // Route to the correct workspace using sessionKey from the event.
        case 'fs:read': {
          const path = event.data?.path as string;
          if (path) {
            const fsWsId = 'main';
            if (isDocumentFile(path)) {
              // Documents (pdf, docx, md, csv, images) → document viewer with rendered view
              openDocumentViewer(path, fsWsId);
            } else if (isTextFile(path)) {
              // Text/code files → editor with Monaco
              useEditorStore.getState().openOrRefreshFile(path, fsWsId);
            }
          }
          break;
        }
        case 'fs:write':
        case 'fs:edit': {
          const path = event.data?.path as string;
          if (path) {
            const fsWsId = 'main';
            if (isDocumentFile(path)) {
              openDocumentViewer(path, fsWsId);
            } else if (isTextFile(path)) {
              useEditorStore.getState().openOrRefreshFile(path, fsWsId);
            } else {
              useWindowStore.getState().ensureWindowOpen('files', fsWsId);
            }
          }
          break;
        }

        // ── Legacy delegation/consultation/background events ──────────
        // These are from the old SubagentManager pattern (delegate_task,
        // consult_experts, background_task tools). Kept as no-ops for
        // backward compatibility — the new orchestrator pattern uses
        // orchestration:started/complete + child:* events instead.
        case 'delegation:started':
        case 'delegation:subagent_started':
        case 'delegation:subagent_progress':
        case 'delegation:subagent_complete':
        case 'delegation:subagent_failed':
        case 'delegation:aggregating':
        case 'delegation:complete':
        case 'consultation:started':
        case 'consultation:subagent_started':
        case 'consultation:subagent_complete':
        case 'consultation:subagent_failed':
        case 'consultation:aggregating':
        case 'consultation:complete':
        case 'background:started':
        case 'background:progress':
        case 'background:complete':
        case 'background:failed': {
          // No-op — old delegation pattern disabled
          break;
        }

        // ── Platform agent lifecycle events ─────────────────────────
        // These arrive for ALL platforms (not filtered) so the desktop
        // frontend can visualize that Slack/Telegram agents are active.

        case 'platform_agent:started': {
          const platform = event.data?.platform as string;
          const task = event.data?.task as string | undefined;
          const sessionKey = event.data?.sessionKey as string | undefined;
          if (platform) {
            // MERGE with existing state — preserve any toolHistory, responseText,
            // etc. that might have been set if tool events arrived first.
            // Add the user's input as the first message in the per-agent chat feed.
            set(state => {
              const existing = state.platformAgents[platform];
              const prevChat = existing?.chatMessages || [];
              // Insert a user message for the task input — but skip if it's
              // already the last message (sendMessage adds it immediately, then
              // platform_agent:started arrives and would duplicate it).
              const lastMsg = prevChat[prevChat.length - 1];
              const alreadyAdded = lastMsg?.role === 'user' && lastMsg?.content === task;
              const newChat = task && !alreadyAdded
                ? [...prevChat, { role: 'user' as const, content: task, timestamp: new Date() }]
                : prevChat;
              return {
                platformAgents: {
                  ...state.platformAgents,
                  [platform]: {
                    ...existing,  // preserve accumulated state
                    platform,
                    running: true,
                    currentTask: task,
                    sessionKey,
                    startedAt: Date.now(),
                    queueLength: existing?.queueLength ?? 0,
                    chatMessages: newChat,
                    // Clear stale state from previous runs
                    error: null,
                    completedAt: undefined,
                  },
                },
              };
            });

            // DON'T create a workspace here. Workspaces are created lazily
            // when the first window needs to open for this session (in
            // resolveWorkspaceForSession). This avoids creating empty workspaces
            // for simple messages that don't produce windows, and lets the
            // workspace be named after the actual task rather than the platform.
            // Just mark any existing workspace as active.
            if (platform !== 'desktop' && sessionKey) {
              const winStore = useWindowStore.getState();
              const existing = winStore.getWorkspaceForLane(sessionKey);
              if (existing) {
                winStore.setWorkspaceActive(existing.id, true);
              }
            }
          }
          break;
        }

        case 'platform_agent:idle': {
          const platform = event.data?.platform as string;
          if (platform) {

            // Find the workspace for this platform's session and mark inactive
            const prevState = get().platformAgents[platform];
            if (prevState?.sessionKey) {
              const ws = useWindowStore.getState().getWorkspaceForLane(prevState.sessionKey);
              if (ws) {
                useWindowStore.getState().setWorkspaceActive(ws.id, false);
              }
            }
            set(state => {
              const prev = state.platformAgents[platform];
              return {
                platformAgents: {
                  ...state.platformAgents,
                  [platform]: {
                    // Preserve accumulated state (toolHistory, responseText, etc.)
                    // for the agent history view
                    ...prev,
                    platform,
                    running: false,
                    queueLength: 0,
                    currentTool: undefined,
                    thinking: null,
                    stepProgress: null,
                    completedAt: Date.now(),
                  },
                },
              };
            });
          }
          break;
        }

        case 'platform_agent:status': {
          const platforms = event.data?.platforms as Array<{
            platform: string;
            running: boolean;
            currentTask?: string;
            sessionKey?: string;
            startedAt?: number;
            queueLength: number;
          }> | undefined;
          if (Array.isArray(platforms)) {
            // MERGE with existing state — don't replace. The status event
            // only carries basic fields (running, queueLength, etc.). We must
            // preserve accumulated state (toolHistory, thinking, stepProgress,
            // responseText, todoItems, error, completedAt) that was set by
            // other event handlers (tool_call, text_delta, thinking, etc.).
            set(state => {
              const merged = { ...state.platformAgents };
              for (const p of platforms) {
                const existing = merged[p.platform];
                merged[p.platform] = {
                  ...existing,  // preserve toolHistory, thinking, etc.
                  ...p,         // update running, queueLength, etc.
                };
              }
              return { platformAgents: merged };
            });
          }
          break;
        }

        // ── New events from Phase 1-4 backend upgrades ────────────────

        case 'tool_status': {
          // Per-tool execution status (queued/executing/completed/failed)
          // Logged for debugging; tracker integration deferred to when TrackerStore adds the method
          logger.debug('Tool status:', event.data?.tool, event.data?.status);
          break;
        }

        case 'ask_permission': {
          // Permission system: agent needs user approval for a tool call
          const permTool = event.data?.tool as string || 'unknown';
          const permToolCallId = event.data?.toolCallId as string || '';
          const permArgs = event.data?.args as Record<string, unknown> || {};
          const permReason = event.data?.reason as string || `${permTool} requires your approval`;
          const permMsg: ChatMessage = {
            role: 'system',
            content: `**Permission Required**: ${permReason}\n\nTool: \`${permTool}\`\nArguments: \`${JSON.stringify(permArgs).slice(0, 200)}\``,
            timestamp: new Date(),
            askUser: {
              questionId: permToolCallId,
              question: permReason,
              options: [
                { label: 'Allow', value: 'allow', description: `Allow ${permTool} to execute` },
                { label: 'Deny', value: 'deny', description: 'Block this tool call' },
              ],
              allowCustom: false,
            },
          };
          if (isActiveSession) set({ chatMessages: appendMessage(get().chatMessages, permMsg) });
          // Also show as toast so user doesn't miss it if chat is scrolled/hidden
          useNotificationStore.getState().addNotification({
            title: 'Permission Required',
            body: permReason,
            source: 'agent',
            variant: 'info',
          }, 15_000);
          break;
        }

        case 'task_created': {
          const tcTaskId = event.data?.taskId as number;
          const tcTitle = event.data?.title as string || '';
          const tcStatus = event.data?.status as string || 'pending';
          const taskMsg: ChatMessage = {
            role: 'activity',
            content: `Created task #${tcTaskId}: ${tcTitle} (${tcStatus})`,
            timestamp: new Date(),
            activityType: 'tool',
            tool: 'task_create',
          };
          if (isActiveSession) set({ chatMessages: appendMessage(get().chatMessages, taskMsg) });
          break;
        }

        case 'task_updated': {
          const tuTaskId = event.data?.taskId as number;
          const tuUpdates = event.data?.updates;
          const updateMsg: ChatMessage = {
            role: 'activity',
            content: `Updated task #${tuTaskId}: ${Array.isArray(tuUpdates) ? tuUpdates.join(', ') : tuUpdates}`,
            timestamp: new Date(),
            activityType: 'tool',
            tool: 'task_update',
          };
          if (isActiveSession) set({ chatMessages: appendMessage(get().chatMessages, updateMsg) });
          break;
        }

        case 'mailbox_received': {
          const mbCount = event.data?.count as number || 1;
          const mailboxMsg: ChatMessage = {
            role: 'activity',
            content: `Received ${mbCount} message${mbCount !== 1 ? 's' : ''} from background agent${mbCount !== 1 ? 's' : ''}`,
            timestamp: new Date(),
            activityType: 'tool',
          };
          if (isActiveSession) set({ chatMessages: appendMessage(get().chatMessages, mailboxMsg) });
          break;
        }

        case 'child:backgrounded': {
          // Sub-agent transitioned from sync to background
          const bgChildId = event.data?.childId as string || '';
          const bgReason = event.data?.reason as string || '';
          const bgMsg: ChatMessage = {
            role: 'activity',
            content: bgReason || `Sub-agent ${bgChildId} moved to background`,
            timestamp: new Date(),
            activityType: 'delegation',
          };
          if (isActiveSession) set({ chatMessages: appendMessage(get().chatMessages, bgMsg) });
          break;
        }

        case 'child:cancelled': {
          // Just log — tracker integration deferred
          logger.debug('Child cancelled:', event.data?.childId);
          break;
        }

        // model_fallback handled above (line ~3389)

        default:
          break;
      }
    },
  }))
);

// Legacy alias for backward compatibility
export const useAgentStore = useComputerStore;

// Expose store ref for cross-store reads (e.g. windowStore reading task descriptions
// for lazy workspace naming). This avoids circular imports.
(globalThis as any).__agentStoreRef = useComputerStore;
