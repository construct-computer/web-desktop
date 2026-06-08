import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowserActivityRow } from './BrowserActivityRow';
import type { ChatMessage } from '@/stores/agentStore';
import iconBrowser from '@/icons/browser.png';

describe('BrowserActivityRow', () => {
  it('renders browser.png for every browser sub-step', () => {
    const message: ChatMessage = {
      role: 'activity',
      content: 'Clicking "Sign in"',
      timestamp: new Date(1),
      activityType: 'browser',
      tool: 'browser_click',
      browserAction: {
        actionType: 'click',
        url: 'https://example.com/login',
      },
    };

    const html = renderToStaticMarkup(<BrowserActivityRow message={message} />);

    expect(html).toContain(iconBrowser);
    expect(html).not.toContain('lucide-globe');
    expect(html).toContain('Clicking');
    expect(html).toContain('Sign in');
  });
});
