import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface WebSearchResultRow {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResultRow[];
  resultCount: number;
  country: string;
}

export interface WebFetchResponse {
  url: string;
  title: string;
  content: string;
  publishedTime?: string;
  description?: string;
  truncated?: boolean;
  contentFormat?: 'json' | 'markdown';
}

export interface WebApiError {
  error: string;
  errorClass?: string;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as T & WebApiError;
  if (!res.ok) {
    return { ok: false, error: json.error || `Request failed (${res.status})`, status: res.status };
  }
  return { ok: true, data: json as T };
}

export function retryWebSearch(opts: {
  query: string;
  country?: string;
  maxResults?: number;
  simplify?: boolean;
}) {
  return postJson<WebSearchResponse>('/web/search', {
    query: opts.query,
    ...(opts.country ? { country: opts.country } : {}),
    ...(opts.maxResults !== undefined ? { max_results: opts.maxResults } : {}),
    ...(opts.simplify ? { simplify: true } : {}),
  });
}

export function retryWebFetch(opts: { url: string; selector?: string }) {
  return postJson<WebFetchResponse>('/web/fetch', {
    url: opts.url,
    ...(opts.selector ? { selector: opts.selector } : {}),
  });
}
