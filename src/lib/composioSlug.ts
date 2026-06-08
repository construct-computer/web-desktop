/** Match Composio toolkit slugs across canonical and legacy normalized forms. */
export function normalizeComposioToolkitSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function composioToolkitSlugsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ca = a.trim().toLowerCase();
  const cb = b.trim().toLowerCase();
  if (ca === cb) return true;
  return normalizeComposioToolkitSlug(a) === normalizeComposioToolkitSlug(b);
}

export function isComposioToolkitConnected(connected: Set<string>, slug: string): boolean {
  if (!slug) return false;
  if (connected.has(slug)) return true;
  const norm = normalizeComposioToolkitSlug(slug);
  for (const entry of connected) {
    if (normalizeComposioToolkitSlug(entry) === norm) return true;
  }
  return false;
}
