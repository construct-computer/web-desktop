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
});
