export function normalizeWorkspacePath(path: string | undefined | null): string {
  const raw = String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/construct\/workspace\/?/, '')
    .replace(/^\/home\/sandbox\/workspace\/?/, '')
    .replace(/^\/+/, '');
  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return '';
    segments.push(segment);
  }
  return segments.join('/');
}

export function workspaceDisplayPath(path: string | undefined | null): string {
  const normalized = normalizeWorkspacePath(path);
  return normalized ? `/${normalized}` : '/';
}

export function fileNameFromWorkspacePath(path: string | undefined | null): string {
  const normalized = normalizeWorkspacePath(path);
  return normalized.split('/').filter(Boolean).pop() || String(path || 'file');
}

export function isImageWorkspacePath(path: string | undefined | null): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?)$/i.test(normalizeWorkspacePath(path));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Hide redundant workspace @mentions when the same files are already carried
 * as structured attachments. The chip is the source of truth; message text
 * should stay readable instead of echoing raw uploads/... paths.
 */
export function stripAttachedWorkspaceReferences(
  content: string,
  attachments: Array<string | undefined | null> | undefined,
): string {
  const paths = [...new Set((attachments || []).map(normalizeWorkspacePath).filter(Boolean))];
  if (!content || paths.length === 0) return content;

  let next = content;
  for (const path of paths) {
    const variants = [path, `/${path}`];
    for (const variant of variants) {
      next = next.replace(
        new RegExp(`(^|\\s)@${escapeRegExp(variant)}(?=$|\\s|[.,;:!?)]|["'])`, 'g'),
        '$1',
      );
    }
  }

  return next
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
