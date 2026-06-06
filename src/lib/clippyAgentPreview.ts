const CLIPPY_PREFIX = 'CLIPPY:';

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
