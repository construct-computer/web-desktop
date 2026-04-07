import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, RefreshCw, ShieldCheck, ShieldAlert, UserPlus,
  Check, X, Clock, Trash2, AlertCircle, Users, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input, Label } from '@/components/ui';
import { useComputerStore } from '@/stores/agentStore';
import {
  getTrustedUsers, addTrustedUser, removeTrustedUser,
  getApprovalQueue, approveRequest, denyRequest,
  type TrustedUser, type ApprovalRequest,
} from '@/services/slack-permissions';
import type { WindowConfig } from '@/types';

// ── Helpers ──

function formatTime(ts: number): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMs / 3600000);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

const STATUS_ICON = {
  pending: Clock,
  approved: Check,
  denied: X,
  expired: Clock,
} as const;

const STATUS_COLOR = {
  pending: 'text-amber-500',
  approved: 'text-green-500',
  denied: 'text-red-500',
  expired: 'text-[var(--color-text-muted)]',
} as const;

// ── Main Component ──

type Tab = 'queue' | 'trusted';

export function SlackPermissionsWindow({ config: _config }: { config: WindowConfig }) {
  const [tab, setTab] = useState<Tab>('queue');
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [trusted, setTrusted] = useState<TrustedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingApprovalCount = useComputerStore((s) => s.pendingApprovalCount);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, t] = await Promise.all([getApprovalQueue(), getTrustedUsers()]);
      setQueue(q);
      setTrusted(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh when new approval requests arrive
  useEffect(() => {
    if (pendingApprovalCount > 0) refresh();
  }, [pendingApprovalCount, refresh]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        <Shield className="w-4 h-4 text-[var(--color-text-muted)]" />
        <span className="text-xs font-medium">Slack Permissions</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        <button
          className={cn(
            'flex-1 px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'queue'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          )}
          onClick={() => setTab('queue')}
        >
          <div className="flex items-center justify-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            Approval Queue
            {queue.filter(r => r.status === 'pending').length > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full
                              bg-red-500 text-white text-[9px] font-bold leading-none">
                {queue.filter(r => r.status === 'pending').length}
              </span>
            )}
          </div>
        </button>
        <button
          className={cn(
            'flex-1 px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'trusted'
              ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          )}
          onClick={() => setTab('trusted')}
        >
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Trusted Users ({trusted.length})
          </div>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && queue.length === 0 && trusted.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : tab === 'queue' ? (
          <ApprovalQueueTab queue={queue} onRefresh={refresh} />
        ) : (
          <TrustedUsersTab trusted={trusted} onRefresh={refresh} />
        )}
      </div>
    </div>
  );
}

// ── Approval Queue Tab ──

function ApprovalQueueTab({ queue, onRefresh }: { queue: ApprovalRequest[]; onRefresh: () => void }) {
  const [acting, setActing] = useState<string | null>(null);

  const handleAction = async (id: string, action: 'approve' | 'deny') => {
    setActing(id);
    try {
      if (action === 'approve') await approveRequest(id);
      else await denyRequest(id);
      onRefresh();
    } catch { /* toast error? */ }
    finally { setActing(null); }
  };

  const pending = queue.filter(r => r.status === 'pending');
  const resolved = queue.filter(r => r.status !== 'pending');

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-text-muted)]">
        <ShieldCheck className="w-10 h-10 opacity-40" />
        <p className="text-sm">No permission requests</p>
        <p className="text-xs opacity-60">Requests from Slack guests will appear here</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      {pending.length > 0 && (
        <>
          <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Pending ({pending.length})
          </div>
          {pending.map(req => (
            <ApprovalCard key={req.id} req={req} acting={acting === req.id}
              onApprove={() => handleAction(req.id, 'approve')}
              onDeny={() => handleAction(req.id, 'deny')} />
          ))}
        </>
      )}
      {resolved.length > 0 && (
        <>
          <div className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            History
          </div>
          {resolved.slice(0, 20).map(req => (
            <ApprovalCard key={req.id} req={req} acting={false} />
          ))}
        </>
      )}
    </div>
  );
}

function ApprovalCard({ req, acting, onApprove, onDeny }: {
  req: ApprovalRequest;
  acting: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
}) {
  const isPending = req.status === 'pending';
  const StatusIcon = STATUS_ICON[req.status];

  return (
    <div className={cn(
      'rounded-lg border p-2.5 text-xs',
      isPending
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-[var(--color-surface)] border-[var(--color-border)] opacity-70',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{req.displayName || req.slackUsername || req.slackUserId}</span>
            {req.slackUsername && (
              <span className="text-[var(--color-text-muted)]">@{req.slackUsername}</span>
            )}
            <span className="text-[var(--color-text-muted)]">in #{req.channelName || req.channelId}</span>
          </div>
          <p className="mt-1 text-[var(--color-text)]">{req.description}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[10px] font-mono">
              {req.toolName}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">{formatTime(req.requestedAt)}</span>
            {!isPending && (
              <span className={cn('flex items-center gap-0.5 text-[10px]', STATUS_COLOR[req.status])}>
                <StatusIcon className="w-3 h-3" />
                {req.status}
                {req.resolvedAt && <span className="text-[var(--color-text-muted)]"> {formatTime(req.resolvedAt)}</span>}
              </span>
            )}
          </div>
        </div>
        {isPending && onApprove && onDeny && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onDeny} disabled={acting}
              className="text-[10px] h-7 px-2 hover:bg-red-500/10 hover:text-red-500">
              <X className="w-3.5 h-3.5 mr-0.5" />Deny
            </Button>
            <Button variant="primary" size="sm" onClick={onApprove} disabled={acting}
              className="text-[10px] h-7 px-2">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-0.5" /> : <Check className="w-3.5 h-3.5 mr-0.5" />}
              Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Trusted Users Tab ──

function TrustedUsersTab({ trusted, onRefresh }: { trusted: TrustedUser[]; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [slackUserId, setSlackUserId] = useState('');
  const [slackUsername, setSlackUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!slackUserId.trim()) return;
    setSaving(true);
    try {
      await addTrustedUser({
        slackUserId: slackUserId.trim(),
        slackUsername: slackUsername.trim() || undefined,
        displayName: displayName.trim() || undefined,
      });
      setSlackUserId('');
      setSlackUsername('');
      setDisplayName('');
      setAdding(false);
      onRefresh();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleRemove = async (uid: string) => {
    setRemoving(uid);
    try {
      await removeTrustedUser(uid);
      onRefresh();
    } catch { /* ignore */ }
    finally { setRemoving(null); }
  };

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Trusted Users
        </span>
        <Button variant="ghost" size="sm" onClick={() => setAdding(!adding)} className="text-[10px] h-6">
          <UserPlus className="w-3 h-3 mr-1" />{adding ? 'Cancel' : 'Add User'}
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border border-[var(--color-border)] p-2.5 space-y-2">
          <div>
            <Label className="text-[10px]">Slack User ID *</Label>
            <Input value={slackUserId} onChange={e => setSlackUserId(e.target.value)}
              placeholder="U0123456ABC" className="mt-0.5 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Username</Label>
            <Input value={slackUsername} onChange={e => setSlackUsername(e.target.value)}
              placeholder="johndoe (optional)" className="mt-0.5 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Display Name</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="John Doe (optional)" className="mt-0.5 text-xs" />
          </div>
          <Button variant="primary" size="sm" onClick={handleAdd}
            disabled={saving || !slackUserId.trim()} className="text-[10px] w-full">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <UserPlus className="w-3.5 h-3.5 mr-1" />}
            Add Trusted User
          </Button>
        </div>
      )}

      {trusted.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-[var(--color-text-muted)]">
          <Users className="w-8 h-8 opacity-40" />
          <p className="text-xs">No trusted users</p>
          <p className="text-[10px] opacity-60">Trusted users can use all agent tools from Slack</p>
        </div>
      ) : (
        <div className="space-y-1">
          {trusted.map(u => (
            <div key={u.slackUserId}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--color-border)]">
              <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  {u.displayName || u.slackUsername || u.slackUserId}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  {u.slackUsername ? `@${u.slackUsername} · ` : ''}{u.slackUserId}
                  {u.grantedAt ? ` · added ${formatTime(u.grantedAt)}` : ''}
                </div>
              </div>
              <Button variant="ghost" size="icon-sm"
                onClick={() => handleRemove(u.slackUserId)}
                disabled={removing === u.slackUserId}
                className="hover:bg-red-500/10 hover:text-red-500">
                {removing === u.slackUserId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
