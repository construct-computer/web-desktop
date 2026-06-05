export type SearchBreadcrumb = {
  host: string;
  pathSegments: string[];
  display: string;
};

const BREADCRUMB_MAX = 60;

export function breadcrumbFromUrl(url: string): SearchBreadcrumb {
  if (!url?.trim()) {
    return { host: '', pathSegments: [], display: '' };
  }
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const segments = u.pathname
      .split('/')
      .filter((s) => s && s !== 'index.html')
      .map((s) => decodeURIComponent(s.replace(/\.(html?|php|aspx)$/i, '')));

    let display = host;
    if (segments.length > 0) {
      const pathPart = segments.join(' › ');
      const combined = `${host} › ${pathPart}`;
      display = combined.length <= BREADCRUMB_MAX
        ? combined
        : `${host} › ${pathPart.slice(0, BREADCRUMB_MAX - host.length - 4)}…`;
    }
    return { host, pathSegments: segments, display };
  } catch {
    const trimmed = url.slice(0, BREADCRUMB_MAX);
    return { host: trimmed, pathSegments: [], display: trimmed };
  }
}

export function formatSearchDate(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(parsed));
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function clampLines(text: string, max: number): string {
  const lines = text.split('\n').slice(0, max);
  return lines.join('\n').trim();
}

export function countryLabel(code?: string): string | null {
  if (!code?.trim()) return null;
  const upper = code.trim().toUpperCase();
  try {
    const name = new Intl.DisplayNames(undefined, { type: 'region' }).of(upper);
    return name || upper;
  } catch {
    return upper;
  }
}
