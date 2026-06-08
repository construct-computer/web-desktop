import { describe, expect, it } from 'vitest';
import { ListTodo } from 'lucide-react';
import { enrichActivityIconFields, resolveActivityIconHints, resolveActivityVisual } from './toolActivityIcon';
import iconAgents from '@/icons/agents.png';
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
import iconCheckpoint from '@/icons/checkpoint.png';

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

  it('uses checkpoint.png for research checkpoint activities', () => {
    expect(resolveActivityVisual({
      tool: 'research_checkpoint',
      type: 'tool',
      label: 'Research checkpoint (checkpoint)',
    })).toEqual({
      kind: 'image', src: iconCheckpoint, alt: 'Research checkpoint',
    });
    expect(resolveActivityVisual({
      type: 'tool',
      label: 'Research ceiling reached (budget)',
    })).toEqual({
      kind: 'image', src: iconCheckpoint, alt: 'Research checkpoint',
    });
  });

  it('uses agents.png for orchestration and delegation tools', () => {
    for (const tool of ['spawn_agent', 'spawn_agents', 'wait_for_agents', 'mailbox_received']) {
      expect(resolveActivityVisual({ tool, type: 'delegation' })).toEqual({
        kind: 'image', src: iconAgents, alt: 'Agents',
      });
    }
    expect(resolveActivityVisual({
      tool: 'mailbox_received',
      type: 'background',
      label: 'Received 3 messages from background tasks',
    })).toEqual({
      kind: 'image', src: iconAgents, alt: 'Agents',
    });
  });

  it('uses Lucide icons for task tools without branded PNGs', () => {
    expect(resolveActivityVisual({ tool: 'task_create', type: 'tool' })).toEqual({
      kind: 'lucide', Icon: ListTodo,
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

describe('enrichActivityIconFields', () => {
  it('maps memory and policy activities to memory.png', () => {
    const memoryItem = { id: 'm1', event: 'RECALL' as const, memory: 'prefers compact updates' };
    expect(enrichActivityIconFields({
      memoryActivity: {
        provider: 'Construct Memory',
        items: [memoryItem],
      },
    })).toEqual({
      tool: 'memory',
      activityType: 'tool',
      iconPlatform: 'memory',
      iconUrl: iconMemory,
    });

    expect(enrichActivityIconFields({
      tool: 'autopilot',
      activityType: 'tool',
      policyActivity: {
        items: [{ id: 1, title: 'Default tone', description: 'Be concise' }],
      },
    })).toEqual({
      tool: 'memory',
      activityType: 'tool',
      iconPlatform: 'memory',
      iconUrl: iconMemory,
    });
  });

  it('backfills hints for file and delegation activities without iconUrl', () => {
    expect(enrichActivityIconFields({
      tool: 'read_file',
      activityType: 'file',
      label: 'Reading uploads/5136a236f7e9…',
    })).toEqual({
      tool: 'read_file',
      activityType: 'file',
      iconPlatform: 'files',
      iconUrl: iconFiles,
    });

    expect(enrichActivityIconFields({
      tool: 'spawn_agents',
      activityType: 'delegation',
      label: 'Starting 6 helpers: Research the…',
    })).toEqual({
      tool: 'spawn_agents',
      activityType: 'delegation',
      iconPlatform: 'Agents',
      iconUrl: iconAgents,
    });
  });

  it('derives checkpoint icon from label when tool is missing', () => {
    expect(enrichActivityIconFields({
      activityType: 'tool',
      label: 'Research checkpoint (checkpoint)',
    })).toEqual({
      tool: undefined,
      activityType: 'tool',
      iconPlatform: 'Research checkpoint',
      iconUrl: iconCheckpoint,
    });
  });

  it('maps knowledge tool alias to memory.png', () => {
    expect(enrichActivityIconFields({
      tool: 'knowledge',
      activityType: 'tool',
      label: 'Listing knowledge',
    })).toEqual({
      tool: 'memory',
      activityType: 'tool',
      iconPlatform: 'memory',
      iconUrl: iconMemory,
    });
  });

  it('preserves explicit iconUrl', () => {
    const customUrl = 'https://example.com/icon.png';
    expect(enrichActivityIconFields({
      tool: 'read_file',
      activityType: 'file',
      iconUrl: customUrl,
    })).toEqual({
      tool: 'read_file',
      activityType: 'file',
      iconUrl: customUrl,
    });
  });
});
