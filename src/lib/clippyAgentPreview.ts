export const CLIPPY_PREFIX = 'CLIPPY:';
const CLIPPY_MAX_CHARS = 90;

function normalizeClippyLine(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= CLIPPY_MAX_CHARS) return compact;
  return `${compact.slice(0, CLIPPY_MAX_CHARS - 1).trimEnd()}…`;
}

/** Strip leading CLIPPY status line from assistant text (matches worker persistence). */
export function stripClippyFromText(fullText: string): { body: string; clippy?: string } {
  if (!fullText) return { body: fullText };

  const leading = fullText.match(/^\s*/)?.[0] ?? '';
  const trimmed = fullText.slice(leading.length);
  if (!trimmed.startsWith(CLIPPY_PREFIX)) {
    return { body: fullText };
  }

  const afterPrefix = trimmed.slice(CLIPPY_PREFIX.length);
  const newlineIndex = afterPrefix.indexOf('\n');
  if (newlineIndex === -1) {
    const line = normalizeClippyLine(afterPrefix);
    return { body: '', ...(line ? { clippy: line } : {}) };
  }

  const line = normalizeClippyLine(afterPrefix.slice(0, newlineIndex));
  let rest = afterPrefix.slice(newlineIndex + 1).replace(/^\s*\n+/, '');
  if (leading && rest) rest = leading + rest;
  else if (leading && !rest) rest = leading;

  return {
    body: rest,
    ...(line ? { clippy: line } : {}),
  };
}

export function isClippyOnlyAgentContent(content: string): boolean {
  return !stripClippyFromText(content).body.trim();
}

/** User-visible assistant body with CLIPPY status line removed. */
export function agentDisplayContent(content: string): string {
  return stripClippyFromText(content).body;
}

/** Strip common markdown for compact Clippy previews. */
export function stripMarkdownForPreview(text: string): string {
  return text
    .replace(new RegExp(`^\\s*${CLIPPY_PREFIX}\\s*`, 'im'), '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(text: string): string {
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1].trim() : text;
}

function looksLikeList(text: string): boolean {
  return /^\s*[-*+]\s/m.test(text) || (text.split(/\n/).filter((l) => l.trim()).length >= 3);
}

/** First few lines of agent text, with … when truncated or more content remains. */
export function summarizeAgentTextPreview(
  text: string,
  maxLines = 2,
  maxChars = 90,
): string {
  if (!text.trim()) return '';

  const cleaned = text.replace(new RegExp(`^\\s*${CLIPPY_PREFIX}\\s*[^\n]*\n+`, 'im'), '');
  const rawLines = cleaned
    .split(/\n/)
    .map((line) => stripMarkdownForPreview(line))
    .filter(Boolean);
  if (rawLines.length === 0) return '';

  const joined = rawLines.join(' ').replace(/\s+/g, ' ').trim();
  const trailingNewline = /\n\s*$/.test(cleaned);
  const hasMoreLines = rawLines.length > maxLines;
  const hasMoreContent =
    hasMoreLines
    || trailingNewline
    || cleaned.trim().includes('\n\n')
    || (looksLikeList(cleaned) && rawLines.length > 1);

  let preview: string;
  if (looksLikeList(cleaned) && rawLines.length > 0) {
    preview = firstSentence(rawLines[0]);
  } else {
    preview = rawLines.slice(0, maxLines).join(' ').replace(/\s+/g, ' ').trim();
    if (preview && !preview.match(/[.!?]$/) && rawLines.length === 1) {
      preview = firstSentence(preview);
    }
  }

  if (!preview) return '';

  if (preview.length > maxChars) {
    return `${preview.slice(0, maxChars - 1).trimEnd()}…`;
  }
  if (hasMoreContent) {
    return `${preview}…`;
  }
  return preview;
}
