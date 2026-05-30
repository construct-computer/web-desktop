import { describe, expect, it } from 'vitest';
import {
  clearComponentMentionsForSession,
  componentMentionsForSession,
  removeComponentMentionForSession,
  upsertComponentMentionForSession,
} from './componentMentions';

type Mention = {
  appId: string;
  componentId: string;
  label?: string;
};

describe('component mention drafts', () => {
  it('keeps pending component mentions scoped to a Spotlight session', () => {
    let bySession: Record<string, Mention[]> = {};
    bySession = upsertComponentMentionForSession(bySession, 'chat-a', {
      appId: 'dashboard',
      componentId: 'table',
      label: 'Pipeline table',
    });
    bySession = upsertComponentMentionForSession(bySession, 'chat-b', {
      appId: 'dashboard',
      componentId: 'chart',
      label: 'Revenue chart',
    });

    expect(componentMentionsForSession(bySession, 'chat-a')).toEqual([
      { appId: 'dashboard', componentId: 'table', label: 'Pipeline table' },
    ]);
    expect(componentMentionsForSession(bySession, 'chat-b')).toEqual([
      { appId: 'dashboard', componentId: 'chart', label: 'Revenue chart' },
    ]);
  });

  it('replaces duplicate component mentions in the same session', () => {
    let bySession: Record<string, Mention[]> = {};
    bySession = upsertComponentMentionForSession(bySession, 'chat-a', {
      appId: 'dashboard',
      componentId: 'table',
      label: 'Old label',
    });
    bySession = upsertComponentMentionForSession(bySession, 'chat-a', {
      appId: 'dashboard',
      componentId: 'table',
      label: 'New label',
    });

    expect(componentMentionsForSession(bySession, 'chat-a')).toEqual([
      { appId: 'dashboard', componentId: 'table', label: 'New label' },
    ]);
  });

  it('removes and clears only the target session', () => {
    let bySession: Record<string, Mention[]> = {
      'chat-a': [
        { appId: 'dashboard', componentId: 'table' },
        { appId: 'dashboard', componentId: 'chart' },
      ],
      'chat-b': [{ appId: 'crm', componentId: 'form' }],
    };

    bySession = removeComponentMentionForSession(bySession, 'chat-a', 'dashboard', 'table');
    expect(componentMentionsForSession(bySession, 'chat-a')).toEqual([
      { appId: 'dashboard', componentId: 'chart' },
    ]);
    expect(componentMentionsForSession(bySession, 'chat-b')).toEqual([
      { appId: 'crm', componentId: 'form' },
    ]);

    bySession = clearComponentMentionsForSession(bySession, 'chat-a');
    expect(componentMentionsForSession(bySession, 'chat-a')).toEqual([]);
    expect(componentMentionsForSession(bySession, 'chat-b')).toEqual([
      { appId: 'crm', componentId: 'form' },
    ]);
  });
});

