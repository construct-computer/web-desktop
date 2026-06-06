export type AuthScheme = 'OAUTH2' | 'OAUTH1' | 'API_KEY' | 'BEARER_TOKEN' | 'BASIC' | 'NO_AUTH' | string;

export interface AuthField {
  name: string;
  displayName: string;
  description?: string;
  required: boolean;
}

export interface ComposioAuthDetail {
  auth_schemes: string[];
  auth_config?: Array<{ mode: string; fields: AuthField[] }>;
  composio_managed_schemes?: string[];
}

/** Composio sometimes returns auth_schemes as string[], sometimes as object[] with `.mode`. */
export function normalizeAuthSchemes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') out.push(item.toUpperCase());
    else if (item && typeof item === 'object') {
      const mode = (item as { mode?: unknown; type?: unknown; auth_scheme?: unknown }).mode
        ?? (item as { type?: unknown }).type
        ?? (item as { auth_scheme?: unknown }).auth_scheme;
      if (typeof mode === 'string' && mode) out.push(mode.toUpperCase());
    }
  }
  return out;
}

export function rankAuthScheme(scheme: string, managed: Set<string>): number {
  if ((scheme === 'OAUTH2' || scheme === 'OAUTH1') && managed.has(scheme)) return 0;
  if (scheme === 'API_KEY') return 1;
  if (scheme === 'BEARER_TOKEN') return 2;
  if (scheme === 'BASIC') return 3;
  if (scheme === 'NO_AUTH') return 4;
  if (scheme === 'OAUTH2' || scheme === 'OAUTH1') return 5;
  return 6;
}

export function prettyAuthSchemeLabel(scheme: string): string {
  switch (scheme) {
    case 'OAUTH2':
    case 'OAUTH1': return 'OAuth';
    case 'API_KEY': return 'API key';
    case 'BEARER_TOKEN': return 'Bearer token';
    case 'BASIC': return 'Username & password';
    case 'NO_AUTH': return 'No auth';
    default: return scheme;
  }
}

export function defaultAuthFields(scheme: string): AuthField[] {
  switch (scheme) {
    case 'API_KEY':
      return [{ name: 'generic_api_key', displayName: 'API Key', required: true }];
    case 'BEARER_TOKEN':
      return [{ name: 'token', displayName: 'Bearer Token', required: true }];
    case 'BASIC':
      return [
        { name: 'username', displayName: 'Username', required: true },
        { name: 'password', displayName: 'Password', required: true },
      ];
    default:
      return [];
  }
}

export function prettifyConnectError(slug: string, raw: string): string {
  const txt = raw || '';
  if (/DefaultAuthConfigNotFound|does not have managed credentials/i.test(txt)) {
    return `${slug} doesn't support one-click connect with this method. Try another sign-in option.`;
  }
  const match = txt.match(/"message":"([^"]+)"/);
  if (match) return match[1];
  return txt || `Failed to connect ${slug}`;
}

export function isOAuthScheme(scheme: string): boolean {
  return scheme === 'OAUTH2' || scheme === 'OAUTH1';
}

export function isCredentialScheme(scheme: string): boolean {
  return scheme === 'API_KEY' || scheme === 'BEARER_TOKEN' || scheme === 'BASIC';
}

export function getFieldsForScheme(
  detail: ComposioAuthDetail | null,
  scheme: string,
): AuthField[] {
  const schemeConfig = detail?.auth_config?.find((a) => (a.mode || '').toUpperCase() === scheme);
  return schemeConfig?.fields?.length ? schemeConfig.fields : defaultAuthFields(scheme);
}

export function orderAuthSchemes(schemes: string[], managed: Set<string>): string[] {
  return [...schemes].sort((a, b) => rankAuthScheme(a, managed) - rankAuthScheme(b, managed));
}
