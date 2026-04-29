import { API_BASE_URL } from '@/lib/constants';

const ADMIN_BASE = `${API_BASE_URL}/admin`;

export type TimeRangeValue = '1h' | '6h' | '24h' | '7d' | '30d';

export interface AdminSession {
  authenticated: boolean;
  expiresAt: string | null;
}

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

async function parseJson(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) return response.json();
  const text = await response.text();
  return text ? { error: text } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ADMIN_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const data = await parseJson(response);
  if (!response.ok) {
    throw new AdminApiError(data?.error || `Admin request failed (${response.status})`, response.status);
  }
  return data as T;
}

export function rangeQuery(range: TimeRangeValue): string {
  return `range=${encodeURIComponent(range)}`;
}

export const adminApi = {
  session: () => request<AdminSession>('/session'),
  login: (password: string) => request<AdminSession>('/session', {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),
  logout: () => request<AdminSession>('/session', { method: 'DELETE' }),
  get: <T>(path: string) => request<T>(path),
};
