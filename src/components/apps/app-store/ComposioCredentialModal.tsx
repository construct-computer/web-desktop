import { useEffect, useMemo, useRef } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useDelayUnmount } from '@/hooks/useDelayUnmount';
import type { ComposioAuthHandle } from '@/hooks/useComposioConnectFlow';
import { cn } from '@/lib/utils';
import { CredentialField } from '../composioAuthFields';
import { getFieldsForScheme, prettyAuthSchemeLabel } from '../composioAuthUtils';
import type { AuthScheme } from '../composioAuthUtils';

export function ComposioCredentialModal({
  open,
  onClose,
  name,
  scheme,
  isMobile,
  auth,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  scheme: AuthScheme;
  isMobile: boolean;
  auth: ComposioAuthHandle;
  onSubmit: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const fields = useMemo(() => getFieldsForScheme(auth.detail, scheme), [auth.detail, scheme]);
  const canSubmit = fields.every((f) => !f.required || (auth.credentials[f.name] || '').length > 0);
  const busy = auth.busyScheme === scheme;

  const { shouldRender, isClosing } = useDelayUnmount(open, 250);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (!shouldRender) return null;

  const schemeLabel = prettyAuthSchemeLabel(scheme).toLowerCase();

  return (
    <div
      ref={overlayRef}
      className={cn(
        'absolute inset-0 z-50 flex items-end sm:items-center justify-center contained-scrim rounded-b-xl p-2 sm:p-4',
        isClosing && 'closing',
      )}
      onClick={(e) => { if (e.target === overlayRef.current && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="composio-credential-title"
    >
      <div
        className={cn(
          'soft-popover border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-window)]',
          'w-full flex flex-col overflow-hidden',
          isClosing && 'closing',
          isMobile ? 'max-h-[94%]' : 'max-w-[480px] max-h-[92%]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] surface-toolbar select-none">
          <div className="min-w-0">
            <h2 id="composio-credential-title" className="text-base font-semibold">
              Connect {name}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Enter your {schemeLabel} to connect.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="shrink-0 hover:bg-[var(--color-error)] hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
          {fields.map((field, index) => (
            <CredentialField
              key={field.name}
              field={field}
              value={auth.credentials[field.name] || ''}
              onChange={(v) => auth.setCredential(field.name, v)}
              inputRef={index === 0 ? firstInputRef : undefined}
            />
          ))}
        </div>

        {auth.error && (
          <div className="flex items-start gap-2 mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{auth.error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] surface-toolbar">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSubmit}
            disabled={busy || !canSubmit}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Connect
          </Button>
        </div>
      </div>
    </div>
  );
}
