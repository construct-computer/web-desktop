/** Strip common markdown for compact Clippy previews. */
export function stripMarkdownForPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First few lines of agent text, with … when truncated or more content remains. */
export function summarizeAgentTextPreview(
  text: string,
  maxLines = 2,
  maxChars = 90,
): string {
  if (!text.trim()) return '';

  const rawLines = text
    .split(/\n/)
    .map((line) => stripMarkdownForPreview(line))
    .filter(Boolean);
  if (rawLines.length === 0) return '';

  const trailingNewline = /\n\s*$/.test(text);
  const hasMoreLines = rawLines.length > maxLines;
  const hasMoreContent = hasMoreLines || trailingNewline || text.trim().includes('\n\n');

  let preview = rawLines.slice(0, maxLines).join(' ').replace(/\s+/g, ' ').trim();
  if (!preview) return '';

  if (preview.length > maxChars) {
    return `${preview.slice(0, maxChars - 1).trimEnd()}…`;
  }
  if (hasMoreContent) {
    return `${preview}…`;
  }
  return preview;
}
