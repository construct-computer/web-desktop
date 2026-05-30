import { describe, expect, it } from 'vitest';
import {
  componentMentionKeysInText,
  componentMentionMarker,
  prependComponentMentionMarkers,
  removeComponentMentionMarker,
  splitComponentMentionMarkers,
  stripComponentMentionMarkers,
} from './componentMentionMarkup';

const mention = {
  appId: 'ops-console',
  componentId: 'status-card',
  label: 'Status card',
};

describe('component mention markup', () => {
  it('prepends missing markers without duplicating existing mentions', () => {
    const marker = componentMentionMarker(mention);

    expect(prependComponentMentionMarkers('make it live', [mention])).toBe(`${marker} make it live`);
    expect(prependComponentMentionMarkers(`${marker} make it live`, [mention])).toBe(`${marker} make it live`);
  });

  it('splits markers into inline mention parts', () => {
    const marker = componentMentionMarker(mention);
    const parts = splitComponentMentionMarkers(`Update ${marker} now`, [mention]);

    expect(parts).toEqual([
      { kind: 'text', text: 'Update ' },
      { kind: 'mention', mention, key: 'ops-console:status-card:7' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('leaves unknown markers as text', () => {
    const text = '@{component:missing:node} update';

    expect(splitComponentMentionMarkers(text, [mention])).toEqual([
      { kind: 'text', text },
    ]);
  });

  it('can inspect and remove draft markers', () => {
    const marker = componentMentionMarker(mention);
    const text = `Update ${marker} now`;

    expect(componentMentionKeysInText(text)).toEqual(new Set(['ops-console:status-card']));
    expect(removeComponentMentionMarker(text, mention)).toBe('Update now');
    expect(stripComponentMentionMarkers(text)).toBe('Update now');
  });
});
