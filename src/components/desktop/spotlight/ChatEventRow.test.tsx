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
});
