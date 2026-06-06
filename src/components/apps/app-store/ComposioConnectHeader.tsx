import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ComposioAuthHandle } from '@/hooks/useComposioConnectFlow';
import { ComposioAuthErrorBanner } from '../composioAuthFields';
import {
  isCredentialScheme,
  isOAuthScheme,
  prettyAuthSchemeLabel,
} from '../composioAuthUtils';
import type { AuthScheme } from '../composioAuthUtils';

const primaryBtn = 'px-5 py-1.5 rounded-[8px] text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50 inline-flex items-center gap-2';
const secondaryBtn = 'px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50';

export function ComposioConnectHeader({
  auth,
  onOpenCredential,
}: {
  auth: ComposioAuthHandle;
  onOpenCredential: (scheme: AuthScheme) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const primaryOAuth = auth.managedOAuth[0] ?? auth.orderedSchemes.find((s) => isOAuthScheme(s) && auth.managed.has(s));
  const altSchemes = useMemo(() => {
    const used = new Set<string>();
    if (primaryOAuth) used.add(primaryOAuth);
    return auth.orderedSchemes.filter((s) => {
      if (used.has(s)) return false;
      if (s === 'NO_AUTH') return true;
      if (isOAuthScheme(s)) return auth.managed.has(s);
      return isCredentialScheme(s);
    });
  }, [auth.orderedSchemes, auth.managed, primaryOAuth]);

  const openCredentialModal = (scheme: AuthScheme) => {
    onOpenCredential(scheme);
    setMenuOpen(false);
  };

  if (auth.loading && !auth.detail) {
    return (
      <button disabled className={primaryBtn}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sign in
      </button>
    );
  }

  if (!auth.detail || auth.schemes.length === 0) {
    return auth.error ? (
      <div className="max-w-xs">
        <ComposioAuthErrorBanner message={auth.error} onDismiss={auth.clearError} />
      </div>
    ) : null;
  }

  const onlyCredential = !primaryOAuth && auth.credentialSchemes.length === 1 && auth.schemes.length === 1;
  const onlyNoAuth = auth.schemes.length === 1 && auth.schemes[0] === 'NO_AUTH';

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {onlyNoAuth ? (
          <button
            type="button"
            disabled={auth.anyBusy}
            onClick={() => void auth.connectNoAuth()}
            className={primaryBtn}
          >
            {auth.busyScheme === 'NO_AUTH' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect'}
          </button>
        ) : onlyCredential ? (
          <button
            type="button"
            disabled={auth.anyBusy}
            onClick={() => openCredentialModal(auth.credentialSchemes[0])}
            className={primaryBtn}
          >
            Connect
          </button>
        ) : primaryOAuth ? (
          <>
            <button
              type="button"
              disabled={auth.anyBusy}
              onClick={() => void auth.startOAuth(primaryOAuth)}
              className={primaryBtn}
            >
              {auth.busyScheme === primaryOAuth
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : auth.credentialSchemes.length > 0 ? 'Sign in with OAuth' : 'Sign in'}
            </button>
            {auth.credentialSchemes.length === 1 && auth.schemes.length <= 2 ? (
              <button
                type="button"
                disabled={auth.anyBusy}
                onClick={() => openCredentialModal(auth.credentialSchemes[0])}
                className={secondaryBtn}
              >
                Use API key
              </button>
            ) : altSchemes.length > 0 ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  disabled={auth.anyBusy}
                  onClick={() => setMenuOpen((o) => !o)}
                  className={secondaryBtn}
                >
                  Other methods <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-[8px] border border-[var(--color-border)] soft-popover shadow-lg py-1">
                      {altSchemes.map((scheme) => (
                        <button
                          key={scheme}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                          onClick={() => {
                            if (scheme === 'NO_AUTH') void auth.connectNoAuth();
                            else if (isOAuthScheme(scheme)) void auth.startOAuth(scheme);
                            else openCredentialModal(scheme);
                          }}
                        >
                          {prettyAuthSchemeLabel(scheme)}
                        </button>
                      ))}
                    </div>
                )}
              </div>
            ) : null}
          </>
        ) : auth.credentialSchemes[0] ? (
          <button
            type="button"
            disabled={auth.anyBusy}
            onClick={() => openCredentialModal(auth.credentialSchemes[0])}
            className={primaryBtn}
          >
            Connect
          </button>
        ) : null}
      </div>
      {auth.error && (
        <ComposioAuthErrorBanner message={auth.error} onDismiss={auth.clearError} />
      )}
    </div>
  );
}
