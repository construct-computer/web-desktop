/**
 * AuthSchemesPanel — renders the authentication UI for a registry app.
 *
 * One component, two modes:
 *   preview  — read-only summary of what auth the app needs, for pre-install.
 *   connect  — fully interactive: OAuth popup, credential form, disconnect.
 *
 * Fetches status from GET /api/apps/connect/:appId on mount (and on refresh).
 * Safe to mount pre-install — the endpoint reads from the registry manifest
 * regardless of install state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Check, AlertCircle, Info, ExternalLink,
  KeyRound, ShieldAlert, X,
} from 'lucide-react';
import * as api from '@/services/api';

type Mode = 'preview' | 'connect';

export interface AuthSchemesPanelProps {
  appId: string;
  mode: Mode;
  /** Called whenever connection status changes (mount, connect, disconnect). */
  onStatusChange?: (status: api.AppConnectionStatus | null) => void;
  className?: string;
}

export function AuthSchemesPanel({ appId, mode, onStatusChange, className }: AuthSchemesPanelProps) {
  const [status, setStatus] = useState<api.AppConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedScheme, setExpandedScheme] = useState<api.AppAuthScheme | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const popupTimerRef = useRef<number | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAppConnection(appId);
      if (res.success) {
        setStatus(res.data);
        onStatusChangeRef.current?.(res.data);
      } else {
        setStatus(null);
        setError(res.error || 'Could not load authentication info.');
      }
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : 'Could not load authentication info.');
    }
    setLoading(false);
  }, [appId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Cleanup any lingering popup watcher on unmount.
  useEffect(() => () => {
    if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
  }, []);

  const clearExpanded = () => { setExpandedScheme(null); setCredentials({}); };

  const startOAuth = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.connectApp(appId, 'oauth2');
      if (!res.success) {
        setError(res.error || 'Could not start OAuth flow.');
        setBusy(false);
        return;
      }
      const { authorizationUrl } = res.data;
      if (!authorizationUrl) {
        setError('OAuth is not available for this app right now.');
        setBusy(false);
        return;
      }
      const width = 520;
      const height = 640;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        authorizationUrl,
        'app-oauth',
        `width=${width},height=${height},left=${left},top=${top},popup=1`,
      );
      if (!popup) {
        setError('Your browser blocked the OAuth popup. Allow popups for this site and try again.');
        setBusy(false);
        return;
      }
      if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
      popupTimerRef.current = window.setInterval(async () => {
        if (popup.closed) {
          if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
          popupTimerRef.current = null;
          await refresh();
          setBusy(false);
        }
      }, 800) as unknown as number;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth flow failed.');
      setBusy(false);
    }
  };

  const toggleScheme = (scheme: api.AppConnectionScheme) => {
    if (!scheme.available) {
      setError(explainUnavailable(scheme));
      return;
    }
    setError(null);

    if (scheme.type === 'oauth2') {
      startOAuth();
      return;
    }

    if (expandedScheme === scheme.type) {
      clearExpanded();
      return;
    }

    const init: Record<string, string> = {};
    (scheme.fields ?? []).forEach((f) => { init[f.name] = ''; });
    setCredentials(init);
    setExpandedScheme(scheme.type);
  };

  const submitCredentials = async () => {
    if (!expandedScheme) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.connectApp(appId, expandedScheme, credentials);
      if (!res.success) {
        setError(res.error || 'Could not save credentials.');
      } else {
        clearExpanded();
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save credentials.');
    }
    setBusy(false);
  };

  const disconnect = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.disconnectApp(appId);
      if (!res.success) {
        setError(res.error || 'Could not disconnect.');
      } else {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect.');
    }
    setBusy(false);
  };

  if (loading && !status) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking authentication…
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={className}>
        <ErrorBanner message={error ?? 'Authentication info unavailable.'} onDismiss={() => setError(null)} />
      </div>
    );
  }

  const schemes = status.schemes ?? [];

  if (schemes.length === 0) {
    return (
      <div className={className}>
        <div className="text-[11px] text-amber-500/90 bg-amber-500/[0.08] border border-amber-500/20 rounded-[8px] px-3 py-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>This app declares authentication but no supported schemes. Ask the app author to publish a fix.</span>
        </div>
      </div>
    );
  }

  // Connected (both preview+connect show this; in preview we hide the disconnect button)
  if (status.connected) {
    return (
      <div className={className}>
        <div className="rounded-[10px] border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Connected</div>
              <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                via {prettySchemeName(status.activeScheme || status.authType)}
                {status.connectedAt ? ` · ${formatConnectedAt(status.connectedAt)}` : ''}
              </div>
            </div>
          </div>
          {mode === 'connect' && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="px-2.5 py-1 rounded-[6px] text-[11px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors shrink-0"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Disconnect'}
            </button>
          )}
        </div>
        {error && <div className="mt-2"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      </div>
    );
  }

  // Preview mode: read-only scheme summary.
  if (mode === 'preview') {
    return (
      <div className={className}>
        <div className="space-y-1.5">
          {schemes.map((scheme) => (
            <PreviewSchemeRow key={scheme.type} scheme={scheme} />
          ))}
        </div>
        <p className="mt-2.5 text-[10px] text-[var(--color-text-muted)] flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-px shrink-0" />
          Install this app to sign in.
        </p>
      </div>
    );
  }

  // Connect mode, not connected.
  return (
    <div className={className}>
      {error && <div className="mb-2"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {schemes.length > 1 && (
        <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
          Choose how you'd like to sign in.
        </p>
      )}
      <div className="space-y-2">
        {schemes.map((scheme) => (
          <SchemeCard
            key={scheme.type}
            scheme={scheme}
            isExpanded={expandedScheme === scheme.type}
            credentials={credentials}
            onChangeCredential={(name, value) => setCredentials((prev) => ({ ...prev, [name]: value }))}
            onToggle={() => toggleScheme(scheme)}
            onSubmit={submitCredentials}
            onCancel={() => { clearExpanded(); setError(null); }}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}

// ── Subcomponents ──

function SchemeCard({
  scheme,
  isExpanded,
  credentials,
  onChangeCredential,
  onToggle,
  onSubmit,
  onCancel,
  busy,
}: {
  scheme: api.AppConnectionScheme;
  isExpanded: boolean;
  credentials: Record<string, string>;
  onChangeCredential: (name: string, value: string) => void;
  onToggle: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const isOAuth = scheme.type === 'oauth2';
  const canSubmit = (scheme.fields ?? []).every((f) => !f.required || (credentials[f.name] || '').length > 0);

  return (
    <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <SchemeIcon scheme={scheme} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-medium truncate">{scheme.label}</span>
              {!scheme.available && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">
                  unavailable
                </span>
              )}
              {scheme.type === 'oauth2' && scheme.available && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wide">
                  recommended
                </span>
              )}
            </div>
            <SchemeSubtitle scheme={scheme} />
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={busy || !scheme.available}
          className="px-3 py-1 rounded-[6px] text-[11px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
          title={!scheme.available ? 'This method is unavailable — see details' : undefined}
        >
          {busy && isOAuth
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : !scheme.available
              ? 'Unavailable'
              : isOAuth
                ? 'Sign in'
                : isExpanded ? 'Hide' : 'Use'}
        </button>
      </div>
      {!scheme.available && scheme.unavailableReason && (
        <div className="px-3 pb-2.5 -mt-1">
          <UnavailableHint reason={scheme.unavailableReason} />
        </div>
      )}
      {isExpanded && !isOAuth && scheme.fields && scheme.fields.length > 0 && (
        <div className="px-3 pb-3 pt-1 border-t border-black/[0.04] dark:border-white/[0.04] space-y-3">
          {scheme.instructions && (
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              <InstructionsWithLinks text={scheme.instructions} />
            </p>
          )}
          {scheme.fields.map((field) => (
            <CredentialField
              key={field.name}
              field={field}
              value={credentials[field.name] || ''}
              onChange={(v) => onChangeCredential(field.name, v)}
            />
          ))}
          <div className="flex items-center gap-2">
            <button
              onClick={onSubmit}
              disabled={busy || !canSubmit}
              className="px-3 py-1.5 rounded-[8px] text-[11px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Connect
            </button>
            <button
              onClick={onCancel}
              disabled={busy}
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
  field,
  value,
  onChange,
}: {
  field: api.AppConnectionField;
  value: string;
  onChange: (v: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  const isPassword = field.type === 'password';
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1">
        {field.displayName}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type={isPassword && !reveal ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={`w-full ${isPassword ? 'pr-9' : ''} px-2.5 py-1.5 rounded-[8px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-[12px] font-mono outline-none focus:border-[var(--color-accent)] transition-colors`}
          placeholder={field.placeholder || `Enter ${field.displayName.toLowerCase()}`}
        />
        {isPassword && (
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

function PreviewSchemeRow({ scheme }: { scheme: api.AppConnectionScheme }) {
  const scopes = scheme.type === 'oauth2' ? (scheme.scopes ?? []) : [];
  return (
    <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <SchemeIcon scheme={scheme} />
        <span className="text-[12px] font-medium truncate">{scheme.label}</span>
        {!scheme.available && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">
            unavailable
          </span>
        )}
      </div>
      <div className="mt-1 ml-6">
        <SchemeSubtitle scheme={scheme} />
        {scopes.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {scopes.map((s) => (
              <span
                key={s}
                className="text-[9px] font-mono px-1.5 py-px rounded-[4px] bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)]"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        {scheme.unavailableReason && (
          <div className="mt-1.5">
            <UnavailableHint reason={scheme.unavailableReason} />
          </div>
        )}
      </div>
    </div>
  );
}

function SchemeIcon({ scheme }: { scheme: api.AppConnectionScheme }) {
  if (scheme.type === 'oauth2') {
    return <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />;
  }
  return <KeyRound className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />;
}

function SchemeSubtitle({ scheme }: { scheme: api.AppConnectionScheme }) {
  if (scheme.type === 'oauth2') {
    const scopeCount = scheme.scopes?.length ?? 0;
    return (
      <div className="text-[10px] text-[var(--color-text-muted)] truncate">
        Sign in with your account{scopeCount > 0 ? ` · ${scopeCount} scope${scopeCount === 1 ? '' : 's'}` : ''}
      </div>
    );
  }
  const fieldCount = scheme.fields?.length ?? 0;
  const label =
    scheme.type === 'api_key' ? 'API key'
    : scheme.type === 'bearer' ? 'Bearer token'
    : scheme.type === 'basic' ? 'Username & password'
    : 'Credentials';
  return (
    <div className="text-[10px] text-[var(--color-text-muted)] truncate">
      {label}
      {fieldCount > 0 ? ` · ${fieldCount} field${fieldCount === 1 ? '' : 's'}` : ''}
    </div>
  );
}

function UnavailableHint({ reason }: { reason: string }) {
  if (reason === 'oauth_not_configured') {
    return (
      <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
        <ShieldAlert className="w-3 h-3 shrink-0 mt-px" />
        <span>
          OAuth client credentials aren't registered on this Construct instance.
          Use another method, or ask your admin to set <code className="font-mono">APP_OAUTH_*</code> secrets.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
      <ShieldAlert className="w-3 h-3 shrink-0 mt-px" />
      <span>{reason}</span>
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

/**
 * Renders instruction text, auto-linking http(s) URLs as clickable external links.
 */
function InstructionsWithLinks({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[var(--color-accent)] hover:underline underline-offset-2"
            >
              {part}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Helpers ──

function explainUnavailable(scheme: api.AppConnectionScheme): string {
  if (scheme.unavailableReason === 'oauth_not_configured') {
    return 'OAuth isn\'t configured on this Construct instance. Use another sign-in method, or ask your admin to register OAuth client credentials.';
  }
  return scheme.unavailableReason || 'This authentication method is unavailable.';
}

function prettySchemeName(scheme?: string): string {
  if (!scheme) return 'unknown';
  const s = scheme.toLowerCase();
  if (s === 'oauth2' || s === 'oauth') return 'OAuth';
  if (s === 'api_key') return 'API key';
  if (s === 'bearer') return 'bearer token';
  if (s === 'basic') return 'basic auth';
  return scheme;
}

function formatConnectedAt(timestamp: number): string {
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
}
