/**
 * ComposioAuthPanel — multi-scheme auth UI for a Composio toolkit.
 */

import { useState } from 'react';
import {
  Loader2, Check, ExternalLink, KeyRound, ShieldAlert,
} from 'lucide-react';
import { useComposioAuth } from '@/hooks/useComposioAuth';
import { Badge } from './AppShared';
import { CredentialField, ComposioAuthErrorBanner } from './composioAuthFields';
import {
  getFieldsForScheme,
  prettyAuthSchemeLabel,
} from './composioAuthUtils';
import type { AuthField, AuthScheme } from './composioAuthUtils';

export interface ComposioAuthPanelProps {
  slug: string;
  onConnected?: () => void;
  className?: string;
  compact?: boolean;
}

export function ComposioAuthPanel({ slug, onConnected, className, compact = false }: ComposioAuthPanelProps) {
  const auth = useComposioAuth(slug, onConnected);
  const [expandedScheme, setExpandedScheme] = useState<AuthScheme | null>(null);

  const schemes = auth.schemes;
  const managed = auth.managed;
  const ordered = auth.orderedSchemes;
  const hasManagedOAuth = auth.hasManagedOAuth;

  const toggleExpand = (scheme: AuthScheme, fields: AuthField[]) => {
    if (expandedScheme === scheme) {
      setExpandedScheme(null);
      auth.resetCredentials();
      return;
    }
    const init: Record<string, string> = {};
    fields.forEach((f) => { init[f.name] = ''; });
    for (const [k, v] of Object.entries(init)) auth.setCredential(k, v);
    setExpandedScheme(scheme);
    auth.clearError();
  };

  if (auth.loading && !auth.detail) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading authentication options…
        </div>
      </div>
    );
  }

  if (!auth.detail) {
    return (
      <div className={className}>
        <ComposioAuthErrorBanner message={auth.error ?? 'Authentication info unavailable.'} onDismiss={auth.clearError} />
      </div>
    );
  }

  if (schemes.length === 0) {
    return (
      <div className={className}>
        <div className="text-[11px] text-amber-500/90 bg-amber-500/[0.08] border border-amber-500/20 rounded-[8px] px-3 py-2 flex items-start gap-2">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>This integration declares no supported auth schemes.</span>
        </div>
      </div>
    );
  }

  const useCompactLayout = compact && schemes.length <= 2;

  return (
    <div className={className}>
      {auth.error && <div className="mb-2"><ComposioAuthErrorBanner message={auth.error} onDismiss={auth.clearError} /></div>}
      {schemes.length > 1 && !useCompactLayout && (
        <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
          Choose how you&apos;d like to sign in.
        </p>
      )}
      <div className={useCompactLayout ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'space-y-2'}>
        {ordered.map((scheme) => {
          const isOAuth = scheme === 'OAUTH2' || scheme === 'OAUTH1';
          const isNoAuth = scheme === 'NO_AUTH';
          const fields = getFieldsForScheme(auth.detail, scheme);
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
              compact={useCompactLayout}
              isExpanded={expandedScheme === scheme}
              credentials={auth.credentials}
              busy={auth.busyScheme === scheme}
              anyBusy={auth.anyBusy}
              onClick={() => {
                if (!available) return;
                if (isOAuth) { void auth.startOAuth(scheme); return; }
                if (isNoAuth) { void auth.connectNoAuth(); return; }
                toggleExpand(scheme, fields);
              }}
              onChangeCredential={auth.setCredential}
              onSubmit={() => void auth.submitCredentials(scheme)}
              onCancel={() => { setExpandedScheme(null); auth.resetCredentials(); auth.clearError(); }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SchemeCard({
  scheme, isOAuth, isNoAuth, available, recommended, unavailableReason, fields,
  compact, isExpanded, credentials, busy, anyBusy,
  onClick, onChangeCredential, onSubmit, onCancel,
}: {
  scheme: string;
  isOAuth: boolean;
  isNoAuth: boolean;
  available: boolean;
  recommended: boolean;
  unavailableReason?: string;
  fields: AuthField[];
  compact?: boolean;
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
  const label = prettyAuthSchemeLabel(scheme);

  if (compact) {
    return (
      <div className="rounded-[10px] border border-black/[0.06] dark:border-white/[0.06] surface-card p-3 flex flex-col gap-2 h-full">
        <div className="flex items-start gap-2 min-w-0">
          {isOAuth
            ? <ExternalLink className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
            : <KeyRound className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[13px] font-semibold">{label}</span>
              {recommended && <Badge>Recommended</Badge>}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">
              {isOAuth
                ? 'Sign in with your account in a secure popup.'
                : isNoAuth
                  ? 'No credentials required.'
                  : `Enter your ${label.toLowerCase()} to connect.`}
            </p>
          </div>
        </div>
        {!available && unavailableReason && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
            <ShieldAlert className="w-3 h-3 shrink-0 mt-px" />
            {unavailableReason}
          </p>
        )}
        {isExpanded && !isOAuth && !isNoAuth && fields.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
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
                disabled={busy || !canSubmit}
                className="flex-1 px-3 py-1.5 rounded-[8px] text-[11px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Save & connect'}
              </button>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {(!isExpanded || isOAuth || isNoAuth) && (
          <button
            onClick={onClick}
            disabled={anyBusy || !available}
            className="mt-auto w-full px-3 py-2 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {busy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
              : !available
                ? 'Unavailable'
                : isOAuth
                  ? 'Sign in with OAuth'
                  : isNoAuth
                    ? 'Connect'
                    : isExpanded ? 'Hide form' : 'Enter credentials'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.06] surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {isOAuth
            ? <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
            : <KeyRound className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-medium truncate">{label}</span>
              {!available && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">
                  unavailable
                </span>
              )}
              {recommended && <Badge>Recommended</Badge>}
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

// Re-export for backward compatibility
export { prettyAuthSchemeLabel as prettyLabel } from './composioAuthUtils';
