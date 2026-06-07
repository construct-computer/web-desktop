import { describe, expect, it } from 'vitest';
import { Bot, Clock, ListTodo, Users } from 'lucide-react';
import { resolveActivityIconHints, resolveActivityVisual } from './toolActivityIcon';
import iconBrowser from '@/icons/browser.png';
import iconCalendar from '@/icons/calendar.png';
import iconEmail from '@/icons/email.png';
import iconFiles from '@/icons/files.png';
import iconMemory from '@/icons/memory.png';
import iconTerminal from '@/icons/terminal.png';
import iconAppStore from '@/icons/app-store.png';
import iconAccessLogs from '@/icons/access-logs.png';
import iconChat from '@/icons/chat.png';
import iconGeneric from '@/icons/generic.png';

describe('toolActivityIcon branded PNG resolution', () => {
  it('uses calendar.png for native schedule tools', () => {
    for (const tool of ['agent_schedule', 'schedule_task', 'agent_calendar', 'calendar']) {
      const visual = resolveActivityVisual({ tool, type: 'tool' });
      expect(visual).toEqual({ kind: 'image', src: iconCalendar, alt: 'calendar' });
    }
  });

  it('uses app PNGs for core Construct tools', () => {
    expect(resolveActivityVisual({ tool: 'read_file', type: 'file' })).toEqual({
      kind: 'image', src: iconFiles, alt: 'files',
    });
    expect(resolveActivityVisual({ tool: 'terminal', type: 'terminal' })).toEqual({
      kind: 'image', src: iconTerminal, alt: 'terminal',
    });
    expect(resolveActivityVisual({ tool: 'browser_navigate', type: 'browser' })).toEqual({
      kind: 'image', src: iconBrowser, alt: 'browser',
    });
    expect(resolveActivityVisual({ tool: 'email', type: 'tool' })).toEqual({
      kind: 'image', src: iconEmail, alt: 'email',
    });
    expect(resolveActivityVisual({ tool: 'memory', type: 'tool' })).toEqual({
      kind: 'image', src: iconMemory, alt: 'memory',
    });
    expect(resolveActivityVisual({ tool: 'web_search', type: 'tool' })).toEqual({
      kind: 'image', src: iconBrowser, alt: 'browser',
    });
    expect(resolveActivityVisual({ tool: 'tool_search', type: 'tool' })).toEqual({
      kind: 'image', src: iconAppStore, alt: 'app-registry',
    });
    expect(resolveActivityVisual({ tool: 'audit_log', type: 'tool' })).toEqual({
      kind: 'image', src: iconAccessLogs, alt: 'auditlogs',
    });
    expect(resolveActivityVisual({ tool: 'ask_user', type: 'tool' })).toEqual({
      kind: 'image', src: iconChat, alt: 'Chat',
    });
  });

  it('uses activity type PNGs when tool name is missing', () => {
    expect(resolveActivityVisual({ type: 'calendar' })).toEqual({
      kind: 'image', src: iconCalendar, alt: 'calendar',
    });
    expect(resolveActivityVisual({ type: 'web' })).toEqual({
      kind: 'image', src: iconBrowser, alt: 'browser',
    });
  });

  it('uses Lucide icons for orchestration and task tools without branded PNGs', () => {
    expect(resolveActivityVisual({ tool: 'spawn_agent', type: 'delegation' })).toEqual({
      kind: 'lucide', Icon: Users,
    });
    expect(resolveActivityVisual({ tool: 'spawn_agents', type: 'delegation' })).toEqual({
      kind: 'lucide', Icon: Users,
    });
    expect(resolveActivityVisual({ tool: 'wait_for_agents', type: 'delegation' })).toEqual({
      kind: 'lucide', Icon: Clock,
    });
    expect(resolveActivityVisual({ tool: 'task_create', type: 'tool' })).toEqual({
      kind: 'lucide', Icon: ListTodo,
    });
    expect(resolveActivityVisual({
      tool: 'mailbox_received',
      type: 'background',
      label: 'Received 3 messages from background tasks',
    })).toEqual({
      kind: 'lucide', Icon: Bot,
    });
  });

  it('falls back to generic.png for truly unknown tools', () => {
    const visual = resolveActivityVisual({ tool: 'totally_unknown_tool_xyz', type: 'tool' });
    expect(visual).toEqual({ kind: 'image', src: iconGeneric, alt: 'totally_unknown_tool_xyz' });
  });

  it('returns icon hints aligned with native app icons', () => {
    expect(resolveActivityIconHints('write_file')).toEqual({
      iconUrl: iconFiles,
      iconPlatform: 'files',
    });
    expect(resolveActivityIconHints('agent_schedule')).toEqual({
      iconUrl: iconCalendar,
      iconPlatform: 'calendar',
    });
  });
});
