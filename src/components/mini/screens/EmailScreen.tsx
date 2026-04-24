/**
 * EmailScreen — mobile mailbox powered by the shared desktop email domain layer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail, Search, Trash2, RefreshCw,
  Paperclip, X, Check, AlertCircle,
  ArrowRight, Sparkles, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  MiniHeader, Card, ConfirmDialog, useToast, haptic,
  SkeletonList, EmptyState, Badge, IconBtn,
  api, apiJSON, accent, bg, bg2, textColor, formatRelativeTime,
} from '../ui';
import {
  deleteThread,
  extractName,
  getEmailStatus,
  getMailboxItemId,
  getMessageAttachment,
  getThread,
  isThreadItem,
  listMailbox,
  markThreadUnreadState,
  updateMessageLabels,
  type EmailMessage,
  parseAddress,
  parseAddressList,
  type EmailThread,
  type EmailThreadDetail,
  type MailboxItem,
  type ParsedAddress,
} from '@/services/emailMailbox';
import { EmailHtmlBody } from '@/components/apps/email/EmailHtmlBody';

function generateEmailUsername(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
  return base || 'my';
}

function avatarHsl(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 50%, 35%)`;
}

function getInitial(name: string): string {
  return (name[0] || '?').toUpperCase();
}

function dedupeItems(items: MailboxItem[]) {
  const map = new Map<string, MailboxItem>();
  for (const item of items) map.set(getMailboxItemId(item), item);
  return Array.from(map.values());
}

function markThreadReadLocally(thread: EmailThreadDetail): EmailThreadDetail {
  return {
    ...thread,
    unread: false,
    labels: thread.labels.filter((label) => label.toLowerCase() !== 'unread'),
    messages: thread.messages.map((message) => ({
      ...message,
      unread: false,
      labels: message.labels.filter((label) => label.toLowerCase() !== 'unread'),
    })),
  };
}

export function EmailScreen() {
  const toast = useToast();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [items, setItems] = useState<MailboxItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedThread, setSelectedThread] = useState<EmailThreadDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MailboxItem | null>(null);

  const checkStatus = useCallback(async () => {
    const status = await getEmailStatus();
    setConfigured(!!status.data?.configured);
    return !!status.data?.configured;
  }, []);

  const loadMailbox = useCallback(async (reset = true) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    const result = await listMailbox({
      folder: 'all',
      limit: 30,
      pageToken: reset ? undefined : nextPageToken,
      query: searchQuery || undefined,
    });
    if (result.success && result.data) {
      setItems((prev) => (reset ? result.data!.items : dedupeItems([...prev, ...result.data!.items])));
      setNextPageToken(result.data.nextPageToken);
    } else if (result.error) {
      toast.show(result.error, 'error');
    }
    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
  }, [nextPageToken, searchQuery, toast]);

  useEffect(() => {
    (async () => {
      const ok = await checkStatus();
      if (ok) await loadMailbox(true);
      else setLoading(false);
    })();
  }, [checkStatus, loadMailbox]);

  useEffect(() => {
    if (!configured) return undefined;
    const interval = window.setInterval(() => { void loadMailbox(true); }, 30_000);
    return () => window.clearInterval(interval);
  }, [configured, loadMailbox]);

  useEffect(() => {
    if (configured) return undefined;
    const onFocus = async () => {
      const ok = await checkStatus();
      if (ok) await loadMailbox(true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [configured, checkStatus, loadMailbox]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!configured) return;
    void loadMailbox(true);
  }, [configured, searchQuery, loadMailbox]);

  const openThread = useCallback(async (thread: EmailThread) => {
    setThreadLoading(true);
    haptic('light');
    const detail = await getThread(thread.threadId);
    if (detail.success && detail.data) {
      let nextThread = detail.data;
      if (thread.unread) {
        const markResult = await markThreadUnreadState(
          thread.threadId,
          false,
          detail.data.messages,
        );
        if (markResult.success) {
          nextThread = markThreadReadLocally(detail.data);
          setItems((current) => current.map((item) => (
            isThreadItem(item) && item.threadId === thread.threadId
              ? {
                  ...item,
                  unread: false,
                  labels: item.labels.filter((label) => label.toLowerCase() !== 'unread'),
                }
              : item
          )));
        } else if (markResult.error) {
          toast.show(`Couldn't mark as read: ${markResult.error}`, 'error');
          haptic('error');
        }
      }
      setSelectedThread(nextThread);
    } else if (detail.error) {
      toast.show(detail.error, 'error');
      haptic('error');
    }
    setThreadLoading(false);
  }, [toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    haptic('light');
    await loadMailbox(true);
  };

  const openAttachment = useCallback(async (message: EmailMessage, attachmentId: string | null) => {
    if (!attachmentId) return;
    const attachment = await getMessageAttachment(message.messageId, attachmentId);
    if (attachment.success && attachment.data?.downloadUrl) window.open(attachment.data.downloadUrl, '_blank');
    else if (attachment.error) toast.show(attachment.error, 'error');
  }, [toast]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || !isThreadItem(deleteTarget)) return;
    await deleteThread(deleteTarget.threadId);
    setDeleteTarget(null);
    setSelectedThread(null);
    await loadMailbox(true);
  }, [deleteTarget, loadMailbox]);

  const handleToggleMessageUnread = useCallback(async (message: EmailMessage) => {
    const result = await updateMessageLabels(message.messageId, message.unread
      ? { addLabels: ['read'], removeLabels: ['UNREAD', 'unread'] }
      : { addLabels: ['unread'], removeLabels: ['read'] });
    if (!result.success && result.error) toast.show(result.error, 'error');
    await loadMailbox(true);
    if (selectedThread) {
      const detail = await getThread(selectedThread.threadId);
      if (detail.success && detail.data) setSelectedThread(detail.data);
    }
  }, [loadMailbox, selectedThread, toast]);

  if (selectedThread || threadLoading) {
    return (
      <MobileThreadView
        thread={selectedThread}
        loading={threadLoading}
        onBack={() => setSelectedThread(null)}
        onDelete={() => selectedThread && setDeleteTarget({ ...selectedThread, kind: 'thread' })}
        onToggleRead={handleToggleMessageUnread}
        onOpenAttachment={openAttachment}
      />
    );
  }

  if (configured === false) {
    return (
      <EmailSetupMini
        onConfigured={async () => {
          setConfigured(true);
          await loadMailbox(true);
        }}
      />
    );
  }

  if (configured === null) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
        <MiniHeader title="Email" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin opacity-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
      <MiniHeader
        title="Email"
        actions={
          <div className="flex items-center gap-0.5">
            <IconBtn onClick={() => { setSearchOpen((open) => !open); if (searchOpen) { setSearchInput(''); setSearchQuery(''); } }}>
              {searchOpen ? <X size={16} className="opacity-50" /> : <Search size={16} className="opacity-50" />}
            </IconBtn>
            <IconBtn onClick={handleRefresh}>
              <RefreshCw size={16} className={`opacity-50 ${refreshing ? 'animate-spin' : ''}`} />
            </IconBtn>
          </div>
        }
      />

      {searchOpen && (
        <div className="px-4 pb-2">
          <input
            autoFocus
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search mailbox…"
            className="w-full text-[13px] px-3.5 py-2 rounded-xl outline-none"
            style={{ backgroundColor: bg2(), color: textColor() }}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <SkeletonList count={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Mail}
            message={searchQuery ? 'No matching items' : 'No mail yet'}
          />
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => {
              if (!isThreadItem(item)) return null;
              const sender = extractName((item.senders || ['Unknown'])[0]);
              const title = item.subject || '(no subject)';
              const timestamp = item.updatedAt || item.timestamp;
              const unread = item.unread;
              const hasAttachment = (item.attachments || []).length > 0;

              return (
                <div key={getMailboxItemId(item)} className="relative">
                  {unread && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full z-10"
                      style={{ backgroundColor: accent() }}
                    />
                  )}
                  <Card
                    className={unread ? 'ring-1' : ''}
                    onClick={() => void openThread(item)}
                  >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                        style={{ backgroundColor: avatarHsl(sender) }}
                      >
                        {getInitial(sender)}
                      </div>
                      {unread && (
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2"
                          style={{ backgroundColor: accent(), boxShadow: `0 0 0 2px ${bg()}` }}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[13px] truncate flex-1 ${unread ? 'font-semibold' : 'font-medium opacity-70'}`}
                          style={{ color: textColor() }}
                        >
                          {sender}
                        </span>
                        {item.messageCount > 1 && <Badge>{item.messageCount}</Badge>}
                        {hasAttachment && <Paperclip size={11} className="opacity-30 shrink-0" />}
                        <span className="text-[10px] opacity-30 shrink-0">
                          {timestamp ? formatRelativeTime(timestamp) : ''}
                        </span>
                      </div>

                      <p
                        className={`text-[12px] truncate mt-0.5 ${unread ? 'font-medium' : 'opacity-50'}`}
                        style={{ color: textColor() }}
                      >
                        {title}
                      </p>

                      {item.preview && (
                        <p className="text-[11px] opacity-30 truncate mt-0.5">
                          {item.preview}
                        </p>
                      )}
                    </div>
                  </div>
                  </Card>
                </div>
              );
            })}

            {nextPageToken && (
              <button
                type="button"
                onClick={() => void loadMailbox(false)}
                disabled={loadingMore}
                className="w-full py-2.5 rounded-xl text-[13px] font-medium disabled:opacity-40"
                style={{ backgroundColor: bg2(), color: textColor() }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Thread"
          message="This will move the thread to trash. Deleting again from Trash will remove it permanently."
          confirmLabel="Delete"
          destructive
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function MobileThreadView({
  thread,
  loading,
  onBack,
  onDelete,
  onToggleRead,
  onOpenAttachment,
}: {
  thread: EmailThreadDetail | null;
  loading: boolean;
  onBack: () => void;
  onDelete: () => void;
  onToggleRead: (message: EmailMessage) => Promise<void>;
  onOpenAttachment: (message: EmailMessage, attachmentId: string | null) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thread && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread]);

  if (loading || !thread) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
        <MiniHeader title="Loading…" onBack={onBack} />
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
      <MiniHeader
        title={thread.subject || '(no subject)'}
        onBack={onBack}
        actions={(
          <IconBtn onClick={onDelete}>
            <Trash2 size={16} className="opacity-50" />
          </IconBtn>
        )}
      />

      <div className="px-4 py-1.5">
        <span className="text-[11px] opacity-30">
          {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {thread.messages.map((message) => {
          return (
            <div key={message.messageId} className="rounded-xl overflow-hidden" style={{ backgroundColor: bg2() }}>
              <MiniMessageHeader message={message} />

              <div className="px-3 py-2 text-[13px] leading-relaxed opacity-80" style={{ color: textColor() }}>
                <EmailHtmlBody html={message.extractedHtml || message.html} text={message.extractedText || message.text} />
              </div>

              {message.attachments?.length ? (
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                  {message.attachments.map((attachment) => (
                    <button
                      key={attachment.attachmentId || attachment.filename}
                      onClick={() => void onOpenAttachment(message, attachment.attachmentId)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] active:bg-white/10"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    >
                      <Paperclip size={10} className="opacity-50" />
                      <span className="opacity-50 truncate max-w-[120px]">{attachment.filename || 'attachment'}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center gap-1 px-2 pb-2 overflow-x-auto">
                <button
                  onClick={() => void onToggleRead(message)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium active:bg-white/10 ml-auto"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <Check size={12} className="opacity-50" />
                  {message.unread ? 'Read' : 'Unread'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Message Header (collapsible) ───────────────────────────────────────────

function MiniAddressPill({ address }: { address: ParsedAddress }) {
  if (!address.email) return null;
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
    >
      {address.name && (
        <span className="text-[11px]" style={{ color: textColor() }}>
          {address.name}
        </span>
      )}
      <a
        href={`mailto:${address.email}`}
        className="text-[11px] opacity-60 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {address.email}
      </a>
    </span>
  );
}

function MiniDetailRow({ label, addresses }: { label: string; addresses: ParsedAddress[] }) {
  if (!addresses.length) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] uppercase tracking-wide opacity-40 w-12 shrink-0 pt-[3px]">
        {label}
      </span>
      <div className="flex-1 flex flex-wrap gap-1">
        {addresses.map((address, index) => (
          <MiniAddressPill key={`${label}-${address.email}-${index}`} address={address} />
        ))}
      </div>
    </div>
  );
}

function MiniMessageHeader({ message }: { message: EmailMessage }) {
  const [expanded, setExpanded] = useState(false);

  const fromAddress = useMemo(() => parseAddress(message.from), [message.from]);
  const toAddresses = useMemo(() => parseAddressList(message.to), [message.to]);
  const ccAddresses = useMemo(() => parseAddressList(message.cc), [message.cc]);
  const bccAddresses = useMemo(() => parseAddressList(message.bcc), [message.bcc]);
  const replyToAddresses = useMemo(() => parseAddressList(message.replyTo), [message.replyTo]);

  const senderDisplay = fromAddress.name || fromAddress.email || 'Unknown';
  const recipientSummary = useMemo(() => {
    if (toAddresses.length === 0) return '';
    const first = toAddresses[0];
    if (toAddresses.length === 1) return `To: ${first.email}`;
    return `To: ${first.email}, +${toAddresses.length - 1} more`;
  }, [toAddresses]);

  const hasExtraDetails = !!(
    ccAddresses.length
    || bccAddresses.length
    || replyToAddresses.length
    || toAddresses.length > 1
    || fromAddress.name
  );

  return (
    <div>
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-1.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
          style={{ backgroundColor: avatarHsl(senderDisplay) }}
        >
          {getInitial(senderDisplay)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: textColor() }}>
              {senderDisplay}
            </span>
            {fromAddress.email && fromAddress.name && (
              <span className="text-[11px] opacity-40 truncate">
                &lt;{fromAddress.email}&gt;
              </span>
            )}
            {message.unread && <Badge color="#3B82F6">Unread</Badge>}
          </div>
          {!expanded && (
            <p className="text-[11px] opacity-40 truncate">
              {recipientSummary}
              {ccAddresses.length > 0 && ` · cc ${ccAddresses.length}`}
              {bccAddresses.length > 0 && ` · bcc ${bccAddresses.length}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          <span className="text-[10px] opacity-40">
            {message.createdAt ? formatRelativeTime(message.createdAt) : formatRelativeTime(message.timestamp)}
          </span>
          {hasExtraDetails && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="p-0.5 rounded opacity-40 active:opacity-80"
              aria-label={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 pt-1 space-y-1.5">
          {fromAddress.email && <MiniDetailRow label="From" addresses={[fromAddress]} />}
          {replyToAddresses.length > 0 && <MiniDetailRow label="Reply-To" addresses={replyToAddresses} />}
          <MiniDetailRow label="To" addresses={toAddresses} />
          <MiniDetailRow label="Cc" addresses={ccAddresses} />
          <MiniDetailRow label="Bcc" addresses={bccAddresses} />
          {message.createdAt && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] uppercase tracking-wide opacity-40 w-12 shrink-0 pt-[3px]">
                Date
              </span>
              <span className="text-[11px] opacity-80" style={{ color: textColor() }}>
                {new Date(message.createdAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Email Setup Mini Panel ─────────────────────────────────────────────────

function EmailSetupMini({ onConfigured }: { onConfigured: () => Promise<void> | void }) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');

  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [creating, setCreating] = useState(false);
  const [upgrading, setUpgrading] = useState<'starter' | 'pro' | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  const isPaid = plan === 'pro' || plan === 'starter';
  const isNonProdEnv = environment === 'staging' || environment === 'local';

  // Load subscription + user info
  useEffect(() => {
    (async () => {
      const [sub, me, agentConfig] = await Promise.all([
        apiJSON<any>('/billing/subscription'),
        apiJSON<any>('/auth/me'),
        apiJSON<any>('/agent/config'),
      ]);
      setPlan(sub?.plan || 'free');
      setEnvironment(sub?.environment || null);
      const name = me?.user?.displayName || me?.user?.username || '';
      setDisplayName(name);
      // Prefer previously-typed inbox draft (from SetupWizard etc.)
      const existingDraft =
        agentConfig?.agentmail_inbox_username || agentConfig?.agentmailInboxUsername;
      if (existingDraft) {
        setUsername(String(existingDraft).replace(/@.*$/, '').toLowerCase());
      } else if (name && !initialized.current) {
        setUsername(generateEmailUsername(name));
        initialized.current = true;
      }
      setLoading(false);
    })();
  }, []);

  // Refetch subscription on focus while still free
  useEffect(() => {
    if (isPaid) return;
    const onFocus = async () => {
      const sub = await apiJSON<any>('/billing/subscription');
      if (sub?.plan) {
        setPlan(sub.plan);
        setEnvironment(sub.environment || null);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isPaid]);

  const runAvailabilityCheck = useCallback((next: string) => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!next) {
      setAvailable(null); setUsernameError(''); setSuggestion('');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(next) || next.length < 2) {
      setAvailable(false);
      setUsernameError('Use 2+ characters: letters, numbers, hyphens, dots.');
      setSuggestion('');
      return;
    }
    setChecking(true); setUsernameError(''); setSuggestion('');
    checkTimer.current = setTimeout(async () => {
      const res = await apiJSON<any>(`/agent/email/check?username=${encodeURIComponent(next)}`);
      setChecking(false);
      if (res) {
        setAvailable(!!res.available);
        if (!res.available) {
          setUsernameError(res.reason || 'Username already taken');
          setSuggestion(res.suggestion ? String(res.suggestion).replace(/@.*$/, '') : '');
        }
      } else {
        setAvailable(true);
      }
    }, 400);
  }, []);

  // Initial availability check for the auto-generated username
  useEffect(() => {
    if (isPaid && username && available === null && !checking) {
      runAvailabilityCheck(username);
    }
  }, [isPaid, username, available, checking, runAvailabilityCheck]);

  const handleUpgrade = async (targetPlan: 'starter' | 'pro') => {
    setUpgrading(targetPlan);
    haptic('light');
    try {
      if (isNonProdEnv) {
        const res = await api('/billing/switch-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: targetPlan }),
        });
        if (res.ok) {
          const sub = await apiJSON<any>('/billing/subscription');
          if (sub?.plan) {
            setPlan(sub.plan);
            setEnvironment(sub.environment || null);
          }
          toast.show(`Upgraded to ${targetPlan}`, 'success');
          haptic('success');
        } else {
          toast.show('Upgrade failed', 'error');
          haptic('error');
        }
      } else {
        const res = await api('/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: targetPlan }),
        });
        const data = res.ok ? await res.json().catch(() => null) : null;
        const url = data?.checkoutUrl;
        if (url) {
          const tg = window.Telegram?.WebApp as { openLink?: (url: string) => void } | undefined;
          if (tg?.openLink) tg.openLink(url);
          else window.open(url, '_blank');
        } else {
          toast.show('Could not start checkout', 'error');
          haptic('error');
        }
      }
    } finally {
      setUpgrading(null);
    }
  };

  const handleCreateInbox = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || available === false) return;
    setCreating(true);
    haptic('light');
    try {
      const res = await api('/agent/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentmail_inbox_username: trimmed }),
      });
      if (res.ok) {
        toast.show('Inbox created', 'success');
        haptic('success');
        await onConfigured();
      } else {
        const body = await res.json().catch(() => null);
        const msg = body?.error || 'Failed to create inbox';
        toast.show(msg, 'error');
        haptic('error');
      }
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
        <MiniHeader title="Email" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin opacity-40" />
        </div>
      </div>
    );
  }

  const canCreate = !!username.trim() && available !== false && !checking && !creating;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
      <MiniHeader title="Email" />
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-6">
        <div className="flex flex-col items-center text-center pt-6 pb-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
            <Mail size={24} style={{ color: '#10B981' }} />
          </div>
          <h2 className="text-[16px] font-semibold mb-1" style={{ color: textColor() }}>
            {isPaid ? "Claim your agent's email" : 'Give your agent its own email'}
          </h2>
          <p className="text-[12px] opacity-50 leading-relaxed max-w-[300px]" style={{ color: textColor() }}>
            {isPaid
              ? 'Pick a username — your agent will send and receive mail from this address.'
              : (
                <>
                  A real <span style={{ opacity: 0.9 }}>@agents.construct.computer</span>{' '}
                  inbox. Available on any paid plan.
                </>
              )}
          </p>
        </div>

        {isPaid ? (
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider opacity-40 mb-1.5 block">
                Username
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ backgroundColor: bg2() }}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    const v = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
                    setUsername(v);
                    runAvailabilityCheck(v);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreateInbox(); }}
                  placeholder="yourname"
                  autoFocus
                  className="flex-1 min-w-0 text-[14px] px-3.5 py-2.5 bg-transparent outline-none"
                  style={{ color: textColor() }}
                />
                <span className="text-[11px] opacity-40 px-2.5 py-2.5 whitespace-nowrap select-none">
                  @agents.construct.computer
                </span>
              </div>

              {/* Status */}
              <div className="min-h-[18px] mt-1.5 ml-1">
                {checking && (
                  <span className="flex items-center gap-1.5 text-[11px] opacity-50">
                    <Loader2 size={11} className="animate-spin" /> Checking…
                  </span>
                )}
                {!checking && available === true && username && (
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: '#10B981' }}>
                    <Check size={12} /> Available
                  </span>
                )}
                {!checking && available === false && (
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: '#EF4444' }}>
                      <AlertCircle size={12} /> {usernameError || 'Not available'}
                    </span>
                    {suggestion && (
                      <button
                        onClick={() => { setUsername(suggestion); runAvailabilityCheck(suggestion); }}
                        className="text-[11px] text-left ml-5 underline"
                        style={{ color: accent() }}
                      >
                        Try {suggestion}@agents.construct.computer
                      </button>
                    )}
                  </div>
                )}
                {!checking && available === null && username && (
                  <span className="text-[11px] opacity-40">
                    This address cannot be changed later.
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleCreateInbox}
              disabled={!canCreate}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: accent(), color: '#fff' }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {creating ? 'Creating…' : 'Create my inbox'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleUpgrade('starter')}
              disabled={!!upgrading}
              className="flex flex-col items-start gap-1 rounded-xl px-3.5 py-3 text-left active:brightness-90 disabled:opacity-50"
              style={{ backgroundColor: bg2() }}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[12px] font-semibold" style={{ color: textColor() }}>Starter</span>
                {upgrading === 'starter'
                  ? <Loader2 size={13} className="animate-spin opacity-50" />
                  : <ArrowRight size={13} className="opacity-30" />
                }
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-[17px] font-bold" style={{ color: textColor() }}>$59</span>
                <span className="text-[10px] opacity-40">/mo</span>
              </div>
              <span className="text-[10px] font-medium" style={{ color: '#10B981' }}>1-day free trial</span>
            </button>

            <button
              onClick={() => handleUpgrade('pro')}
              disabled={!!upgrading}
              className="flex flex-col items-start gap-1 rounded-xl px-3.5 py-3 text-left active:brightness-90 disabled:opacity-50 border"
              style={{
                backgroundColor: 'rgba(16,185,129,0.08)',
                borderColor: 'rgba(16,185,129,0.3)',
              }}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[12px] font-semibold flex items-center gap-1" style={{ color: textColor() }}>
                  Pro <Sparkles size={10} style={{ color: '#10B981' }} />
                </span>
                {upgrading === 'pro'
                  ? <Loader2 size={13} className="animate-spin" style={{ color: '#10B981' }} />
                  : <ArrowRight size={13} style={{ color: '#10B981' }} />
                }
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-[17px] font-bold" style={{ color: textColor() }}>$299</span>
                <span className="text-[10px] opacity-40">/mo</span>
              </div>
              <span className="text-[10px] font-medium" style={{ color: '#10B981' }}>3-day free trial</span>
            </button>
          </div>
        )}

        {!isPaid && (
          <p className="text-[10.5px] opacity-40 text-center mt-4 leading-relaxed">
            Already upgraded? We&apos;ll refresh automatically.
          </p>
        )}
      </div>
    </div>
  );
}
