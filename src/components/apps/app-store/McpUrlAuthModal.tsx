import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useDelayUnmount } from '@/hooks/useDelayUnmount';
import { cn } from '@/lib/utils';
import * as api from '@/services/api';
import { CredentialField } from '../composioAuthFields';

type Scheme = api.UrlAppAuthScheme;

const SCHEMES: Array<{ type: Scheme; label: string; fields: Array<{ name: string; displayName: string; type: 'text' | 'password'; required: boolean }> }> = [
  {
    type: 'bearer',
    label: 'Bearer Token',
    fields: [{ name: 'token', displayName: 'Bearer Token', type: 'password', required: true }],
  },
  {
    type: 'api_key',
    label: 'API Key',
    fields: [{ name: 'api_key', displayName: 'API Key', type: 'password', required: true }],
  },
  {
    type: 'basic',
    label: 'Username & Password',
    fields: [
      { name: 'username', displayName: 'Username', type: 'text', required: true },
      { name: 'password', displayName: 'Password', type: 'password', required: true },
    ],
  },
];

export function McpUrlAuthModal({
  open,
  onClose,
  name,
  url,
  mcpPath,
  appId,
  isMobile,
  mode = 'connect',
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  url: string;
  mcpPath: string;
  appId?: string;
  isMobile?: boolean;
  mode?: 'connect' | 'rotate';
  onSuccess?: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [scheme, setScheme] = useState<Scheme>('bearer');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeScheme = useMemo(() => SCHEMES.find((s) => s.type === scheme) ?? SCHEMES[0], [scheme]);
  const canSubmit = activeScheme.fields.every((f) => !f.required || (credentials[f.name] || '').length > 0);

  const { shouldRender, isClosing } = useDelayUnmount(open, 250);

  const resetForm = useCallback(() => {
    setCredentials({});
    setError(null);
    setScheme('bearer');
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy]);

  const handleSchemeChange = (next: Scheme) => {
    setScheme(next);
    setCredentials({});
    setError(null);
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.connectUrlApp({
        url: url.trim(),
        mcp_path: mcpPath.trim() || '/mcp',
        scheme,
        fields: credentials,
        app_id: appId,
      });
      if (!res.success) {
        setError(res.error || 'Could not save credentials.');
        setBusy(false);
        return;
      }
      if (!res.data.connected || !res.data.probeOk) {
        setError(res.data.error || 'Invalid credentials. Check your token and try again.');
        setBusy(false);
        return;
      }
      resetForm();
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save credentials.');
    }
    setBusy(false);
  };

  if (!shouldRender) return null;

  const title = mode === 'rotate' ? `Update ${name}` : `Connect ${name}`;

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
      aria-labelledby="mcp-url-auth-title"
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
            <h2 id="mcp-url-auth-title" className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Your credentials are encrypted and only used for requests to this MCP server.
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

        <div className="flex gap-1.5 px-4 pt-3 flex-wrap">
          {SCHEMES.map((s) => (
            <button
              key={s.type}
              type="button"
              onClick={() => handleSchemeChange(s.type)}
              disabled={busy}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                scheme === s.type
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-black/[0.06] dark:bg-white/[0.08] text-[var(--color-text-muted)] hover:bg-black/[0.1] dark:hover:bg-white/[0.12]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
          {activeScheme.fields.map((field, index) => (
            <CredentialField
              key={field.name}
              field={field}
              value={credentials[field.name] || ''}
              onChange={(v) => setCredentials((prev) => ({ ...prev, [field.name]: v }))}
              inputRef={index === 0 ? firstInputRef : undefined}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] surface-toolbar">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={busy || !canSubmit}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            {mode === 'rotate' ? 'Update credentials' : 'Connect'}
          </Button>
        </div>
      </div>
    </div>
  );
}
