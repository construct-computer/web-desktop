export function formatBytes(bytes: number, opts: { zeroLabel?: string } = {}): string {
  if (bytes === 0 && opts.zeroLabel) return opts.zeroLabel;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatRelativeTimeShort(value: string | number): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parsePublishedDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

/** Full local datetime for tooltips (user locale + timezone). */
export function formatPublishedAbsolute(value: string): string {
  const date = parsePublishedDate(value);
  if (!date) return value.trim();
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Relative published time for fetch reader headers (e.g. 3d ago, 2mo ago). */
export function formatPublishedRelative(value: string, now = Date.now()): string {
  const date = parsePublishedDate(value);
  if (!date) return value.trim();

  const diff = now - date.getTime();
  if (diff < 0) return formatPublishedAbsolute(value);
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`;

  const months = Math.floor(diff / 2_592_000_000);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  if (years < 5) return `${years}y ago`;

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}
