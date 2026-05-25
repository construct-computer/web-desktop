import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatEventRow } from './ChatEventRow';
import type { ChatMessage } from '@/stores/agentStore';

describe('ChatEventRow', () => {
  it('does not expose details when an incident only has a reference id', () => {
    const msg: ChatMessage = {
      role: 'notice',
      content: 'Composio failed',
      timestamp: new Date(1),
      noticeKind: 'incident',
      noticeTitle: 'Composio failed',
      noticeToolName: 'composio',
      incidentId: 'inc_123',
      incidentIds: ['inc_123'],
    };

    const html = renderToStaticMarkup(<ChatEventRow msg={msg} />);

    expect(html).not.toContain('Details');
    expect(html).not.toContain('inc_123');
  });

  it('shows details only when the row has useful diagnostic text', () => {
    const msg: ChatMessage = {
      role: 'notice',
      content: 'Capability failed\nNext step: reconnect Gmail',
      timestamp: new Date(1),
      noticeKind: 'incident',
      noticeTitle: 'Capability failed',
      noticeDetail: 'Next step: reconnect Gmail',
      noticeToolName: 'gmail',
    };

    const html = renderToStaticMarkup(<ChatEventRow msg={msg} />);

    expect(html).toContain('Details');
  });

  it('renders live code previews for app generation', () => {
    const msg: ChatMessage = {
      role: 'activity',
      content: 'Creating app code: demo',
      timestamp: new Date(1),
      tool: 'app',
      activityType: 'file',
      codePreview: {
        previewId: 'preview-1',
        title: 'Creating app code: demo',
        action: 'create_local',
        appId: 'demo',
        status: 'streaming',
        files: [
          {
            path: 'index.html',
            language: 'html',
            content: '<main>Hello</main>',
            complete: false,
          },
        ],
      },
    };

    const html = renderToStaticMarkup(<ChatEventRow msg={msg} />);

    expect(html).toContain('Generating code');
    expect(html).toContain('index.html');
    expect(html).toContain('&lt;main&gt;Hello&lt;/main&gt;');
  });

  it('renders automatic memory activity as a subtle collapsed summary', () => {
    const msg: ChatMessage = {
      role: 'activity',
      content: 'Memory created',
      timestamp: new Date(1),
      tool: 'memory',
      activityType: 'tool',
      memoryActivity: {
        provider: 'Construct Memory',
        environment: 'prod',
        scope: 'user',
        items: [{ id: 'mem_1', event: 'ADD', memory: 'User prefers compact status updates.' }],
      },
    };

    const html = renderToStaticMarkup(<ChatEventRow msg={msg} />);

    expect(html).toContain('Memory created');
    expect(html).toContain('User prefers compact status updates.');
    expect(html).not.toContain('Stored in');
    expect(html).not.toContain('prod');
    expect(html).not.toContain('USER');
    expect(html).not.toContain('CREATED');
    expect(html).not.toContain('mem_1');
  });

  it('renders pending memory saves without expandable details', () => {
    const msg: ChatMessage = {
      role: 'activity',
      content: 'Memory saving',
      timestamp: new Date(1),
      tool: 'memory',
      activityType: 'tool',
      memoryActivity: {
        provider: 'Construct Memory',
        action: 'stored',
        status: 'pending',
        operationId: 'memory_1',
        environment: 'staging',
        scope: 'user',
        items: [],
      },
    };

    const html = renderToStaticMarkup(<ChatEventRow msg={msg} />);

    expect(html).toContain('Memory saving');
    expect(html).not.toContain('Details');
    expect(html).not.toContain('Construct Memory');
  });

  it('renders recalled memory activity without scores or environment metadata', () => {
    const msg: ChatMessage = {
      role: 'activity',
      content: 'Memory recalled',
      timestamp: new Date(1),
      tool: 'memory',
      activityType: 'tool',
      memoryActivity: {
        provider: 'Construct Memory',
        action: 'recalled',
        environment: 'staging',
        scope: 'user',
        items: [{ id: 'mem_2', event: 'RECALL', memory: 'User prefers compact status updates.', score: 0.91 }],
      },
    };

    const html = renderToStaticMarkup(<ChatEventRow msg={msg} />);

    expect(html).toContain('Memory recalled');
    expect(html).toContain('User prefers compact status updates.');
    expect(html).not.toContain('91%');
    expect(html).not.toContain('staging');
    expect(html).not.toContain('USER');
    expect(html).not.toContain('RECALLED');
    expect(html).not.toContain('Retrieved from');
    expect(html).not.toContain('mem_2');
  });

  it('summarizes multiple memory updates without rendering every item collapsed', () => {
    const msg: ChatMessage = {
      role: 'activity',
      content: 'Memory updated',
      timestamp: new Date(1),
      tool: 'memory',
      activityType: 'tool',
      memoryActivity: {
        provider: 'Construct Memory',
        action: 'stored',
        environment: 'staging',
        scope: 'user',
        items: [
          { id: 'mem_1', event: 'UPDATE', memory: 'User likes Silent Hill 2.' },
          { id: 'mem_2', event: 'ADD', memory: 'User studies at Chandigarh University.' },
        ],
      },
    };

    const html = renderToStaticMarkup(<ChatEventRow msg={msg} />);

    expect(html).toContain('Memory updated · 2 items');
    expect(html).not.toContain('User likes Silent Hill 2.');
    expect(html).not.toContain('Construct Memory');
    expect(html).not.toContain('staging');
    expect(html).not.toContain('USER');
    expect(html).not.toContain('UPDATED');
  });
});
