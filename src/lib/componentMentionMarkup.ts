export type ComponentMentionLike = {
  appId: string;
  componentId: string;
};

export type ComponentMentionTextPart<T extends ComponentMentionLike> =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; mention: T; key: string };

const COMPONENT_MARKER_RE = /@\{component:([^:\s{}]+):([^}\s]+)\}/g;

function markerKey(appId: string, componentId: string): string {
  return `${appId}:${componentId}`;
}

export function componentMentionMarker(mention: ComponentMentionLike): string {
  return `@{component:${encodeURIComponent(mention.appId)}:${encodeURIComponent(mention.componentId)}}`;
}

export function prependComponentMentionMarkers<T extends ComponentMentionLike>(
  text: string,
  mentions: T[],
): string {
  if (mentions.length === 0) return text;
  const existing = new Set([...text.matchAll(COMPONENT_MARKER_RE)].map((match) => {
    try {
      return markerKey(decodeURIComponent(match[1] || ''), decodeURIComponent(match[2] || ''));
    } catch {
      return '';
    }
  }));
  const markers = mentions
    .filter((mention) => !existing.has(markerKey(mention.appId, mention.componentId)))
    .map(componentMentionMarker);
  if (markers.length === 0) return text;
  return [markers.join(' '), text.trim()].filter(Boolean).join(' ');
}

export function splitComponentMentionMarkers<T extends ComponentMentionLike>(
  text: string,
  mentions: T[] = [],
): ComponentMentionTextPart<T>[] {
  if (!text) return [];
  const mentionsByKey = new Map(mentions.map((mention) => [markerKey(mention.appId, mention.componentId), mention]));
  const parts: ComponentMentionTextPart<T>[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last?.kind === 'text') last.text += value;
    else parts.push({ kind: 'text', text: value });
  };
  let cursor = 0;
  for (const match of text.matchAll(COMPONENT_MARKER_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) pushText(text.slice(cursor, index));
    cursor = index + match[0].length;
    try {
      const appId = decodeURIComponent(match[1] || '');
      const componentId = decodeURIComponent(match[2] || '');
      const mention = mentionsByKey.get(markerKey(appId, componentId));
      if (mention) {
        parts.push({ kind: 'mention', mention, key: `${appId}:${componentId}:${index}` });
      } else {
        pushText(match[0]);
      }
    } catch {
      pushText(match[0]);
    }
  }
  if (cursor < text.length) pushText(text.slice(cursor));
  return parts;
}
