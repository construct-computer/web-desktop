export interface AuthConnectPayload {
  kind?: 'composio' | 'app';
  toolkit: string;
  name: string;
  description: string;
  url?: string;
  logo?: string;
  appId?: string;
  sessionKey?: string;
  expiresAt?: number;
  pendingActionId?: string;
  createdAt?: number;
}

const AUTH_MARKER_RE = /<!--AUTH_CONNECT:(.*?)-->/;

export function parseAuthMarker(content: string): { payload: AuthConnectPayload; rest: string } | null {
  const match = content.match(AUTH_MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as AuthConnectPayload;
    const rest = content.replace(AUTH_MARKER_RE, '').trim();
    return { payload, rest };
  } catch {
    return null;
  }
}
