import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Shield, Check, X, UserPlus, Trash2,
  MessageSquare, Mail, Hash, Loader2,
  Link2, Plus,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import {
  getApprovalQueue, approveRequest, denyRequest,
  getAccessList, addAccessEntry, updateAccessEntry, removeAccessEntry,
  getAccessSettings, setAccessSetting,
  getWorkspaceBindings, createWorkspaceBinding, deleteWorkspaceBinding,
  generateTelegramBindCode,
  type ApprovalQueueEntry, type AccessListEntry, type WorkspaceBinding,
  type PlatformSettings,
} from '@/services/access-control';
import {
  addAutopilotPolicyRule,
  deleteAutopilotPolicyRule,
  getAutopilotPolicy,
  type AutopilotPolicy,
  type AutonomyPolicyDecision,
  type AutonomyRiskKind,
  type AutonomyRiskLevel,
} from '@/services/api';
import { useComputerStore } from '@/stores/agentStore';
import { FreshnessText, RefreshButton, Select, StatusBanner } from '@/components/ui';
import { useFreshness } from '@/hooks/useFreshness';
import { PanelError } from './AppShared';

type Tab = 'queue' | 'list' | 'settings';

// Platform badge colors
const platformColors: Record<string, string> = {
  slack: 'bg-purple-500/20 text-purple-400',
  telegram: 'bg-blue-500/20 text-blue-400',
  email: 'bg-green-500/20 text-green-400',
  agent: 'bg-cyan-500/20 text-cyan-300',
};
const platformIcons: Record<string, typeof MessageSquare> = {
  slack: Hash,
  telegram: MessageSquare,
  email: Mail,
  agent: Bot,
};

function PlatformBadge({ platform }: { platform: string }) {
  const Icon = platformIcons[platform] || MessageSquare;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${platformColors[platform] || 'bg-gray-500/20 text-gray-400'}`}>
      <Icon size={10} />
      {platform}
    </span>
  );
}

function formatTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function AccessControlWindow(props: { config: WindowConfig }) {
  void props;
  const [tab, setTab] = useState<Tab>('queue');
  const [queue, setQueue] = useState<ApprovalQueueEntry[]>([]);
  const [accessList, setAccessList] = useState<AccessListEntry[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>({});
  const [bindings, setBindings] = useState<WorkspaceBinding[]>([]);
  const [autopilotPolicy, setAutopilotPolicy] = useState<AutopilotPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pendingApprovalCount = useComputerStore(s => s.pendingApprovalCount);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [q, l, s, b] = await Promise.all([
        getApprovalQueue(),
        getAccessList(),
        getAccessSettings(),
        getWorkspaceBindings(),
      ]);
      const p = await getAutopilotPolicy();
      setQueue(q);
      // Sync pendingApprovalCount with actual pending count
      const actualPending = q.filter((r: ApprovalQueueEntry) => r.status === 'pending').length;
      useComputerStore.setState({ pendingApprovalCount: actualPending });
      setAccessList(l);
      setSettings(s);
      setBindings(b);
      if (p.success) setAutopilotPolicy(p.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const freshness = useFreshness(() => refresh({ silent: true }), {
    intervalMs: 15_000,
    staleMs: 35_000,
    refreshOnFocus: true,
    refreshOnOnline: true,
  });
  const { refreshNow } = freshness;

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (pendingApprovalCount > 0) void refreshNow(); }, [pendingApprovalCount, refreshNow]);

  const pendingCount = queue.filter(r => r.status === 'pending').length;

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        <Shield size={16} className="text-[var(--color-accent)]" />
        <span className="font-medium">Access Control</span>
        <span className="hidden text-[10px] text-[var(--color-text-muted)] sm:inline">
          <FreshnessText
            lastUpdatedAt={freshness.lastUpdatedAt}
            now={freshness.now}
            isRefreshing={freshness.isRefreshing || loading}
            isStale={freshness.isStale}
          />
        </span>
        <div className="flex-1" />
        <RefreshButton onClick={() => void refresh()} refreshing={loading || freshness.isRefreshing} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        {(['queue', 'list', 'settings'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              tab === t ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t === 'queue' ? 'Approval Queue' : t === 'list' ? 'Access List' : 'Settings'}
            {t === 'queue' && pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-error)] text-white text-[10px] font-bold">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-accent)]" />}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <PanelError message={error} onRetry={refresh} onDismiss={() => setError(null)} />
      )}

      {!error && freshness.isStale && (
        <StatusBanner
          tone="warning"
          action={<button className="text-xs underline" onClick={() => void refreshNow()}>Refresh</button>}
        >
          Access data may be out of date.
        </StatusBanner>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && queue.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : tab === 'queue' ? (
          <ApprovalQueueTab queue={queue} onRefresh={refresh} />
        ) : tab === 'list' ? (
          <AccessListTab entries={accessList} onRefresh={refresh} />
        ) : (
          <SettingsTab settings={settings} bindings={bindings} autopilotPolicy={autopilotPolicy} onRefresh={refresh} />
        )}
      </div>
    </div>
  );
}

// ── Approval Queue Tab ──

function ApprovalQueueTab({ queue, onRefresh }: { queue: ApprovalQueueEntry[]; onRefresh: () => void }) {
  const pending = queue.filter(r => r.status === 'pending');
  const resolved = queue.filter(r => r.status !== 'pending').slice(0, 30);

  if (pending.length === 0 && resolved.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-[var(--color-text-muted)]">
        <Shield size={24} className="mb-2 opacity-50" />
        <p className="text-xs">No approval requests</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      {pending.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-[var(--color-text-muted)] px-1">Pending</h3>
          {pending.map(req => (
            <ApprovalCard key={req.id} request={req} onRefresh={onRefresh} />
          ))}
        </>
      )}
      {resolved.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-[var(--color-text-muted)] px-1 mt-3">History</h3>
          {resolved.map(req => (
            <ApprovalCard key={req.id} request={req} onRefresh={onRefresh} />
          ))}
        </>
      )}
    </div>
  );
}

function ApprovalCard({ request: req, onRefresh }: { request: ApprovalQueueEntry; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isPending = req.status === 'pending';
  const isToolApproval = req.approvalKind === 'tool_permission' || req.mode === 'tool_permission' || req.platform === 'agent';

  const handleAction = async (action: 'approve' | 'deny', extra?: boolean) => {
    setBusy(true);
    setActionError(null);
    try {
      if (action === 'approve') await approveRequest(req.id, extra);
      else await denyRequest(req.id, extra);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update approval.');
    } finally { setBusy(false); }
  };

  const handleToolPolicyAction = async (decision: 'allow' | 'deny') => {
    if (!isToolApproval) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await addAutopilotPolicyRule({
        toolPattern: req.toolName || '*',
        riskKind: (req.risk as AutonomyRiskKind) || '*',
        riskLevel: '*',
        decision,
        reason: decision === 'allow'
          ? `Repeated approval from Access Control for ${req.toolName || 'tool'}.`
          : `Repeated denial from Access Control for ${req.toolName || 'tool'}.`,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to save the Autopilot policy rule.');
      }
      if (decision === 'allow') await approveRequest(req.id);
      else await denyRequest(req.id);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update approval policy.');
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface-raised)]">
      <div className="flex items-center gap-2 mb-1">
        <PlatformBadge platform={req.platform} />
        <span className="font-medium text-xs">
          {isToolApproval ? 'Autopilot action' : (req.senderName || req.senderHandle || req.senderId)}
        </span>
        {req.channelInfo && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {isToolApproval ? req.channelInfo.replace(/^platform:/, '') : `in ${req.channelInfo}`}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-[var(--color-text-muted)]">{formatTime(req.requestedAt)}</span>
      </div>

      {/* Message */}
      <p className="text-xs text-[var(--color-text)] mb-1 line-clamp-3 whitespace-pre-wrap">
        {req.originalMessage}
      </p>

      {/* Impact summary */}
      {req.impactSummary && (
        <p className="text-[11px] text-[var(--color-text-muted)] italic mb-2 border-l-2 border-[var(--color-border)] pl-2">
          {req.impactSummary}
        </p>
      )}

      {req.toolName && (
        <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[10px] font-mono text-[var(--color-text-muted)] mb-2">
          {req.toolName}
        </span>
      )}

      {isPending ? (
        <>
          <div className="flex gap-1.5 mt-1">
            <button disabled={busy} onClick={() => handleAction('approve')}
              className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--color-success-muted)] text-[var(--color-success)] hover:brightness-110 disabled:opacity-50">
              {isToolApproval ? 'Approve' : 'Allow once'}
            </button>
            {!isToolApproval && (
              <button disabled={busy} onClick={() => handleAction('approve', true)}
                className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--color-success-muted)] text-[var(--color-success)] hover:brightness-110 disabled:opacity-50">
                Trust sender
              </button>
            )}
            {isToolApproval && (
              <button disabled={busy} onClick={() => handleToolPolicyAction('allow')}
                className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--color-success-muted)] text-[var(--color-success)] hover:brightness-110 disabled:opacity-50">
                Always allow
              </button>
            )}
            <button disabled={busy} onClick={() => handleAction('deny')}
              className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--color-error-muted)] text-[var(--color-error)] hover:brightness-110 disabled:opacity-50">
              {isToolApproval ? 'Deny' : 'Deny once'}
            </button>
            {!isToolApproval && (
              <button disabled={busy} onClick={() => handleAction('deny', true)}
                className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--color-error-muted)] text-[var(--color-error)] hover:brightness-110 disabled:opacity-50">
                Block sender
              </button>
            )}
            {isToolApproval && (
              <button disabled={busy} onClick={() => handleToolPolicyAction('deny')}
                className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--color-error-muted)] text-[var(--color-error)] hover:brightness-110 disabled:opacity-50">
                Never allow
              </button>
            )}
          </div>
          {actionError && (
            <div className="mt-2 rounded border border-[var(--color-error)]/20 bg-[var(--color-error-muted)] px-2 py-1 text-[11px] text-[var(--color-error)]">
              {actionError}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1 text-[11px]">
          {req.status === 'approved' ? (
            <><Check size={12} className="text-[var(--color-success)]" /> Approved</>
          ) : req.status === 'denied' ? (
            <><X size={12} className="text-[var(--color-error)]" /> Denied</>
          ) : (
            <span className="text-[var(--color-text-muted)]">{req.status}</span>
          )}
          {req.resolvedAt && (
            <span className="text-[var(--color-text-muted)] ml-1">{formatTime(req.resolvedAt)}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Access List Tab ──

function AccessListTab({ entries, onRefresh }: { entries: AccessListEntry[]; onRefresh: () => void }) {
  const [filter, setFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [addPlatform, setAddPlatform] = useState('slack');
  const [addSenderId, setAddSenderId] = useState('');
  const [addName, setAddName] = useState('');
  const [addStatus, setAddStatus] = useState<'trusted' | 'blocked'>('trusted');

  const filtered = filter === 'all' ? entries : entries.filter(e => e.platform === filter);

  const handleAdd = async () => {
    if (!addSenderId) return;
    try {
      await addAccessEntry({ platform: addPlatform, senderId: addSenderId, senderName: addName, status: addStatus });
      setAddSenderId('');
      setAddName('');
      setShowAdd(false);
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleToggle = async (entry: AccessListEntry) => {
    try {
      await updateAccessEntry(entry.id, entry.status === 'trusted' ? 'blocked' : 'trusted');
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeAccessEntry(id);
      onRefresh();
    } catch { /* ignore */ }
  };

  return (
    <div className="p-2 space-y-2">
      {/* Filter + Add */}
      <div className="flex items-center gap-1">
        {['all', 'slack', 'telegram', 'email'].map(p => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={`px-2 py-1 rounded text-[11px] font-medium ${
              filter === p ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setShowAdd(!showAdd)}
          className="p-1 rounded hover:bg-white/10">
          <UserPlus size={14} />
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="border border-[var(--color-border)] rounded-lg p-2 bg-[var(--color-surface-raised)] space-y-2">
          <div className="flex gap-2">
            <Select
              value={addPlatform}
              onChange={setAddPlatform}
              options={[
                { value: 'slack', label: 'Slack' },
                { value: 'telegram', label: 'Telegram' },
                { value: 'email', label: 'Email' },
              ]}
              inline
            />
            <Select
              value={addStatus}
              onChange={(v) => setAddStatus(v as 'trusted' | 'blocked')}
              options={[
                { value: 'trusted', label: 'Trusted' },
                { value: 'blocked', label: 'Blocked' },
              ]}
              inline
            />
          </div>
          <input value={addSenderId} onChange={e => setAddSenderId(e.target.value)}
            placeholder="User ID / email address"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs" />
          <input value={addName} onChange={e => setAddName(e.target.value)}
            placeholder="Display name (optional)"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs" />
          <button onClick={handleAdd} disabled={!addSenderId}
            className="px-3 py-1 rounded text-xs font-medium bg-[var(--color-accent)] text-white disabled:opacity-50">
            Add
          </button>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center text-[var(--color-text-muted)] text-xs py-6">
          No entries
        </div>
      ) : (
        filtered.map(entry => (
          <div key={entry.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
            <PlatformBadge platform={entry.platform} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{entry.senderName || entry.senderId}</div>
              {entry.senderHandle && entry.senderHandle !== entry.senderId && (
                <div className="text-[10px] text-[var(--color-text-muted)] truncate">{entry.senderHandle}</div>
              )}
            </div>
            <button onClick={() => handleToggle(entry)} title={entry.status === 'trusted' ? 'Block' : 'Trust'}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                entry.status === 'trusted'
                  ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]'
                  : 'bg-[var(--color-error-muted)] text-[var(--color-error)]'
              }`}>
              {entry.status === 'trusted' ? 'Trusted' : 'Blocked'}
            </button>
            <button onClick={() => handleRemove(entry.id)}
              className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]">
              <Trash2 size={12} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ── Settings Tab ──

function SettingsTab({ settings, bindings, autopilotPolicy, onRefresh }: {
  settings: PlatformSettings;
  bindings: WorkspaceBinding[];
  autopilotPolicy: AutopilotPolicy | null;
  onRefresh: () => void;
}) {
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [addGroupId, setAddGroupId] = useState('');
  const [addGroupName, setAddGroupName] = useState('');
  const [ruleToolPattern, setRuleToolPattern] = useState('*');
  const [ruleRiskKind, setRuleRiskKind] = useState<AutonomyRiskKind>('*');
  const [ruleRiskLevel, setRuleRiskLevel] = useState<AutonomyRiskLevel>('*');
  const [ruleDecision, setRuleDecision] = useState<AutonomyPolicyDecision>('ask');
  const [ruleReason, setRuleReason] = useState('');
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const handleModeChange = async (platform: string, mode: string) => {
    try {
      await setAccessSetting(platform, mode);
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleGenerateBindCode = async () => {
    try {
      const result = await generateTelegramBindCode();
      setBindCode(result.code);
    } catch { /* ignore */ }
  };

  const handleAddBinding = async () => {
    if (!addGroupId) return;
    try {
      await createWorkspaceBinding('telegram', addGroupId, addGroupName);
      setAddGroupId('');
      setAddGroupName('');
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleDeleteBinding = async (id: string) => {
    try {
      await deleteWorkspaceBinding(id);
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleAddAutonomyRule = async () => {
    setRuleBusy(true);
    setRuleError(null);
    try {
      const result = await addAutopilotPolicyRule({
        toolPattern: ruleToolPattern,
        riskKind: ruleRiskKind,
        riskLevel: ruleRiskLevel,
        decision: ruleDecision,
        reason: ruleReason,
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to save the Autopilot policy rule.');
      }
      setRuleToolPattern('*');
      setRuleRiskKind('*');
      setRuleRiskLevel('*');
      setRuleDecision('ask');
      setRuleReason('');
      onRefresh();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : 'Failed to save the Autopilot policy rule.');
    } finally { setRuleBusy(false); }
  };

  const handleDeleteAutonomyRule = async (id: number) => {
    setRuleBusy(true);
    setRuleError(null);
    try {
      const result = await deleteAutopilotPolicyRule(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete the Autopilot policy rule.');
      }
      onRefresh();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : 'Failed to delete the Autopilot policy rule.');
    } finally { setRuleBusy(false); }
  };

  const modes = [
    { value: 'open', label: 'Open' },
    { value: 'approval_required', label: 'Approval Required' },
    { value: 'block', label: 'Block Unknown' },
    { value: 'closed', label: 'Closed' },
  ];

  return (
    <div className="p-3 space-y-4">
      <div>
        <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Autopilot Approval Rules</h3>
        <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-raised)] p-2 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <input value={ruleToolPattern} onChange={e => setRuleToolPattern(e.target.value)}
              placeholder="Tool pattern, e.g. email"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs" />
            <Select
              value={ruleDecision}
              onChange={(v) => setRuleDecision(v as AutonomyPolicyDecision)}
              options={[
                { value: 'ask', label: 'Ask' },
                { value: 'allow', label: 'Allow' },
                { value: 'deny', label: 'Deny' },
              ]}
              inline
            />
            <Select
              value={ruleRiskKind}
              onChange={(v) => setRuleRiskKind(v as AutonomyRiskKind)}
              options={[
                { value: '*', label: 'Any risk' },
                { value: 'communication', label: 'Communication' },
                { value: 'external_write', label: 'External write' },
                { value: 'browser', label: 'Browser' },
                { value: 'destructive', label: 'Destructive' },
                { value: 'financial', label: 'Financial' },
                { value: 'credential', label: 'Credential' },
                { value: 'workspace_write', label: 'Workspace write' },
                { value: 'automation', label: 'Automation' },
                { value: 'compute', label: 'Compute' },
                { value: 'read', label: 'Read' },
              ]}
              inline
            />
            <Select
              value={ruleRiskLevel}
              onChange={(v) => setRuleRiskLevel(v as AutonomyRiskLevel)}
              options={[
                { value: '*', label: 'Any level' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' },
              ]}
              inline
            />
          </div>
          <div className="flex gap-1.5">
            <input value={ruleReason} onChange={e => setRuleReason(e.target.value)}
              placeholder="Reason shown to the agent"
              className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs" />
            <button onClick={handleAddAutonomyRule} disabled={ruleBusy}
              className="px-2 py-1 rounded text-xs bg-[var(--color-accent)] text-white disabled:opacity-50">
              Add
            </button>
          </div>
          {ruleError && (
            <div className="rounded border border-[var(--color-error)]/20 bg-[var(--color-error-muted)] px-2 py-1 text-[11px] text-[var(--color-error)]">
              {ruleError}
            </div>
          )}
          {(autopilotPolicy?.rules || []).length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">No custom Autopilot rules.</p>
          ) : (
            <div className="space-y-1">
              {(autopilotPolicy?.rules || []).map(rule => (
                <div key={rule.id} className="flex items-center gap-1.5 py-1 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    rule.decision === 'allow'
                      ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]'
                      : rule.decision === 'deny'
                        ? 'bg-[var(--color-error-muted)] text-[var(--color-error)]'
                        : 'bg-[var(--color-warning-muted)] text-[var(--color-warning)]'
                  }`}>
                    {rule.decision}
                  </span>
                  <span className="font-mono text-[11px]">{rule.tool_pattern}</span>
                  <span className="text-[var(--color-text-muted)] truncate">
                    {rule.risk_kind}/{rule.risk_level}{rule.reason ? ` - ${rule.reason}` : ''}
                  </span>
                  <div className="flex-1" />
                  <button disabled={ruleBusy} onClick={() => handleDeleteAutonomyRule(rule.id)}
                    className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)] disabled:opacity-50">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-platform access modes */}
      <div>
        <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Access Mode by Platform</h3>
        {['slack', 'telegram', 'email'].map(platform => (
          <div key={platform} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
            <div className="flex items-center gap-2">
              <PlatformBadge platform={platform} />
            </div>
            <Select
              value={settings[platform] || 'block'}
              onChange={(v) => handleModeChange(platform, v)}
              options={modes.map(m => ({ value: m.value, label: m.label }))}
              inline
              align="right"
            />
          </div>
        ))}
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
          Open — anyone can message your agent. Approval Required — unknown senders are held for review. Block Unknown — unknown senders are dropped. Closed — only trusted contacts can reach your agent.
        </p>
      </div>

      {/* Workspace Bindings */}
      <div>
        <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Telegram Group Bindings</h3>
        {bindings.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">No groups bound. Add the bot to a Telegram group and use /bind.</p>
        ) : (
          bindings.map(b => (
            <div key={b.id} className="flex items-center gap-2 py-1.5">
              <Link2 size={12} className="text-[var(--color-text-muted)]" />
              <span className="text-xs flex-1">{b.groupName || b.groupId}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{formatTime(b.createdAt)}</span>
              <button onClick={() => handleDeleteBinding(b.id)}
                className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]">
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}

        {/* Generate bind code */}
        <div className="mt-2 space-y-1">
          <button onClick={handleGenerateBindCode}
            className="text-xs text-[var(--color-accent)] hover:underline">
            Generate bind code for desktop
          </button>
          {bindCode && (
            <div className="text-[11px] bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded p-2">
              <p>Send this in your Telegram group:</p>
              <code className="block mt-1 font-mono text-[var(--color-accent)]">/bind {bindCode}</code>
              <p className="text-[var(--color-text-muted)] mt-1">Expires in 10 minutes.</p>
            </div>
          )}
        </div>

        {/* Manual add */}
        <div className="mt-2 flex gap-1">
          <input value={addGroupId} onChange={e => setAddGroupId(e.target.value)}
            placeholder="Group Chat ID"
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs" />
          <input value={addGroupName} onChange={e => setAddGroupName(e.target.value)}
            placeholder="Name"
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs" />
          <button onClick={handleAddBinding} disabled={!addGroupId}
            className="px-2 py-1 rounded text-xs bg-[var(--color-accent)] text-white disabled:opacity-50">
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
