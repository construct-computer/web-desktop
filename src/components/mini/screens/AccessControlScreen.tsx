/**
 * AccessControlScreen — Manage approval queue, access list, and per-platform
 * settings from the Telegram Mini App.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Check, X, Trash2, RefreshCw, Inbox, Plus, Link2, Copy } from 'lucide-react';
import {
  MiniHeader, Card, Badge, PlatformBadge, ConfirmDialog, Field, useToast, haptic,
  SkeletonList, EmptyState, SectionLabel, IconBtn, Toggle,
  api, apiJSON, bg2, textColor, accent, formatRelativeTime,
} from '../ui';
import {
  getApprovalQueue, approveRequest, denyRequest,
  getAccessList, addAccessEntry, updateAccessEntry, removeAccessEntry,
  getAccessSettings, setAccessSetting,
  getWorkspaceBindings, createWorkspaceBinding, deleteWorkspaceBinding,
  generateTelegramBindCode,
  type ApprovalQueueEntry, type AccessListEntry, type PlatformSettings,
  type WorkspaceBinding,
} from '@/services/access-control';

// ── Types ──

type Tab = 'queue' | 'list' | 'settings';

const PLATFORM_BORDER_COLORS: Record<string, string> = {
  slack: '#4A154B',
  telegram: '#2AABEE',
  email: '#EA4335',
};

const ACCESS_MODES = [
  { value: 'open', label: 'Open', desc: 'Everyone gets full access' },
  { value: 'guest', label: 'Guest', desc: 'Unknown users get restricted access' },
  { value: 'block', label: 'Approval Required', desc: 'Unknown users must be approved' },
] as const;

// ── Component ──

export function AccessControlScreen() {
  const [tab, setTab] = useState<Tab>('queue');
  const [loading, setLoading] = useState(true);

  // Queue state
  const [pending, setPending] = useState<ApprovalQueueEntry[]>([]);
  const [resolved, setResolved] = useState<ApprovalQueueEntry[]>([]);

  // Access list state
  const [accessList, setAccessList] = useState<AccessListEntry[]>([]);
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // Settings state
  const [settings, setSettings] = useState<PlatformSettings>({});

  // Bindings state
  const [bindings, setBindings] = useState<WorkspaceBinding[]>([]);

  const toast = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetchers ──

  const fetchQueue = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        getApprovalQueue('pending'),
        getApprovalQueue('resolved'),
      ]);
      setPending(p);
      setResolved(r.slice(0, 30));
    } catch {
      // silent — toast on action failures instead
    }
  }, []);

  const fetchList = useCallback(async () => {
    try {
      const entries = await getAccessList();
      setAccessList(entries);
    } catch {}
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const s = await getAccessSettings();
      setSettings(s);
    } catch {}
  }, []);

  const fetchBindings = useCallback(async () => {
    try {
      const b = await getWorkspaceBindings();
      setBindings(b);
    } catch {}
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchQueue(), fetchList(), fetchSettings(), fetchBindings()]);
    setLoading(false);
  }, [fetchQueue, fetchList, fetchSettings, fetchBindings]);

  // Initial load
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh queue every 10s when on queue tab
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (tab === 'queue') {
      intervalRef.current = setInterval(fetchQueue, 10_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tab, fetchQueue]);

  // ── Tab bar ──

  const tabs: { key: Tab; label: string }[] = [
    { key: 'queue', label: 'Queue' },
    { key: 'list', label: 'Access List' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ color: textColor() }}>
      <MiniHeader
        title="Access Control"
        actions={
          <IconBtn onClick={() => { haptic('light'); tab === 'queue' ? fetchQueue() : tab === 'list' ? fetchList() : fetchSettings(); }}>
            <RefreshCw size={16} className="opacity-40" />
          </IconBtn>
        }
      />

      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); haptic('light'); }}
            className="flex-1 relative py-2.5 text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5"
            style={{ color: tab === t.key ? accent() : 'rgba(255,255,255,0.4)' }}
          >
            {t.label}
            {t.key === 'queue' && pending.length > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white px-1"
                style={{ backgroundColor: '#ef4444' }}
              >
                {pending.length > 99 ? '99+' : pending.length}
              </span>
            )}
            {tab === t.key && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style={{ backgroundColor: accent() }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList count={5} />
        ) : tab === 'queue' ? (
          <QueueTab
            pending={pending}
            resolved={resolved}
            onRefresh={fetchQueue}
            toast={toast}
          />
        ) : tab === 'list' ? (
          <ListTab
            entries={accessList}
            filter={platformFilter}
            onFilterChange={setPlatformFilter}
            onRefresh={fetchList}
            toast={toast}
          />
        ) : (
          <SettingsTab
            settings={settings}
            bindings={bindings}
            onRefreshSettings={fetchSettings}
            onRefreshBindings={fetchBindings}
            toast={toast}
          />
        )}
      </div>
    </div>
  );
}

// ── Queue Tab ──

function QueueTab({ pending, resolved, onRefresh, toast }: {
  pending: ApprovalQueueEntry[];
  resolved: ApprovalQueueEntry[];
  onRefresh: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  if (pending.length === 0 && resolved.length === 0) {
    return <EmptyState icon={Inbox} message="No approval requests" />;
  }

  return (
    <div className="px-4 py-3 space-y-2">
      {pending.length > 0 && (
        <>
          <SectionLabel>Pending ({pending.length})</SectionLabel>
          {pending.map(req => (
            <RequestCard key={req.id} request={req} onRefresh={onRefresh} toast={toast} />
          ))}
        </>
      )}
      {resolved.length > 0 && (
        <>
          <div className={pending.length > 0 ? 'pt-4' : ''}>
            <SectionLabel>History</SectionLabel>
          </div>
          {resolved.map(req => (
            <RequestCard key={req.id} request={req} onRefresh={onRefresh} toast={toast} />
          ))}
        </>
      )}
    </div>
  );
}

function RequestCard({ request: req, onRefresh, toast }: {
  request: ApprovalQueueEntry;
  onRefresh: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [busy, setBusy] = useState(false);
  const isPending = req.status === 'pending';
  const borderColor = PLATFORM_BORDER_COLORS[req.platform] || 'rgba(255,255,255,0.08)';

  const handleAction = async (action: 'approve' | 'deny', extra?: boolean) => {
    setBusy(true);
    haptic('medium');
    try {
      if (action === 'approve') {
        await approveRequest(req.id, extra);
        haptic('success');
        toast.show(extra ? 'Approved & trusted' : 'Approved', 'success');
      } else {
        await denyRequest(req.id, extra);
        haptic('success');
        toast.show(extra ? 'Denied & blocked' : 'Denied', 'success');
      }
      onRefresh();
    } catch {
      haptic('error');
      toast.show('Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 10 }}>
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <PlatformBadge platform={req.platform} />
          <span className="text-[13px] font-medium truncate">
            {req.senderName || req.senderHandle || req.senderId}
          </span>
          {req.senderHandle && req.senderHandle !== req.senderName && (
            <span className="text-[11px] opacity-40 truncate">{req.senderHandle}</span>
          )}
        </div>

        {/* Channel */}
        {req.channelInfo && (
          <p className="text-[11px] opacity-40 mb-1">in {req.channelInfo}</p>
        )}

        {/* Message */}
        {req.originalMessage && (
          <p className="text-[12px] opacity-70 mb-1.5 line-clamp-3 whitespace-pre-wrap leading-relaxed">
            {req.originalMessage}
          </p>
        )}

        {/* Impact summary */}
        {req.impactSummary && (
          <p className="text-[11px] opacity-40 italic mb-1.5 pl-2" style={{ borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
            {req.impactSummary}
          </p>
        )}

        {/* Timestamp */}
        <span className="text-[10px] opacity-30">{formatRelativeTime(req.requestedAt)}</span>

        {/* Actions or status */}
        {isPending ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <ActionBtn disabled={busy} color="#22c55e" onClick={() => handleAction('approve')}>
              Approve
            </ActionBtn>
            <ActionBtn disabled={busy} color="#22c55e" onClick={() => handleAction('approve', true)}>
              Approve & Trust
            </ActionBtn>
            <ActionBtn disabled={busy} color="#ef4444" onClick={() => handleAction('deny')}>
              Deny
            </ActionBtn>
            <ActionBtn disabled={busy} color="#ef4444" onClick={() => handleAction('deny', true)}>
              Deny & Block
            </ActionBtn>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-2">
            {req.status === 'approved' ? (
              <Badge color="#22c55e"><Check size={10} /> Approved</Badge>
            ) : req.status === 'denied' ? (
              <Badge color="#ef4444"><X size={10} /> Denied</Badge>
            ) : (
              <Badge>{req.status}</Badge>
            )}
            {req.resolvedAt && (
              <span className="text-[10px] opacity-30">{formatRelativeTime(req.resolvedAt)}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function ActionBtn({ children, color, disabled, onClick }: {
  children: React.ReactNode;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-30 active:scale-95 transition-transform"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {children}
    </button>
  );
}

// ── List Tab ──

function ListTab({ entries, filter, onFilterChange, onRefresh, toast }: {
  entries: AccessListEntry[];
  filter: string;
  onFilterChange: (f: string) => void;
  onRefresh: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [confirmDelete, setConfirmDelete] = useState<AccessListEntry | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Add entry form
  const [showAdd, setShowAdd] = useState(false);
  const [addPlatform, setAddPlatform] = useState('telegram');
  const [addStatus, setAddStatus] = useState<'trusted' | 'blocked'>('trusted');
  const [addSenderId, setAddSenderId] = useState('');
  const [addDisplayName, setAddDisplayName] = useState('');
  const [adding, setAdding] = useState(false);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.platform === filter);

  const handleToggle = async (entry: AccessListEntry) => {
    setToggling(entry.id);
    haptic('medium');
    try {
      const newStatus = entry.status === 'trusted' ? 'blocked' : 'trusted';
      await updateAccessEntry(entry.id, newStatus);
      haptic('success');
      toast.show(`Set to ${newStatus}`, 'success');
      onRefresh();
    } catch {
      haptic('error');
      toast.show('Failed to update', 'error');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (entry: AccessListEntry) => {
    haptic('medium');
    try {
      await removeAccessEntry(entry.id);
      haptic('success');
      toast.show('Removed', 'success');
      setConfirmDelete(null);
      onRefresh();
    } catch {
      haptic('error');
      toast.show('Failed to remove', 'error');
    }
  };

  const handleAdd = async () => {
    if (!addSenderId.trim()) return;
    setAdding(true);
    haptic('medium');
    try {
      await addAccessEntry({
        platform: addPlatform,
        senderId: addSenderId.trim(),
        senderName: addDisplayName.trim() || undefined,
        status: addStatus,
      });
      haptic('success');
      toast.show('Entry added', 'success');
      setAddSenderId('');
      setAddDisplayName('');
      setShowAdd(false);
      onRefresh();
    } catch {
      haptic('error');
      toast.show('Failed to add entry', 'error');
    } finally {
      setAdding(false);
    }
  };

  const platforms = ['all', 'slack', 'telegram', 'email'];

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Platform filter + add button */}
      <div className="flex items-center gap-1.5">
        {platforms.map(p => (
          <button key={p} onClick={() => { onFilterChange(p); haptic('light'); }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ backgroundColor: filter === p ? accent() : 'rgba(255,255,255,0.06)', color: filter === p ? '#fff' : 'rgba(255,255,255,0.4)' }}>
            {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <IconBtn onClick={() => { setShowAdd(!showAdd); haptic('light'); }}>
          <Plus size={16} className="opacity-50" />
        </IconBtn>
      </div>

      {/* Add entry form */}
      {showAdd && (
        <Card>
          <div className="space-y-2.5">
            <SectionLabel>Add Entry</SectionLabel>
            <div className="flex gap-1.5">
              {['slack', 'telegram', 'email'].map(p => (
                <button key={p} onClick={() => setAddPlatform(p)}
                  className="px-2 py-1 rounded-md text-[11px] font-medium"
                  style={{ backgroundColor: addPlatform === p ? accent() : 'rgba(255,255,255,0.06)', color: addPlatform === p ? '#fff' : textColor(), opacity: addPlatform === p ? 1 : 0.5 }}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {(['trusted', 'blocked'] as const).map(s => (
                <button key={s} onClick={() => setAddStatus(s)}
                  className="px-2 py-1 rounded-md text-[11px] font-medium"
                  style={{
                    backgroundColor: addStatus === s ? (s === 'trusted' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)') : 'rgba(255,255,255,0.06)',
                    color: addStatus === s ? (s === 'trusted' ? '#22c55e' : '#ef4444') : textColor(), opacity: addStatus === s ? 1 : 0.5,
                  }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <Field label="Sender ID" value={addSenderId} onChange={setAddSenderId} placeholder="User ID or handle" />
            <Field label="Display Name (optional)" value={addDisplayName} onChange={setAddDisplayName} placeholder="Display name" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-xl text-[13px] font-medium" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>Cancel</button>
              <button onClick={handleAdd} disabled={adding || !addSenderId.trim()} className="flex-1 py-2 rounded-xl text-[13px] font-medium disabled:opacity-30" style={{ backgroundColor: accent(), color: '#fff' }}>
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Entries */}
      {filtered.length === 0 ? (
        <EmptyState icon={Shield} message="No access entries" />
      ) : (
        filtered.map(entry => (
          <Card key={entry.id}>
            <div className="flex items-center gap-2">
              <PlatformBadge platform={entry.platform} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{entry.senderName || entry.senderId}</p>
                {entry.senderHandle && entry.senderHandle !== entry.senderId && (
                  <p className="text-[11px] opacity-40 truncate">{entry.senderHandle}</p>
                )}
              </div>
              <button disabled={toggling === entry.id} onClick={() => handleToggle(entry)}
                className="px-2 py-1 rounded-md text-[10px] font-semibold disabled:opacity-30"
                style={{ backgroundColor: entry.status === 'trusted' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: entry.status === 'trusted' ? '#22c55e' : '#ef4444' }}>
                {entry.status === 'trusted' ? 'Trusted' : 'Blocked'}
              </button>
              <IconBtn onClick={() => setConfirmDelete(entry)}>
                <Trash2 size={14} className="opacity-30" />
              </IconBtn>
            </div>
          </Card>
        ))
      )}

      {confirmDelete && (
        <ConfirmDialog title="Remove entry?" message={`Remove ${confirmDelete.senderName || confirmDelete.senderId} from the access list?`}
          confirmLabel="Remove" destructive onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

// ── Settings Tab ──

function SettingsTab({ settings, bindings, onRefreshSettings, onRefreshBindings, toast }: {
  settings: PlatformSettings;
  bindings: WorkspaceBinding[];
  onRefreshSettings: () => void;
  onRefreshBindings: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [updating, setUpdating] = useState<string | null>(null);

  // Bind code state
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [bindExpiry, setBindExpiry] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  // Manual binding form
  const [showManualBind, setShowManualBind] = useState(false);
  const [manualGroupId, setManualGroupId] = useState('');
  const [manualGroupName, setManualGroupName] = useState('');
  const [addingBinding, setAddingBinding] = useState(false);

  const [confirmDeleteBinding, setConfirmDeleteBinding] = useState<WorkspaceBinding | null>(null);

  const handleModeChange = async (platform: string, mode: string) => {
    setUpdating(platform);
    haptic('medium');
    try {
      await setAccessSetting(platform, mode);
      haptic('success');
      toast.show(`${platform} set to ${mode}`, 'success');
      onRefreshSettings();
    } catch {
      haptic('error');
      toast.show('Failed to update', 'error');
    } finally {
      setUpdating(null);
    }
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    haptic('medium');
    try {
      const result = await generateTelegramBindCode();
      setBindCode(result.code);
      setBindExpiry(result.expiresAt);
      haptic('success');
    } catch {
      haptic('error');
      toast.show('Failed to generate code', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddBinding = async () => {
    if (!manualGroupId.trim() || !manualGroupName.trim()) return;
    setAddingBinding(true);
    haptic('medium');
    try {
      await createWorkspaceBinding('telegram', manualGroupId.trim(), manualGroupName.trim());
      haptic('success');
      toast.show('Binding added', 'success');
      setManualGroupId('');
      setManualGroupName('');
      setShowManualBind(false);
      onRefreshBindings();
    } catch {
      haptic('error');
      toast.show('Failed to add binding', 'error');
    } finally {
      setAddingBinding(false);
    }
  };

  const handleDeleteBinding = async (binding: WorkspaceBinding) => {
    haptic('medium');
    try {
      await deleteWorkspaceBinding(binding.id);
      haptic('success');
      toast.show('Binding removed', 'success');
      setConfirmDeleteBinding(null);
      onRefreshBindings();
    } catch {
      haptic('error');
      toast.show('Failed to remove binding', 'error');
    }
  };

  const platforms = ['slack', 'telegram', 'email'];
  const expiryMinutes = bindExpiry ? Math.max(0, Math.round((bindExpiry - Date.now()) / 60000)) : 0;

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Per-platform access modes */}
      <SectionLabel>Access Mode by Platform</SectionLabel>

      {platforms.map(platform => {
        const current = settings[platform] || 'block';
        return (
          <Card key={platform}>
            <div className="flex items-center gap-2 mb-3">
              <PlatformBadge platform={platform} />
              {updating === platform && <span className="text-[10px] opacity-30">Saving...</span>}
            </div>
            <div className="space-y-1.5">
              {ACCESS_MODES.map(mode => (
                <button key={mode.value} disabled={updating === platform}
                  onClick={() => { if (current !== mode.value) handleModeChange(platform, mode.value); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors disabled:opacity-40"
                  style={{ backgroundColor: current === mode.value ? `${accent()}18` : 'transparent', border: current === mode.value ? `1px solid ${accent()}40` : '1px solid transparent' }}>
                  <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                    style={{ border: `2px solid ${current === mode.value ? accent() : 'rgba(255,255,255,0.2)'}` }}>
                    {current === mode.value && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accent() }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: current === mode.value ? accent() : textColor() }}>{mode.label}</p>
                    <p className="text-[11px] opacity-40">{mode.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        );
      })}

      {/* Telegram Group Bindings */}
      <SectionLabel>Telegram Group Bindings</SectionLabel>

      {/* Existing bindings */}
      {bindings.length > 0 && (
        <div className="space-y-1.5">
          {bindings.map(b => (
            <Card key={b.id}>
              <div className="flex items-center gap-2">
                <Link2 size={14} className="opacity-30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{b.groupName}</p>
                  <p className="text-[10px] opacity-30">{new Date(b.createdAt).toLocaleDateString()}</p>
                </div>
                <IconBtn onClick={() => setConfirmDeleteBinding(b)}>
                  <Trash2 size={14} className="opacity-30" />
                </IconBtn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Generate bind code */}
      <Card>
        <div className="space-y-2">
          <p className="text-[12px] opacity-50">Generate a bind code to link a Telegram group. Send <code className="px-1 py-0.5 rounded text-[11px]" style={{ backgroundColor: bg2() }}>/bind CODE</code> in the group.</p>
          {bindCode ? (
            <div className="space-y-2">
              <button onClick={() => { navigator.clipboard.writeText(`/bind ${bindCode}`); haptic('success'); toast.show('Copied!', 'success'); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg w-full" style={{ backgroundColor: bg2() }}>
                <code className="text-[13px] font-mono flex-1 text-left">/bind {bindCode}</code>
                <Copy size={14} className="opacity-40 shrink-0" />
              </button>
              <p className="text-[10px] opacity-30">Expires in {expiryMinutes} minutes</p>
            </div>
          ) : (
            <button onClick={handleGenerateCode} disabled={generating}
              className="w-full py-2 rounded-xl text-[13px] font-medium disabled:opacity-30"
              style={{ backgroundColor: accent(), color: '#fff' }}>
              {generating ? 'Generating...' : 'Generate Bind Code'}
            </button>
          )}
        </div>
      </Card>

      {/* Manual add */}
      <button onClick={() => { setShowManualBind(!showManualBind); haptic('light'); }}
        className="text-[12px] opacity-40 underline underline-offset-2">
        {showManualBind ? 'Hide manual add' : 'Or add binding manually'}
      </button>

      {showManualBind && (
        <Card>
          <div className="space-y-2.5">
            <Field label="Group Chat ID" value={manualGroupId} onChange={setManualGroupId} placeholder="e.g. -1001234567890" />
            <Field label="Group Name" value={manualGroupName} onChange={setManualGroupName} placeholder="Group display name" />
            <button onClick={handleAddBinding} disabled={addingBinding || !manualGroupId.trim() || !manualGroupName.trim()}
              className="w-full py-2 rounded-xl text-[13px] font-medium disabled:opacity-30"
              style={{ backgroundColor: accent(), color: '#fff' }}>
              {addingBinding ? 'Adding...' : 'Add Binding'}
            </button>
          </div>
        </Card>
      )}

      {/* Delete binding confirmation */}
      {confirmDeleteBinding && (
        <ConfirmDialog title="Remove binding?" message={`Remove the binding for "${confirmDeleteBinding.groupName}"?`}
          confirmLabel="Remove" destructive onConfirm={() => handleDeleteBinding(confirmDeleteBinding)} onCancel={() => setConfirmDeleteBinding(null)} />
      )}
    </div>
  );
}
