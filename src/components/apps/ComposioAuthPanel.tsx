/**
 * ComposioAuthPanel — multi-scheme auth UI for a Composio toolkit.
 *
 * Renders one card per supported auth scheme. OAuth is prioritized if
 * Composio has managed credentials for it; otherwise it's shown disabled
 * and the user can pick API key / bearer / basic instead.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Check, AlertCircle, ExternalLink, KeyRound, ShieldAlert, X,
} from 'lucide-react';
import * as api from '@/services/api';

type Scheme = 'OAUTH2' | 'OAUTH1' | 'API_KEY' | 'BEARER_TOKEN' | 'BASIC' | 'NO_AUTH' | string;

interface Field {
  name: string;
  displayName: string;
  description?: string;
  required: boolean;
}

export interface ComposioAuthPanelProps {
  slug: string;
  /** Called after a successful connection so the parent can refresh status. */
  onConnected?: () => void;
  className?: string;
}

export function ComposioAuthPanel({ slug, onConnected, className }: ComposioAuthPanelProps) {
  const [detail, setDetail] = useState<{
    auth_schemes: string[];
    auth_config?: Array<{ mode: string; fields: Field[] }>;
    composio_managed_schemes?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedScheme, setExpandedScheme] = useState<Scheme | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [busyScheme, setBusyScheme] = useState<Scheme | null>(null);
  const popupTimerRef = useRef<number | null>(null);
  const oauthConnIdRef = useRef<string | null>(null);
  const onConnectedRef = useRef(onConnected);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getComposioToolkitDetail(slug);
      if (res.success && res.data) {
        setDetail({
          auth_schemes: normalize(res.data.auth_schemes),
          auth_config: res.data.auth_config,
          composio_managed_schemes: normalize(res.data.composio_managed_schemes),
        });
      } else {
        setError(!res.success ? res.error : 'Could not load authentication info.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load authentication info.');
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => () => {
    if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
  }, []);

  // Listen for the OAuth popup's postMessage so we can finalize + refresh.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'composio:connected') {
        const connId = (typeof e.data.connectedAccountId === 'string' && e.data.connectedAccountId)
          || oauthConnIdRef.current
          || undefined;
        api.composioFinalize(connId).finally(() => {
          oauthConnIdRef.current = null;
          setBusyScheme(null);
          onConnectedRef.current?.();
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const schemes = detail?.auth_schemes ?? [];
  const managed = new Set(detail?.composio_managed_schemes ?? []);

  const startOAuth = async (scheme: Scheme) => {
    setError(null);
    setBusyScheme(scheme);
    try {
      const r = await api.composioConnect(slug, scheme, {});
      if (!r.success) {
        setError(r.error || 'Could not start OAuth flow.');
        setBusyScheme(null);
        return;
      }
      const url = r.data.url;
      if (!url) {
        setError(r.data.error || 'OAuth is not available for this toolkit right now.');
        setBusyScheme(null);
        return;
      }
      oauthConnIdRef.current = r.data.connected_account_id || null;
      const width = 520, height = 640;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(url, 'composio-oauth', `width=${width},height=${height},left=${left},top=${top},popup=1`);
      if (!popup) {
        setError('Your browser blocked the popup. Allow popups for this site and try again.');
        setBusyScheme(null);
        return;
      }
      if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
      popupTimerRef.current = window.setInterval(async () => {
        if (popup.closed) {
          if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
          popupTimerRef.current = null;
          const connId = oauthConnIdRef.current || undefined;
          try { await api.composioFinalize(connId); } catch { /* ignore */ }
          oauthConnIdRef.current = null;
          setBusyScheme(null);
          onConnectedRef.current?.();
        }
      }, 800) as unknown as number;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth flow failed.');
      setBusyScheme(null);
    }
  };

  const submitCredentials = async (scheme: Scheme) => {
    setError(null);
    setBusyScheme(scheme);
    try {
      const r = await api.composioConnect(slug, scheme, credentials);
      if (r.success && r.data?.ok) {
        setCredentials({});
        setExpandedScheme(null);
        onConnectedRef.current?.();
      } else {
        const raw = (r.success && r.data?.error) || (!r.success && r.error) || '';
        setError(prettify(slug, raw));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save credentials.');
    }
    setBusyScheme(null);
  };

  const connectNoAuth = async () => {
    setError(null);
    setBusyScheme('NO_AUTH');
    try {
      const r = await api.composioConnect(slug, 'NO_AUTH', {});
      if (r.success && r.data?.ok) {
        onConnectedRef.current?.();
      } else {
        const raw = (r.success && r.data?.error) || (!r.success && r.error) || '';
        setError(prettify(slug, raw));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
    }
    setBusyScheme(null);
  };

  const toggleExpand = (scheme: Scheme, fields: Field[]) => {
    if (expandedScheme === scheme) {
      setExpandedScheme(null);
      setCredentials({});
      return;
    }
    const init: Record<string, string> = {};
    fields.forEach((f) => { init[f.name] = ''; });
    setCredentials(init);
    setExpandedScheme(scheme);
    setError(null);
  };

  if (loading && !detail) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading authentication options…
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={className}>
        <ErrorBanner message={error ?? 'Authentication info unavailable.'} onDismiss={() => setError(null)} />
      </div>
    );
  }

  if (schemes.length === 0) {
    return (
      <div className={className}>
        <div className="text-[11px] text-amber-500/90 bg-amber-500/[0.08] border border-amber-500/20 rounded-[8px] px-3 py-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>This integration declares no supported auth schemes.</span>
        </div>
      </div>
    );
  }

  // Order: OAuth first (if managed), other credential schemes, unsupported last.
  const ordered = [...schemes].sort((a, b) => rank(a, managed) - rank(b, managed));
  const hasManagedOAuth = schemes.some((s) => (s === 'OAUTH2' || s === 'OAUTH1') && managed.has(s));

  return (
    <div className={className}>
      {error && <div className="mb-2"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {schemes.length > 1 && (
        <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
          Choose how you&apos;d like to sign in.
        </p>
      )}
      <div className="space-y-2">
        {ordered.map((scheme) => {
          const isOAuth = scheme === 'OAUTH2' || scheme === 'OAUTH1';
          const isNoAuth = scheme === 'NO_AUTH';
          const schemeConfig = detail.auth_config?.find((a) => (a.mode || '').toUpperCase() === scheme);
          const fields = schemeConfig?.fields?.length ? schemeConfig.fields : defaultFields(scheme);
          const available = isOAuth ? managed.has(scheme) : true;
          const recommended = isOAuth && available && hasManagedOAuth;
          const unavailableReason = isOAuth && !available
            ? 'OAuth credentials are not configured in Composio for this toolkit. Use another method below.'
            : undefined;

          return (
            <SchemeCard
              key={scheme}
              scheme={scheme}
              isOAuth={isOAuth}
              isNoAuth={isNoAuth}
              available={available}
              recommended={recommended}
              unavailableReason={unavailableReason}
              fields={fields}
              isExpanded={expandedScheme === scheme}
              credentials={credentials}
              busy={busyScheme === scheme}
              anyBusy={busyScheme !== null}
              onClick={() => {
                if (!available) return;
                if (isOAuth) { startOAuth(scheme); return; }
                if (isNoAuth) { connectNoAuth(); return; }
                toggleExpand(scheme, fields);
              }}
              onChangeCredential={(name, value) => setCredentials((prev) => ({ ...prev, [name]: value }))}
              onSubmit={() => submitCredentials(scheme)}
              onCancel={() => { setExpandedScheme(null); setCredentials({}); setError(null); }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Subcomponents ──

function SchemeCard({
  scheme, isOAuth, isNoAuth, available, recommended, unavailableReason, fields,
  isExpanded, credentials, busy, anyBusy,
  onClick, onChangeCredential, onSubmit, onCancel,
}: {
  scheme: string;
  isOAuth: boolean;
  isNoAuth: boolean;
  available: boolean;
  recommended: boolean;
  unavailableReason?: string;
  fields: Field[];
  isExpanded: boolean;
  credentials: Record<string, string>;
  busy: boolean;
  anyBusy: boolean;
  onClick: () => void;
  onChangeCredential: (name: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const canSubmit = fields.every((f) => !f.required || (credentials[f.name] || '').length > 0);
  return (
    <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {isOAuth
            ? <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
            : <KeyRound className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-medium truncate">{prettyLabel(scheme)}</span>
              {!available && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">
                  unavailable
                </span>
              )}
              {recommended && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wide">
                  recommended
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] truncate">
              {isOAuth
                ? 'Sign in with your account'
                : isNoAuth
                  ? 'No credentials required'
                  : `${fields.length} field${fields.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
        <button
          onClick={onClick}
          disabled={anyBusy || !available}
          className="px-3 py-1 rounded-[6px] text-[11px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
          title={!available ? unavailableReason : undefined}
        >
          {busy
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : !available
              ? 'Unavailable'
              : isOAuth
                ? 'Sign in'
                : isNoAuth
                  ? 'Connect'
                  : isExpanded ? 'Hide' : 'Use'}
        </button>
      </div>
      {!available && unavailableReason && (
        <div className="px-3 pb-2.5 -mt-1">
          <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-3 h-3 shrink-0 mt-px" />
            <span>{unavailableReason}</span>
          </div>
        </div>
      )}
      {isExpanded && !isOAuth && !isNoAuth && fields.length > 0 && (
        <div className="px-3 pb-3 pt-1 border-t border-black/[0.04] dark:border-white/[0.04] space-y-3">
          {fields.map((f) => (
            <CredentialField
              key={f.name}
              field={f}
              value={credentials[f.name] || ''}
              onChange={(v) => onChangeCredential(f.name, v)}
            />
          ))}
          <div className="flex items-center gap-2">
            <button
              onClick={onSubmit}
              disabled={anyBusy || !canSubmit}
              className="px-3 py-1.5 rounded-[8px] text-[11px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Connect
            </button>
            <button
              onClick={onCancel}
              disabled={anyBusy}
              className="px-3 py-1.5 rounded-[8px] text-[11px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CredentialField({
  field, value, onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  const isSecret = /key|secret|token|password|api/i.test(field.name);
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1">
        {field.displayName}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type={isSecret && !reveal ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={`w-full ${isSecret ? 'pr-9' : ''} px-2.5 py-1.5 rounded-[8px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-[12px] font-mono outline-none focus:border-[var(--color-accent)] transition-colors`}
          placeholder={`Enter ${field.displayName.toLowerCase()}`}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-1 rounded-[4px] text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            tabIndex={-1}
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {field.description && (
        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">{field.description}</p>
      )}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 text-[11px] text-red-500 bg-red-500/[0.08] border border-red-500/20 rounded-[8px] px-2.5 py-1.5">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-red-500/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Helpers ──

/** Composio sometimes returns auth_schemes as string[], sometimes as object[] with `.mode`. */
function normalize(raw: unknown): string[] {
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

function rank(scheme: string, managed: Set<string>): number {
  if ((scheme === 'OAUTH2' || scheme === 'OAUTH1') && managed.has(scheme)) return 0;
  if (scheme === 'API_KEY') return 1;
  if (scheme === 'BEARER_TOKEN') return 2;
  if (scheme === 'BASIC') return 3;
  if (scheme === 'NO_AUTH') return 4;
  if (scheme === 'OAUTH2' || scheme === 'OAUTH1') return 5; // unmanaged OAuth last
  return 6;
}

function prettyLabel(scheme: string): string {
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

function defaultFields(scheme: string): Field[] {
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

function prettify(slug: string, raw: string): string {
  const txt = raw || '';
  if (/DefaultAuthConfigNotFound|does not have managed credentials/i.test(txt)) {
    return `${slug} doesn't support one-click connect with this method. Try another sign-in option.`;
  }
  const match = txt.match(/"message":"([^"]+)"/);
  if (match) return match[1];
  return txt || `Failed to connect ${slug}`;
}
