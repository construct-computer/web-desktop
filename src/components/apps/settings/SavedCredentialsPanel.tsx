import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Globe, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import * as api from '@/services/api';
import { McpUrlAuthModal } from '../app-store/McpUrlAuthModal';
import { SettingsCard } from './SettingsPrimitives';

function formatConfiguredAt(ts?: number): string {
  if (!ts) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
}

export function SavedCredentialsPanel() {
  const [connections, setConnections] = useState<api.AppConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<api.AppConnection | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAppConnections();
      if (res.success) {
        setConnections((res.data.connections || []).filter((c) => c.status === 'active' || c.status === 'expired'));
      } else {
        setError(res.error || 'Could not load saved credentials.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load saved credentials.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleDelete = async (conn: api.AppConnection) => {
    if (!window.confirm(`Remove saved credentials for ${conn.appName}?`)) return;
    setPendingDelete(conn.id);
    setError(null);
    try {
      const res = conn.source === 'custom_mcp'
        ? await api.disconnectUrlApp(conn.appId)
        : await api.disconnectApp(conn.appId);
      if (!res.success) {
        setError(res.error || 'Could not remove credentials.');
      } else {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove credentials.');
    }
    setPendingDelete(null);
  };

  return (
    <>
      <div className="h-6" />
      <div className="flex items-center gap-2 mb-2 px-1">
        <KeyRound className="w-4 h-4 text-[var(--color-text-muted)]" />
        <span className="text-[13px] font-semibold">Saved credentials</span>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] mb-3 px-1 leading-snug">
        Read-only list of keys and tokens you have configured. Values are never shown after save.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <SettingsCard>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-[var(--color-text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading saved credentials…
          </div>
        ) : connections.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-[var(--color-text-muted)]">
            No saved credentials yet. Connect an app or MCP server from Apps.
          </div>
        ) : (
          connections.map((conn, index) => {
            const busy = pendingDelete === conn.id;
            const isLast = index === connections.length - 1;
            return (
              <div
                key={conn.id}
                className={`flex items-center gap-3 px-4 py-3 min-h-[52px] ${!isLast ? 'border-b border-black/[0.06] dark:border-white/[0.06]' : ''}`}
              >
                <div className="w-[28px] h-[28px] rounded-[6px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  {conn.source === 'custom_mcp' ? <Globe className="w-4 h-4 text-[var(--color-text-muted)]" /> : <KeyRound className="w-4 h-4 text-[var(--color-text-muted)]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium truncate">{conn.appName}</span>
                    <span className="text-[9px] font-semibold text-[var(--color-text-muted)] bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-px rounded-full uppercase tracking-wide">
                      {conn.authLabel || conn.activeScheme}
                    </span>
                    {conn.status === 'expired' && (
                      <span className="text-[9px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-px rounded-full uppercase tracking-wide">
                        Expired
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                    {conn.endpoint ? `${conn.endpoint} · ` : ''}
                    Set {formatConfiguredAt(conn.configuredAt || conn.connectedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {conn.source === 'custom_mcp' && conn.endpoint && (
                    <button
                      type="button"
                      onClick={() => setRotateTarget(conn)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 disabled:opacity-40 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Update
                    </button>
                  )}
                  {conn.source === 'registry_app' && (
                    <button
                      type="button"
                      onClick={() => {
                        void import('@/stores/windowStore').then(({ useWindowStore }) => {
                          useWindowStore.getState().openWindow('app-registry', {
                            title: 'Apps',
                            metadata: { search: conn.appName },
                          });
                        });
                      }}
                      disabled={busy}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 disabled:opacity-40 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {conn.authType === 'oauth2' ? 'Reconnect' : 'Update'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(conn)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </SettingsCard>

      {rotateTarget?.source === 'custom_mcp' && rotateTarget.endpoint && (
        <McpUrlAuthModal
          open={!!rotateTarget}
          onClose={() => setRotateTarget(null)}
          name={rotateTarget.appName}
          url={(() => {
            try { return new URL(rotateTarget.endpoint!).origin; } catch { return ''; }
          })()}
          mcpPath={(() => {
            try {
              const u = new URL(rotateTarget.endpoint!);
              return u.pathname || '/mcp';
            } catch {
              return '/mcp';
            }
          })()}
          appId={rotateTarget.appId}
          mode="rotate"
          onSuccess={() => {
            setRotateTarget(null);
            void refresh();
          }}
        />
      )}
    </>
  );
}
