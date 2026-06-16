import {
  composioIconUrl,
  getCachedToolkitDetail,
  peekToolkitDetail,
} from './composioToolkitCache';

export interface PlatformMeta {
  slug: string;
  logoUrl: string;
  color: string;
  initials: string;
  name: string;
}

const FALLBACK_COLORS = [
  '#4285F4',
  '#7C3AED',
  '#0EA5E9',
  '#10B981',
  '#F97316',
  '#EC4899',
  '#6366F1',
  '#14B8A6',
];

export function normalizePlatformSlug(platform: string): string {
  return platform.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fallbackColor(slug: string): string {
  const hash = slug.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function initialsForName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

function fallbackName(platform: string): string {
  const readable = titleCase(platform);
  return readable || 'Service';
}

export function getPlatformMeta(platform: string, logoUrl?: string, nameHint?: string): PlatformMeta {
  const slug = normalizePlatformSlug(platform);
  const cached = peekToolkitDetail(slug);
  const name = nameHint?.trim() || cached?.name || fallbackName(platform);

  return {
    slug,
    logoUrl: logoUrl || composioIconUrl(slug, cached?.logo),
    color: fallbackColor(slug || name),
    initials: initialsForName(name),
    name,
  };
}

export async function fetchPlatformMeta(platform: string): Promise<PlatformMeta> {
  const slug = normalizePlatformSlug(platform);
  const detail = await getCachedToolkitDetail(slug);
  const name = detail?.name || fallbackName(platform);
  return getPlatformMeta(platform, composioIconUrl(slug, detail?.logo), name);
}

export function getPlatformName(platform: string): string {
  return getPlatformMeta(platform).name;
}

export function getPlatformDisplayName(platform: string, providedName?: string): string {
  const trimmed = providedName?.trim();
  if (!trimmed) return getPlatformName(platform);

  const normalizedProvided = normalizePlatformSlug(trimmed);
  const normalizedPlatform = normalizePlatformSlug(platform);
  if (normalizedProvided === normalizedPlatform || trimmed === trimmed.toLowerCase()) {
    return getPlatformName(trimmed);
  }
  return trimmed;
}

export function formatPlatformDescription(description: string, platform: string, displayName?: string): string {
  const name = displayName || getPlatformDisplayName(platform);
  const trimmed = description.trim();
  if (!trimmed) return `Connect ${name} to continue.`;
  if (trimmed.toLowerCase().includes(name.toLowerCase())) return trimmed;
  return trimmed.replace(/\bthis (service|account|integration)\b/i, name);
}

export function getPlatformColor(platform: string): string {
  return getPlatformMeta(platform).color;
}
