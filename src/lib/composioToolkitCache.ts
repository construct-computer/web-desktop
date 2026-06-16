import * as api from '@/services/api';

export interface ComposioToolkitDetail {
  name?: string;
  description?: string;
  logo?: string;
}

const TOOLKIT_DETAIL_TTL_MS = 10 * 60_000;
const cache = new Map<string, { fetchedAt: number; detail: ComposioToolkitDetail }>();

export function composioIconUrl(slug: string, logo?: string): string {
  return logo || `https://logos.composio.dev/api/${slug}`;
}

export function peekToolkitDetail(slug: string): ComposioToolkitDetail | null {
  const normalized = slug.trim().toLowerCase();
  const cached = cache.get(normalized);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt >= TOOLKIT_DETAIL_TTL_MS) return null;
  return cached.detail;
}

export function seedToolkitCache(entries: Record<string, ComposioToolkitDetail>): void {
  const now = Date.now();
  for (const [slug, detail] of Object.entries(entries)) {
    cache.set(slug.trim().toLowerCase(), { fetchedAt: now, detail });
  }
}

export function clearComposioToolkitCache(): void {
  cache.clear();
}

export async function getCachedToolkitDetail(slug: string): Promise<ComposioToolkitDetail | null> {
  const normalized = slug.trim().toLowerCase();
  const peek = peekToolkitDetail(normalized);
  if (peek) return peek;
  const detail = await api.getComposioToolkitDetail(normalized);
  if (detail.success && detail.data) {
    const slim = {
      name: detail.data.name,
      description: detail.data.description,
      logo: detail.data.logo,
    };
    cache.set(normalized, { fetchedAt: Date.now(), detail: slim });
    return slim;
  }
  return null;
}
