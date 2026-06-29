import { describe, expect, it } from 'vitest';
import { routeToolToWindow, desktopActionToWindowType } from './toolWindowRouting';

describe('routeToolToWindow — built-in tools', () => {
  it('routes browser tools to the browser window', () => {
    expect(routeToolToWindow('browser')?.type).toBe('browser');
    expect(routeToolToWindow('browser_navigate')?.type).toBe('browser');
  });

  it('routes terminal / github to the terminal window', () => {
    expect(routeToolToWindow('terminal')?.type).toBe('terminal');
    expect(routeToolToWindow('github')?.type).toBe('terminal');
  });

  it('routes a text file read to the editor with the file path and no auto-close', () => {
    const route = routeToolToWindow('files', { action: 'read', path: 'notes/todo.txt' });
    expect(route).toMatchObject({ type: 'editor', openMode: 'file', autoClose: false });
    expect(route?.metadata?.filePath).toBe('notes/todo.txt');
  });

  it('routes a document file read to the document viewer', () => {
    const route = routeToolToWindow('files', { action: 'read', path: 'reports/q3.pdf' });
    expect(route).toMatchObject({ type: 'document-viewer', openMode: 'file' });
    expect(route?.metadata?.filePath).toBe('reports/q3.pdf');
  });

  it('routes files write with a path to a file window', () => {
    expect(routeToolToWindow('files', { action: 'write', path: 'a.ts' })?.type).toBe('editor');
  });

  it('routes pathless file ops and directory/search to the Files app', () => {
    expect(routeToolToWindow('files', { action: 'read' })?.type).toBe('files');
    expect(routeToolToWindow('files', { action: 'list', path: 'docs' })?.type).toBe('files');
    expect(routeToolToWindow('files', { action: 'search', query: 'x' })?.type).toBe('files');
    expect(routeToolToWindow('files', { action: 'delete', path: 'x.txt' })?.type).toBe('files');
  });

  it('routes files read on images to the document viewer', () => {
    expect(routeToolToWindow('files', { action: 'read', path: 'img/a.png' })?.type).toBe('document-viewer');
  });

  it('routes calendar / email / memory tools', () => {
    expect(routeToolToWindow('agent_calendar', { action: 'list_events' })?.type).toBe('calendar');
    expect(routeToolToWindow('schedule_task', {})?.type).toBe('calendar');
    expect(routeToolToWindow('agent_schedule', {})?.type).toBe('calendar');
    expect(routeToolToWindow('email', { action: 'send' })?.type).toBe('email');
    expect(routeToolToWindow('memory', { action: 'recall' })?.type).toBe('memory');
  });

  it('routes cheap web/research tools to the browser app', () => {
    for (const t of ['web_search', 'web_fetch', 'arxiv', 'domain_intel']) {
      expect(routeToolToWindow(t, {})).toMatchObject({ type: 'browser', autoClose: false });
    }
  });

  it('returns null for tools with no visual counterpart', () => {
    for (const t of ['tool_search', 'ask_user', 'spawn_agent', 'wait_for_agents', 'coding_guide',
      'task_create', 'slack', 'telegram', 'notify_user', 'read_agent_output', 'desktop']) {
      expect(routeToolToWindow(t, {})).toBeNull();
    }
  });
});

describe('routeToolToWindow — managed capabilities', () => {
  it('routes capability.call by namespace', () => {
    expect(routeToolToWindow('capability', { action: 'call', name: 'drive.list_files' })?.type).toBe('files');
    expect(routeToolToWindow('capability', { action: 'call', name: 'calendar.create_event' })?.type).toBe('calendar');
    expect(routeToolToWindow('capability', { action: 'call', name: 'mail.send' })?.type).toBe('email');
  });

  it('routes non-native capability namespaces to the App Registry integrations view', () => {
    const route = routeToolToWindow('capability', { action: 'call', name: 'sheets.read_range' });
    expect(route?.type).toBe('app-registry');
    expect(route?.metadata).toMatchObject({ view: 'integrations', search: 'googlesheets' });
  });

  it('ignores capability list/search (no window)', () => {
    expect(routeToolToWindow('capability', { action: 'list' })).toBeNull();
    expect(routeToolToWindow('capability', { action: 'search', query: 'x' })).toBeNull();
  });
});

describe('routeToolToWindow — raw Composio', () => {
  it('routes execute by tool_slug toolkit to native apps', () => {
    expect(routeToolToWindow('composio', { action: 'execute', tool_slug: 'GOOGLEDRIVE_LIST_FILES' })?.type).toBe('files');
    expect(routeToolToWindow('composio', { action: 'execute', tool_slug: 'GOOGLECALENDAR_CREATE_EVENT' })?.type).toBe('calendar');
    expect(routeToolToWindow('composio', { action: 'execute', tool_slug: 'GMAIL_SEND_EMAIL' })?.type).toBe('email');
  });

  it('routes unknown toolkits to the App Registry', () => {
    const route = routeToolToWindow('composio', { action: 'execute', tool_slug: 'NOTION_CREATE_PAGE' });
    expect(route?.type).toBe('app-registry');
    expect(route?.metadata).toMatchObject({ view: 'integrations', search: 'notion' });
  });

  it('routes composio search to the App Registry', () => {
    expect(routeToolToWindow('composio', { action: 'search', toolkit: 'slack' })?.type).toBe('app-registry');
  });
});

describe('routeToolToWindow — installed/local apps', () => {
  it('routes app.call to the dynamic app window with appId', () => {
    const route = routeToolToWindow('app', { action: 'call', app_id: 'my-app', tool_name: 'x' });
    expect(route).toMatchObject({ type: 'app', openMode: 'app' });
    expect(route?.metadata?.appId).toBe('my-app');
  });

  it('routes app state ops to the dynamic app window', () => {
    expect(routeToolToWindow('app', { action: 'get_app_state', app_id: 'a' })?.type).toBe('app');
    expect(routeToolToWindow('app', { action: 'set_app_state', app_id: 'a' })?.type).toBe('app');
  });

  it('routes declarative builds to the App Builder', () => {
    expect(routeToolToWindow('app', { action: 'create_declarative', app_id: 'a' })?.type).toBe('app-builder');
    expect(routeToolToWindow('app', { action: 'patch_component', app_id: 'a' })?.type).toBe('app-builder');
    expect(routeToolToWindow('local_app_builder', { app_id: 'a' })?.type).toBe('app-builder');
  });

  it('routes app.search to the App Registry and ignores list/delete', () => {
    expect(routeToolToWindow('app', { action: 'search', query: 'crm' })?.type).toBe('app-registry');
    expect(routeToolToWindow('app', { action: 'list' })).toBeNull();
    expect(routeToolToWindow('app', { action: 'call' })).toBeNull(); // no app_id
  });
});

describe('desktopActionToWindowType — parity with worker VALID_WINDOW_TYPES', () => {
  // Mirror of worker/src/tools/desktop.ts VALID_WINDOW_TYPES (minus app, handled specially).
  const cases: Array<[string, string | null]> = [
    ['open_browser', 'browser'],
    ['open_terminal', 'terminal'],
    ['open_editor', 'editor'],
    ['open_files', 'files'],
    ['open_settings', 'settings'],
    ['open_email', 'email'],
    ['open_calendar', 'calendar'],
    ['open_about', 'about'],
    ['open_auditlogs', 'auditlogs'],
    ['open_memory', 'memory'],
    ['open_access-control', 'access-control'],
    ['open_app-registry', 'app-registry'],
    ['open_document-viewer', 'document-viewer'],
    ['open_file', 'editor'],
    ['open_chat', 'chat'],
    ['open_app', null],
    ['nonsense', null],
  ];

  it.each(cases)('%s → %s', (action, expected) => {
    expect(desktopActionToWindowType(action)).toBe(expected);
  });
});
