import { decodeDisplayName } from './workspacePaths';

export const EMPTY_VISUAL_CELL = '—';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Array of plain objects — suitable for tabular rendering. */
export function isTableArray(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => isPlainObject(item));
}

export function collectTableHeaders(rows: Record<string, unknown>[], max = 50): string[] {
  return Array.from(new Set(rows.flatMap((item) => Object.keys(item)))).slice(0, max);
}

export function countTableRows(value: unknown): number {
  if (isTableArray(value)) return value.length;
  if (isPlainObject(value)) {
    return Object.values(value).reduce<number>((sum, v) => sum + countTableRows(v), 0);
  }
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, v) => sum + countTableRows(v), 0);
  }
  return 0;
}

export function formatFieldLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

export function formatVisualCell(value: unknown, maxLen = 120): string {
  if (value === null || value === undefined) return EMPTY_VISUAL_CELL;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const display = decodeDisplayName(value);
    if (display.length <= maxLen) return display;
    return `${display.slice(0, maxLen - 1)}…`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allPrimitive = value.every(
      (item) => item === null || ['string', 'number', 'boolean'].includes(typeof item),
    );
    if (allPrimitive) {
      const joined = value.map((item) => formatVisualCell(item, 40)).join(', ');
      if (joined.length <= maxLen) return joined;
    }
    return `[${value.length} items]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const compact = JSON.stringify(value);
    if (compact.length <= maxLen) return compact;
    return `{${keys.length} keys}`;
  }
  return String(value);
}

export function formatVisualScalar(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_VISUAL_CELL;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return decodeDisplayName(value);
  return formatVisualCell(value, 500);
}

export function isLikelyNavigableString(value: string): boolean {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return value.startsWith('/');
}
