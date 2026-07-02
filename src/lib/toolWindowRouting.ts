/**
 * Canonical tool → desktop app (window) routing.
 *
 * Every agent tool that has a meaningful frontend counterpart maps here so the
 * matching desktop app opens (and later auto-closes) when the agent uses it.
 * This is the single source of truth — `agentStore` and `agentStoreUtils`
 * re-use this module instead of keeping their own divergent copies.
 *
 * Covers:
 * - Built-in/internal tools (files, terminal, browser, calendar, email, memory…)
 * - Managed capabilities (`capability.call` → drive/calendar/mail/…)
 * - Raw Composio (`composio.execute` → routed by toolkit)
 * - Installed/local MCP apps (`app.*` → the dynamic app or App Registry)
 * - The `desktop` control tool (`open_<window_type>` actions)
 */

import type { WindowType } from '@/types';
import { isTextFile, isDocumentFile } from './utils';

export interface ToolWindowRoute {
  /** The desktop window/app type to open. */
  type: WindowType;
  /** Optional per-window metadata (filePath, appId, registry view, …). */
  metadata?: Record<string, unknown>;
  /**
   * How the window should be opened:
   * - 'ensure' (default): open/focus via windowStore.ensureWindowOpen
   * - 'file': open/refresh a file via editorStore / documentViewerStore so
   *   the file content actually loads (requires metadata.filePath)
   * - 'app': open a dynamic installed/local app (requires metadata.appId)
   */
  openMode?: 'ensure' | 'file' | 'app';
  /**
   * Whether a freshly auto-opened window of this type should be auto-closed
   * after the tool finishes. Defaults to true. Editors are never auto-closed
   * to avoid yanking a file away from the user mid-edit.
   */
  autoClose?: boolean;
}

/** Window types backed by a real component (mirror of WindowManager). */
const REAL_WINDOW_TYPES = new Set<WindowType>([
  'browser', 'terminal', 'files', 'editor', 'document-viewer',
  'settings', 'about', 'calendar', 'auditlogs', 'memory', 'email', 'chat',
  'access-control', 'app-registry', 'app-builder', 'app',
]);

/** Capability namespace (`<ns>.<verb>`) → the toolkit/integration it represents. */
const CAPABILITY_NAMESPACE_TOOLKIT: Record<string, string> = {
  notes: 'notion',
  docs: 'googledocs',
  sheets: 'googlesheets',
  code: 'github',
  chat: 'slack',
  payments: 'stripe',
};

/** Composio toolkit slug → native desktop app, when one exists. */
const TOOLKIT_TO_WINDOW: Record<string, WindowType> = {
  googledrive: 'files',
  dropbox: 'files',
  onedrive: 'files',
  box: 'files',
  googlecalendar: 'calendar',
  outlook_calendar: 'calendar',
  gmail: 'email',
  outlook: 'email',
};

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Extract a workspace file path from common tool param shapes. */
function filePathParam(params: Record<string, unknown>): string | undefined {
  return str(params.path) || str(params.file) || str(params.file_path) || str(params.workspace_path);
}

/** Route a concrete file path to the editor or document viewer (with content). */
function fileRoute(path: string): ToolWindowRoute {
  if (isDocumentFile(path)) {
    return { type: 'document-viewer', metadata: { filePath: path }, openMode: 'file', autoClose: true };
  }
  if (isTextFile(path)) {
    // Editors are never auto-closed — the user may be editing.
    return { type: 'editor', metadata: { filePath: path }, openMode: 'file', autoClose: false };
  }
  // Unknown/binary: surface in the Files app instead.
  return { type: 'files', autoClose: false };
}

/** Derive the toolkit slug from a Composio tool_slug (e.g. GOOGLEDRIVE_LIST_FILES). */
function toolkitFromSlug(slug: string): string {
  const idx = slug.indexOf('_');
  return (idx > 0 ? slug.slice(0, idx) : slug).toLowerCase();
}

/** Route a Composio/managed toolkit to its app (native app or App Registry). */
function toolkitRoute(toolkit: string | undefined): ToolWindowRoute {
  const normalized = (toolkit || '').toLowerCase();
  const native = TOOLKIT_TO_WINDOW[normalized];
  if (native) return { type: native };
  // No native counterpart — show the integration in the App Registry.
  return {
    type: 'app-registry',
    metadata: { view: 'integrations', ...(normalized ? { search: normalized } : {}) },
    autoClose: true,
  };
}

/**
 * Resolve the desktop window a tool call should open, or null when the tool has
 * no meaningful visual counterpart (research, orchestration, guides, etc.).
 */
export function routeToolToWindow(tool: string, params?: Record<string, unknown>): ToolWindowRoute | null {
  const p = params || {};

  // ── Browser + cheap web/research tools (unified Browser app tabs) ─
  const BROWSER_WEB_TOOLS = new Set([
    'web_search', 'web_fetch', 'arxiv', 'domain_intel',
  ]);
  if (
    tool === 'browser' || tool.startsWith('browser_') || BROWSER_WEB_TOOLS.has(tool)
  ) {
    return { type: 'browser', autoClose: false };
  }

  // ── Terminal / github ──────────────────────────────────────────
  if (tool === 'terminal' || tool === 'exec' || tool === 'github') {
    return { type: 'terminal', autoClose: true };
  }

  // ── Unified files tool ───────────────────────────────────────────
  if (tool === 'files') {
    const action = str(p.action);
    const path = filePathParam(p);
    if (path && (action === 'read' || action === 'write' || action === 'edit')) {
      return fileRoute(path.replace(/^\/mnt\/saved\//, ''));
    }
    return { type: 'files', autoClose: false };
  }

  // ── In-Worker document engine (create/edit/read deliverables) ────
  if (tool === 'document') {
    const path = filePathParam(p);
    if (path) {
      return {
        type: 'document-viewer',
        metadata: { filePath: path.replace(/^\/mnt\/saved\//, '') },
        openMode: 'file',
        autoClose: true,
      };
    }
    return { type: 'files', autoClose: false };
  }

  // ── Workspace files (legacy aliases) ─────────────────────────────
  if (tool === 'read_file' || tool === 'write_file' ||
      tool === 'read' || tool === 'write' || tool === 'edit' ||
      tool === 'file_read' || tool === 'file_write' || tool === 'file_edit') {
    const path = filePathParam(p);
    return path ? fileRoute(path) : { type: 'files', autoClose: false };
  }
  if (tool === 'view_image') {
    const path = filePathParam(p);
    return path
      ? { type: 'document-viewer', metadata: { filePath: path }, openMode: 'file', autoClose: true }
      : { type: 'files', autoClose: false };
  }
  if (tool === 'list_directory' || tool === 'search_files' || tool === 'delete_file' || tool === 'list') {
    return { type: 'files', autoClose: false };
  }
  if (tool === 'google_drive' || tool === 'drive_list' || tool === 'drive_download' ||
      tool === 'drive_upload' || tool === 'drive_search') {
    return { type: 'files', autoClose: false };
  }

  // ── Calendar / scheduling ────────────────────────────────────────
  if (tool === 'agent_calendar' || tool === 'schedule_task' || tool === 'agent_schedule' ||
      tool === 'calendar' || tool === 'google_calendar' ||
      tool === 'create_calendar_event' || tool === 'update_calendar_event' ||
      tool === 'delete_calendar_event' || tool === 'list_calendar_events') {
    return { type: 'calendar' };
  }

  // ── Email ────────────────────────────────────────────────────────
  if (tool === 'email' || tool === 'send_email' || tool === 'read_email') {
    return { type: 'email' };
  }

  // ── Memory / knowledge ───────────────────────────────────────────
  if (tool === 'memory') {
    return { type: 'memory', autoClose: true };
  }

  // ── Managed capabilities (capability.call) ───────────────────────
  if (tool === 'capability') {
    if (str(p.action) !== 'call') return null;
    const name = str(p.name);
    if (!name) return null;
    if (name.startsWith('drive.')) return { type: 'files', autoClose: false };
    if (name.startsWith('calendar.')) return { type: 'calendar' };
    if (name.startsWith('mail.')) return { type: 'email' };
    const ns = name.split('.')[0];
    return toolkitRoute(CAPABILITY_NAMESPACE_TOOLKIT[ns] || ns);
  }

  // ── Raw Composio (composio.execute / search) ─────────────────────
  if (tool === 'composio') {
    const action = str(p.action);
    if (action === 'search') {
      const search = str(p.toolkit) || str(p.query);
      return { type: 'app-registry', metadata: { view: 'integrations', ...(search ? { search } : {}) }, autoClose: true };
    }
    if (action !== 'execute') return null;
    const slug = str(p.tool_slug);
    const toolkit = str(p.toolkit) || (slug ? toolkitFromSlug(slug) : undefined);
    return toolkitRoute(toolkit);
  }

  // ── Installed / local MCP apps (app.*) ───────────────────────────
  if (tool === 'app') {
    const action = str(p.action);
    const appId = str(p.app_id);
    switch (action) {
      case 'call':
      case 'get_app_state':
      case 'set_app_state':
        return appId ? { type: 'app', metadata: { appId }, openMode: 'app', autoClose: true } : null;
      case 'create_declarative':
      case 'update_declarative':
      case 'patch_component':
        return { type: 'app-builder', metadata: appId ? { appId } : undefined };
      case 'search':
        return { type: 'app-registry', metadata: { ...(str(p.query) ? { search: str(p.query) } : {}) }, autoClose: true };
      default:
        return null;
    }
  }
  if (tool === 'local_app_builder') {
    const appId = str(p.app_id) || str(p.appId);
    return { type: 'app-builder', metadata: appId ? { appId } : undefined };
  }

  // No visual counterpart (research, orchestration, guides, ask_user, …).
  return null;
}

/**
 * Map a `desktop` tool action (`open_<window_type>`) to a window type.
 * Returns null for `app` (handled separately because it needs an appId param).
 */
export function desktopActionToWindowType(action: string): WindowType | null {
  if (action === 'open_file') return 'editor';
  if (!action.startsWith('open_')) return null;
  const rest = action.slice('open_'.length);
  if (rest === 'app') return null;
  return REAL_WINDOW_TYPES.has(rest as WindowType) ? (rest as WindowType) : null;
}
