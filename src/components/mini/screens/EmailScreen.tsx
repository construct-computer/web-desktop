/**
 * EmailScreen — Full-featured mobile email client for the Telegram Mini App.
 * Inbox/Sent toggle, thread list with search, thread detail with per-message
 * actions, compose/reply/forward, delete with confirmation, mark read/unread,
 * attachment indicators, skeleton loading, empty states, 30s auto-refresh.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Mail, Send, Inbox, Search, Pencil, Trash2, RefreshCw,
  Reply, ReplyAll, Forward, Paperclip, X, MailOpen, Download,
} from 'lucide-react';
import {
  MiniHeader, Card, ConfirmDialog, useToast, haptic,
  SkeletonList, EmptyState, Badge, Field, IconBtn,
  api, apiJSON, accent, bg, bg2, textColor, formatRelativeTime,
} from '../ui';

// ── Types ──

interface EmailThread {
  threadId: string;
  senders: string[];
  recipients: string[];
  subject?: string;
  preview?: string;
  messageCount: number;
  timestamp: string;
  updatedAt?: string;
  labels: string[];
  attachments?: Array<{ filename?: string }>;
}

interface EmailMessage {
  messageId: string;
  from: string;
  to: string[];
  cc?: string[];
  subject?: string;
  text?: string;
  extractedText?: string;
  timestamp: string;
  createdAt?: string;
  labels?: string[];
  attachments?: Array<{ filename?: string; contentType?: string; size?: number; url?: string }>;
}

interface ThreadDetail {
  threadId: string;
  subject?: string;
  senders?: string[];
  messages: EmailMessage[];
}

type Folder = 'inbox' | 'sent';
type ComposeMode = 'new' | 'reply' | 'reply_all' | 'forward';

interface ComposeState {
  mode: ComposeMode;
  to: string;
  cc: string;
  subject: string;
  body: string;
  replyMessageId?: string;
}

// ── Helpers ──

function extractName(from: string): string {
  if (!from) return 'Unknown';
  const m = from.match(/^"?([^"<]+)"?\s*</);
  if (m) return m[1].trim();
  const at = from.indexOf('@');
  return at > 0 ? from.slice(0, at) : from;
}

function extractEmail(from: string): string {
  if (!from) return '';
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from;
}

function avatarHsl(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 50%, 35%)`;
}

function getInitial(name: string): string {
  return (name[0] || '?').toUpperCase();
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Main Component ──

export function EmailScreen() {
  const toast = useToast();

  const [folder, setFolder] = useState<Folder>('inbox');
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedThread, setSelectedThread] = useState<ThreadDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [sending, setSending] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Fetch threads ──

  const fetchThreads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await apiJSON<any>('/email/threads?limit=50');
    if (data) {
      const list: EmailThread[] = Array.isArray(data) ? data : (data.threads || []);
      setThreads(list);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(() => fetchThreads(true), 30_000);
    return () => clearInterval(iv);
  }, [fetchThreads]);

  const handleRefresh = async () => {
    setRefreshing(true);
    haptic('light');
    await fetchThreads();
  };

  // ── Filter threads ──

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (folder === 'sent') {
      list = list.filter(t => (t.labels || []).some(l => l.toLowerCase() === 'sent'));
    } else {
      list = list.filter(t => !(t.labels || []).some(l => l.toLowerCase() === 'sent'));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        (t.subject || '').toLowerCase().includes(q) ||
        (t.senders || []).some(s => s.toLowerCase().includes(q))
      );
    }
    return list;
  }, [threads, folder, searchQuery]);

  // ── Open thread ──

  const openThread = useCallback(async (threadId: string) => {
    setThreadLoading(true);
    haptic('light');
    const data = await apiJSON<ThreadDetail>(`/email/threads/${threadId}`);
    if (data) setSelectedThread(data);
    setThreadLoading(false);
  }, []);

  // ── Delete thread ──

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const res = await api(`/email/threads/${deleteTarget}`, { method: 'DELETE' });
    if (res.ok) {
      toast.show('Thread deleted', 'success');
      haptic('success');
      setThreads(ts => ts.filter(t => t.threadId !== deleteTarget));
      if (selectedThread?.threadId === deleteTarget) setSelectedThread(null);
    } else {
      toast.show('Failed to delete thread', 'error');
      haptic('error');
    }
    setDeleteTarget(null);
  }, [deleteTarget, selectedThread, toast]);

  // ── Mark read / unread ──

  const toggleReadStatus = useCallback(async (messageId: string, currentlyUnread: boolean) => {
    const body = currentlyUnread
      ? { removeLabels: ['UNREAD'] }
      : { addLabels: ['UNREAD'] };
    const res = await api(`/email/messages/${messageId}/labels`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.show(currentlyUnread ? 'Marked as read' : 'Marked as unread', 'success');
      haptic('success');
      fetchThreads(true);
    } else {
      toast.show('Failed to update', 'error');
    }
  }, [toast, fetchThreads]);

  // ── Compose helpers ──

  const startCompose = () => setCompose({ mode: 'new', to: '', cc: '', subject: '', body: '' });

  const startReply = (msg: EmailMessage) => setCompose({
    mode: 'reply', to: msg.from || '', cc: '',
    subject: `Re: ${msg.subject || ''}`, body: '',
    replyMessageId: msg.messageId,
  });

  const startReplyAll = (msg: EmailMessage) => {
    const allCc = [...(msg.to || []), ...(msg.cc || [])].join(', ');
    setCompose({
      mode: 'reply_all', to: msg.from || '', cc: allCc,
      subject: `Re: ${msg.subject || ''}`, body: '',
      replyMessageId: msg.messageId,
    });
  };

  const startForward = (msg: EmailMessage) => {
    const fwdBody = `\n\n---------- Forwarded message ----------\nFrom: ${msg.from}\nDate: ${msg.createdAt ? formatFullDate(msg.createdAt) : ''}\nSubject: ${msg.subject || ''}\n\n${msg.extractedText || msg.text || ''}`;
    setCompose({
      mode: 'forward', to: '', cc: '',
      subject: `Fwd: ${msg.subject || ''}`, body: fwdBody,
      replyMessageId: msg.messageId,
    });
  };

  // ── Send ──

  const handleSend = useCallback(async () => {
    if (!compose) return;
    setSending(true);
    let url = '/email/send';
    let payload: Record<string, any> = { to: compose.to.trim(), subject: compose.subject.trim(), body: compose.body.trim() };

    if (compose.cc.trim()) payload.cc = compose.cc.trim();

    if (compose.mode === 'reply' && compose.replyMessageId) {
      url = `/email/reply/${compose.replyMessageId}`;
      payload = { body: compose.body.trim() };
    } else if (compose.mode === 'reply_all' && compose.replyMessageId) {
      url = `/email/reply-all/${compose.replyMessageId}`;
      payload = { body: compose.body.trim() };
    } else if (compose.mode === 'forward' && compose.replyMessageId) {
      url = `/email/forward/${compose.replyMessageId}`;
      payload = { to: compose.to.trim(), body: compose.body.trim() };
    }

    const res = await api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.show('Email sent', 'success');
      haptic('success');
      setCompose(null);
      fetchThreads(true);
      if (selectedThread) openThread(selectedThread.threadId);
    } else {
      toast.show('Failed to send email', 'error');
      haptic('error');
    }
    setSending(false);
  }, [compose, toast, fetchThreads, selectedThread, openThread]);

  // ── Compose view ──

  if (compose) {
    const modeLabel = compose.mode === 'new' ? 'New Email'
      : compose.mode === 'reply' ? 'Reply'
      : compose.mode === 'reply_all' ? 'Reply All' : 'Forward';

    const canSend = compose.to.trim() && compose.body.trim() && (compose.mode !== 'new' || compose.subject.trim());

    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
        <MiniHeader
          title={modeLabel}
          onBack={() => setCompose(null)}
          actions={
            <button
              onClick={handleSend}
              disabled={!canSend || sending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-medium disabled:opacity-30"
              style={{ backgroundColor: accent(), color: '#fff' }}
            >
              {sending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              Send
            </button>
          }
        />

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {(compose.mode === 'new' || compose.mode === 'forward') && (
            <Field label="To" value={compose.to} onChange={v => setCompose({ ...compose, to: v })} placeholder="recipient@example.com" />
          )}
          {compose.mode === 'reply' && (
            <Field label="To" value={compose.to} disabled />
          )}
          {compose.mode === 'reply_all' && (
            <>
              <Field label="To" value={compose.to} disabled />
              <Field label="CC" value={compose.cc} onChange={v => setCompose({ ...compose, cc: v })} placeholder="cc@example.com" />
            </>
          )}
          {compose.mode === 'new' && (
            <>
              <Field label="CC" value={compose.cc} onChange={v => setCompose({ ...compose, cc: v })} placeholder="cc@example.com" />
              <Field label="Subject" value={compose.subject} onChange={v => setCompose({ ...compose, subject: v })} placeholder="Subject" />
            </>
          )}
          {(compose.mode === 'reply' || compose.mode === 'reply_all' || compose.mode === 'forward') && (
            <Field label="Subject" value={compose.subject} disabled />
          )}

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider opacity-40 mb-1 block">Body</label>
            <textarea
              autoFocus
              value={compose.body}
              onChange={e => setCompose({ ...compose, body: e.target.value })}
              placeholder="Write your message..."
              className="w-full text-[14px] px-3.5 py-2.5 rounded-xl outline-none resize-none min-h-[180px]"
              style={{ backgroundColor: bg2(), color: textColor() }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Thread detail view ──

  if (selectedThread || threadLoading) {
    return (
      <ThreadDetailView
        thread={selectedThread}
        loading={threadLoading}
        onBack={() => setSelectedThread(null)}
        onReply={startReply}
        onReplyAll={startReplyAll}
        onForward={startForward}
        onDelete={threadId => setDeleteTarget(threadId)}
        onToggleRead={toggleReadStatus}
      />
    );
  }

  // ── Thread list / Inbox ──

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
      <MiniHeader
        title="Email"
        actions={
          <div className="flex items-center gap-0.5">
            <IconBtn onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}>
              {searchOpen ? <X size={16} className="opacity-50" /> : <Search size={16} className="opacity-50" />}
            </IconBtn>
            <IconBtn onClick={handleRefresh}>
              <RefreshCw size={16} className={`opacity-50 ${refreshing ? 'animate-spin' : ''}`} />
            </IconBtn>
            <IconBtn onClick={startCompose}>
              <Pencil size={16} className="opacity-50" />
            </IconBtn>
          </div>
        }
      />

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 pb-2">
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by subject or sender..."
            className="w-full text-[13px] px-3.5 py-2 rounded-xl outline-none"
            style={{ backgroundColor: bg2(), color: textColor() }}
          />
        </div>
      )}

      {/* Folder tabs */}
      <div className="flex gap-2 px-4 pb-2">
        {(['inbox', 'sent'] as Folder[]).map(f => {
          const active = folder === f;
          const Icon = f === 'inbox' ? Inbox : Send;
          const count = threads.filter(t => {
            const isSent = (t.labels || []).some(l => l.toLowerCase() === 'sent');
            return f === 'sent' ? isSent : !isSent;
          }).length;
          return (
            <button
              key={f}
              onClick={() => { setFolder(f); haptic('light'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: active ? `${accent()}25` : 'rgba(255,255,255,0.04)',
                color: active ? accent() : 'rgba(255,255,255,0.4)',
              }}
            >
              <Icon size={13} />
              {f === 'inbox' ? 'Inbox' : 'Sent'}
              {count > 0 && (
                <span className="text-[10px] opacity-60 ml-0.5">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <SkeletonList count={6} />
        ) : filteredThreads.length === 0 ? (
          <EmptyState
            icon={Mail}
            message={searchQuery ? 'No matching emails' : folder === 'sent' ? 'No sent emails' : 'Your inbox is empty'}
          />
        ) : (
          <div className="space-y-1.5">
            {filteredThreads.map(thread => {
              const sender = extractName((thread.senders || ['Unknown'])[0]);
              const isUnread = (thread.labels || []).some(l => l.toUpperCase() === 'UNREAD');
              const hasAttachment = (thread.attachments || []).length > 0;
              const ts = thread.updatedAt || thread.timestamp;

              return (
                <Card key={thread.threadId} onClick={() => openThread(thread.threadId)}>
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                      style={{ backgroundColor: avatarHsl(sender) }}
                    >
                      {getInitial(sender)}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Row 1: sender + meta */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[13px] truncate flex-1 ${isUnread ? 'font-semibold' : 'font-medium opacity-70'}`}
                          style={{ color: textColor() }}
                        >
                          {sender}
                        </span>
                        {(thread.messageCount || 0) > 1 && (
                          <Badge>{thread.messageCount}</Badge>
                        )}
                        {hasAttachment && <Paperclip size={11} className="opacity-30 shrink-0" />}
                        <span className="text-[10px] opacity-30 shrink-0">
                          {ts ? formatRelativeTime(ts) : ''}
                        </span>
                      </div>

                      {/* Row 2: subject */}
                      <p
                        className={`text-[12px] truncate mt-0.5 ${isUnread ? 'font-medium' : 'opacity-50'}`}
                        style={{ color: textColor() }}
                      >
                        {thread.subject || '(no subject)'}
                      </p>

                      {/* Row 3: preview */}
                      {thread.preview && (
                        <p className="text-[11px] opacity-30 truncate mt-0.5">
                          {thread.preview}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Thread"
          message="This will permanently delete the entire thread. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Thread Detail View ──

function ThreadDetailView({ thread, loading, onBack, onReply, onReplyAll, onForward, onDelete, onToggleRead }: {
  thread: ThreadDetail | null;
  loading: boolean;
  onBack: () => void;
  onReply: (msg: EmailMessage) => void;
  onReplyAll: (msg: EmailMessage) => void;
  onForward: (msg: EmailMessage) => void;
  onDelete: (threadId: string) => void;
  onToggleRead: (messageId: string, currentlyUnread: boolean) => void;
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
        <MiniHeader title="Loading..." onBack={onBack} />
        <SkeletonList count={3} />
      </div>
    );
  }

  const messages = thread.messages || [];

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: bg() }}>
      <MiniHeader
        title={thread.subject || '(no subject)'}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-0.5">
            <IconBtn onClick={() => onDelete(thread.threadId)}>
              <Trash2 size={16} className="opacity-50" />
            </IconBtn>
          </div>
        }
      />

      {/* Message count summary */}
      <div className="px-4 py-1.5">
        <span className="text-[11px] opacity-30">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
          {thread.senders && thread.senders.length > 0 && (
            <> from {thread.senders.map(s => extractName(s)).join(', ')}</>
          )}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {messages.map(msg => {
          const sender = extractName(msg.from || '');
          const body = msg.extractedText || msg.text || '';
          const isUnread = (msg.labels || []).some(l => l.toUpperCase() === 'UNREAD');

          return (
            <div key={msg.messageId} className="rounded-xl overflow-hidden" style={{ backgroundColor: bg2() }}>
              {/* Message header */}
              <div className="flex items-start gap-2.5 px-3 pt-3 pb-1.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                  style={{ backgroundColor: avatarHsl(sender) }}
                >
                  {getInitial(sender)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium truncate" style={{ color: textColor() }}>
                      {sender}
                    </span>
                    {isUnread && <Badge color="#3B82F6">Unread</Badge>}
                  </div>
                  {msg.to && msg.to.length > 0 && (
                    <p className="text-[11px] opacity-30 truncate">
                      To: {msg.to.map(t => extractName(t)).join(', ')}
                      {msg.cc && msg.cc.length > 0 && ` | CC: ${msg.cc.map(c => extractName(c)).join(', ')}`}
                    </p>
                  )}
                </div>
                <span className="text-[10px] opacity-30 shrink-0 pt-0.5">
                  {msg.createdAt ? formatRelativeTime(msg.createdAt) : msg.timestamp ? formatRelativeTime(msg.timestamp) : ''}
                </span>
              </div>

              {/* Body */}
              <div className="px-3 py-2 text-[13px] leading-relaxed opacity-80 whitespace-pre-wrap" style={{ color: textColor() }}>
                {body}
              </div>

              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                  {msg.attachments.map((a, i) => (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (a.url) window.open(a.url, '_blank');
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] active:bg-white/10"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    >
                      {a.url ? <Download size={10} className="opacity-50" /> : <Paperclip size={10} className="opacity-50" />}
                      <span className="opacity-50 truncate max-w-[120px]">{a.filename || 'attachment'}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Action buttons - on every message */}
              <div className="flex items-center gap-1 px-2 pb-2">
                <button
                  onClick={() => onReply(msg)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium active:bg-white/10"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <Reply size={12} className="opacity-50" /> Reply
                </button>
                <button
                  onClick={() => onReplyAll(msg)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium active:bg-white/10"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <ReplyAll size={12} className="opacity-50" /> All
                </button>
                <button
                  onClick={() => onForward(msg)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium active:bg-white/10"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <Forward size={12} className="opacity-50" /> Fwd
                </button>
                <button
                  onClick={() => onToggleRead(msg.messageId, isUnread)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium active:bg-white/10 ml-auto"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <MailOpen size={12} className="opacity-50" />
                  {isUnread ? 'Read' : 'Unread'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
