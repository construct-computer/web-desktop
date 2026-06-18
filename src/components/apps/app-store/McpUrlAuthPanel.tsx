import { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, RefreshCw, Unplug } from 'lucide-react';
import * as api from '@/services/api';

export function McpUrlAuthPanel({
  appId,
  url,
  mcpPath,
  displayName,
  onUpdateClick,
  onStatusChange,
}: {
  appId: string;
  url: string;
  mcpPath: string;
  displayName: string;
  onUpdateClick: () => void;
  onStatusChange?: (connected: boolean) => void;
}) {
  const [status, setStatus] = useState<api.UrlAppConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUrlAppConnection(appId);
      if (res.success) {
        setStatus(res.data);
        onStatusChange?.(res.data.connected);
      } else {
        setStatus(null);
        setError(res.error || 'Could not load authentication status.');
      }
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : 'Could not load authentication status.');
    }
    setLoading(false);
  }, [appId, onStatusChange]);

  useEffect(() => { void refresh(); }, [refresh]);

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.disconnectUrlApp(appId);
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

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] py-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading authentication…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <KeyRound className="w-4 h-4 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {status?.connected ? (
            <>
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                {status.authLabel || 'Connected'}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Set {formatDate(status.connectedAt || status.updatedAt)}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              This MCP server requires authentication. Add credentials so Construct can use its actions.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onUpdateClick}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <RefreshCw className="w-3 h-3" />
          {status?.connected ? 'Update credentials' : 'Add credentials'}
        </button>
        {status?.connected && (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
