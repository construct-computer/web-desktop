/** Compact one-line label for tool/activity rows in widgets and Spotlight. */
export function formatActivityLine(content: string, opts?: { activityType?: string }): string {
  const trimmed = content.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  const isTerminal = opts?.activityType === 'terminal';
  if (isTerminal) {
    const running = trimmed.match(/^Running\s+`([^`]+)`/i);
    if (running) return running[1];
    const backtick = trimmed.match(/^`([^`]+)`/);
    if (backtick) return backtick[1];
  }

  if (trimmed.length > 72) {
    return `${trimmed.slice(0, 71).trimEnd()}…`;
  }
  return trimmed;
}
