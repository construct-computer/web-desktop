export function hostFromUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function faviconUrlForHost(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

export function faviconUrlForPage(url: string | undefined): string | null {
  const host = hostFromUrl(url);
  return host ? faviconUrlForHost(host) : null;
}
