/**
 * EmailWindow — Full email client.
 *
 * 3-pane layout:
 *   Left sidebar: folders/labels
 *   Center: thread list
 *   Right: thread detail / compose
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Inbox, Send, Pencil, RefreshCw, Loader2, ArrowLeft,
  Paperclip, Trash2, Reply, ReplyAll, Forward, Search,
  Mail, X,
} from 'lucide-react'
import type { WindowConfig } from '@/types'
import {
  getEmailStatus,
  listThreads,
  listMessages,
  getThread,
  sendMessage,
  replyToMessage,
  replyAllToMessage,
  forwardMessage,
  deleteThread,
  type AgentMailThread,
  type AgentMailThreadDetail,
  type AgentMailMessage,
} from '@/services/agentmail'
import { useWindowStore } from '@/stores/windowStore'
import { useComputerStore } from '@/stores/agentStore'

// ── Helpers ──

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function extractName(from: string): string {
  if (!from) return 'Unknown'
  const m = from.match(/^"?([^"<]+)"?\s*</)
  if (m) return m[1].trim()
  const at = from.indexOf('@')
  return at > 0 ? from.slice(0, at) : from
}

function extractEmail(from: string): string {
  if (!from) return ''
  const m = from.match(/<([^>]+)>/)
  return m ? m[1] : from
}

function getInitial(name: string): string {
  return (name[0] || '?').toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
]

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ── Types ──

type Folder = 'inbox' | 'sent'
type View = 'list' | 'thread'

interface ComposeState {
  mode: 'new' | 'reply' | 'reply_all' | 'forward'
  to: string
  cc: string
  subject: string
  body: string
  replyMessageId?: string
  threadId?: string
}

// ── Main Component ──

export function EmailWindow({ config: _config }: { config: WindowConfig }) {
  const [inboxId, setInboxId] = useState<string | null>(null)
  const [inboxEmail, setInboxEmail] = useState('')
  const [initError, setInitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [folder, setFolder] = useState<Folder>('inbox')
  const [view, setView] = useState<View>('list')
  const [threads, setThreads] = useState<AgentMailThread[]>([])
  const [selectedThread, setSelectedThread] = useState<AgentMailThreadDetail | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const [compose, setCompose] = useState<ComposeState | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Init ──
  const init = useCallback(async () => {
    setLoading(true)
    setInitError(null)
    try {
      const res = await getEmailStatus()
      if (res.error) { setInitError(res.error); return }
      if (!res.data?.configured) { setInitError('Email is available on the Pro plan. Upgrade in Settings > Subscription to give your agent its own @agents.construct.computer email.'); return }
      setInboxId(res.data.inboxId)
      setInboxEmail(res.data.email || '')
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { init() }, [init])
  useEffect(() => {
    const handler = () => { init() }
    window.addEventListener('agent-email-configured', handler)
    return () => window.removeEventListener('agent-email-configured', handler)
  }, [init])

  // ── Fetch messages (used as primary — threads API may return empty for sent-only inboxes) ──
  const fetchThreads = useCallback(async () => {
    if (!inboxId) return
    setListLoading(true)
    try {
      // Try threads first
      const threadRes = await listThreads(inboxId, { limit: 50 })
      if (threadRes.data?.threads && threadRes.data.threads.length > 0) {
        setThreads(threadRes.data.threads)
        return
      }
      // Fallback: use messages API and convert to thread-like format
      const msgRes = await listMessages(inboxId, { limit: 50 })
      if (msgRes.data?.messages) {
        const asThreads: AgentMailThread[] = msgRes.data.messages.map(m => ({
          inboxId: m.inboxId || inboxId,
          threadId: m.threadId || m.messageId,
          labels: m.labels || [],
          timestamp: m.timestamp,
          senders: [m.from],
          recipients: m.to || [],
          subject: m.subject,
          preview: m.preview || m.text?.slice(0, 100),
          lastMessageId: m.messageId,
          messageCount: 1,
          size: m.size || 0,
          updatedAt: m.updatedAt || m.timestamp,
          createdAt: m.createdAt || m.timestamp,
        }))
        setThreads(asThreads)
      }
    } catch { /* ignore */ } finally { setListLoading(false) }
  }, [inboxId])

  useEffect(() => {
    if (inboxId) fetchThreads()
  }, [inboxId, fetchThreads])

  useEffect(() => {
    if (!inboxId) return
    const iv = setInterval(fetchThreads, 30_000)
    return () => clearInterval(iv)
  }, [inboxId, fetchThreads])

  // Refresh when agent sends/receives an email (event from agentStore)
  useEffect(() => {
    const handler = () => { fetchThreads() }
    window.addEventListener('agent-email-refresh', handler)
    return () => window.removeEventListener('agent-email-refresh', handler)
  }, [fetchThreads])

  // Clear unread badge whenever the email window is open and threads are visible
  useEffect(() => {
    if (threads.length > 0) {
      useComputerStore.getState().clearEmailUnread()
    }
  }, [threads])

  // ── Open thread ──
  const openThread = useCallback(async (threadId: string) => {
    if (!inboxId) return
    setSelectedThreadId(threadId)
    setView('thread')
    setThreadLoading(true)
    // Clear unread badge when user reads a thread
    useComputerStore.getState().clearEmailUnread()
    try {
      const res = await getThread(inboxId, threadId)
      if (res.data) setSelectedThread(res.data)
    } catch { /* ignore */ } finally { setThreadLoading(false) }
  }, [inboxId])

  // ── Filter threads ──
  const filteredThreads = useMemo(() => {
    let list = threads
    if (folder === 'sent') {
      list = list.filter(t => (t.labels || []).includes('sent'))
    } else if (folder === 'inbox') {
      list = list.filter(t => !(t.labels || []).includes('sent'))
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        (t.subject || '').toLowerCase().includes(q) ||
        (t.senders || []).some(s => s.toLowerCase().includes(q))
      )
    }
    return list
  }, [threads, folder, searchQuery, inboxEmail])

  // ── Send / Reply / Forward ──
  const handleSend = useCallback(async () => {
    if (!inboxId || !compose) return
    setSending(true)
    setError(null)
    try {
      if (compose.mode === 'new') {
        const to = compose.to.split(',').map(s => s.trim()).filter(Boolean)
        const cc = compose.cc ? compose.cc.split(',').map(s => s.trim()).filter(Boolean) : undefined
        await sendMessage(inboxId, { to, subject: compose.subject, text: compose.body, cc })
      } else if (compose.mode === 'reply' && compose.replyMessageId) {
        await replyToMessage(inboxId, compose.replyMessageId, { text: compose.body })
      } else if (compose.mode === 'reply_all' && compose.replyMessageId) {
        await replyAllToMessage(inboxId, compose.replyMessageId, { text: compose.body })
      } else if (compose.mode === 'forward' && compose.replyMessageId) {
        await forwardMessage(inboxId, compose.replyMessageId, { to: compose.to, text: compose.body })
      }
      setCompose(null)
      fetchThreads()
      if (selectedThreadId) openThread(selectedThreadId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally { setSending(false) }
  }, [inboxId, compose, fetchThreads, selectedThreadId, openThread])

  // ── Delete thread ──
  const handleDeleteThread = useCallback(async (threadId: string) => {
    if (!inboxId) return
    try {
      await deleteThread(inboxId, threadId)
      setThreads(ts => ts.filter(t => t.threadId !== threadId))
      if (selectedThreadId === threadId) {
        setView('list')
        setSelectedThread(null)
        setSelectedThreadId(null)
      }
    } catch { /* ignore */ }
  }, [inboxId, selectedThreadId])

  // ── Compose helpers ──
  const startCompose = () => setCompose({ mode: 'new', to: '', cc: '', subject: '', body: '' })
  const startReply = (msg: AgentMailMessage) => setCompose({
    mode: 'reply', to: msg.from || '', cc: '', subject: `Re: ${msg.subject || ''}`,
    body: '', replyMessageId: msg.messageId, threadId: msg.threadId,
  })
  const startReplyAll = (msg: AgentMailMessage) => {
    const allRecipients = [...(msg.to || []), ...(msg.cc || [])].filter(r => extractEmail(r).toLowerCase() !== inboxEmail.toLowerCase())
    setCompose({
      mode: 'reply_all', to: msg.from || '', cc: allRecipients.join(', '),
      subject: `Re: ${msg.subject || ''}`, body: '',
      replyMessageId: msg.messageId, threadId: msg.threadId,
    })
  }
  const startForward = (msg: AgentMailMessage) => {
    const fwdBody = `\n\n---------- Forwarded message ----------\nFrom: ${msg.from}\nDate: ${msg.createdAt ? formatFullDate(msg.createdAt) : ''}\nSubject: ${msg.subject || ''}\n\n${msg.extractedText || msg.text || ''}`
    setCompose({
      mode: 'forward', to: '', cc: '', subject: `Fwd: ${msg.subject || ''}`,
      body: fwdBody, replyMessageId: msg.messageId, threadId: msg.threadId,
    })
  }

  // ── Loading / Error ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--color-surface)]">
        <Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    )
  }
  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] gap-3 p-6 text-center">
        <Mail size={32} className="text-[var(--color-text-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-text-muted)]">{initError}</p>
        <button onClick={() => useWindowStore.getState().openWindow('settings')}
          className="text-xs text-[var(--color-accent)] hover:underline">Open Settings</button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-[var(--color-surface)] text-sm overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-[170px] shrink-0 min-h-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden">
        <div className="p-2">
          <button onClick={startCompose}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:brightness-110 transition">
            <Pencil size={13} /> Compose
          </button>
        </div>

        <nav className="flex-1 px-1.5 space-y-0.5">
          {([
            { id: 'inbox' as Folder, icon: Inbox, label: 'Inbox', count: threads.filter(t => !(t.labels || []).includes('sent')).length },
            { id: 'sent' as Folder, icon: Send, label: 'Sent', count: threads.filter(t => (t.labels || []).includes('sent')).length },
          ]).map(f => (
            <button key={f.id} onClick={() => { setFolder(f.id); setView('list'); setSearchQuery('') }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition ${
                folder === f.id
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-medium'
                  : 'text-[var(--color-text-muted)] hover:bg-white/5'
              }`}>
              <f.icon size={14} />
              <span className="flex-1 text-left">{f.label}</span>
              {f.count > 0 && <span className="text-[10px] opacity-60">{f.count}</span>}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-[var(--color-border)]">
          <p className="text-[10px] text-[var(--color-text-muted)] truncate" title={inboxEmail}>{inboxEmail}</p>
        </div>
      </div>

      {/* ── Thread list ── */}
      <div className={`${view === 'thread' ? 'w-[260px] shrink-0' : 'flex-1'} min-h-0 min-w-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden`}>
        {/* Thread list toolbar */}
        <div className="shrink-0 flex items-center gap-1 px-3 h-10 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
          {searchOpen ? (
            <>
              <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search emails..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]"
                onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') } }}
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/10">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-xs font-medium truncate">{folder === 'inbox' ? 'Inbox' : 'Sent'}</span>
              <button onClick={() => setSearchOpen(true)}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/10"
                title="Search">
                <Search size={16} />
              </button>
              <button onClick={fetchThreads}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/10"
                title="Refresh">
                <RefreshCw size={16} className={listLoading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2">
              <Mail size={24} className="opacity-40" />
              <p className="text-xs">{searchQuery ? 'No results' : 'No emails'}</p>
            </div>
          ) : (
            filteredThreads.map(thread => {
              const isSelected = selectedThreadId === thread.threadId && view === 'thread'
              const sender = extractName((thread.senders || ['Unknown'])[0])
              const hasAttachment = (thread.attachments || []).length > 0
              return (
                <button key={thread.threadId} onClick={() => openThread(thread.threadId)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[var(--color-border)] transition ${
                    isSelected ? 'bg-[var(--color-accent)]/10' : 'hover:bg-white/5'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full ${avatarColor(sender)} flex items-center justify-center text-white text-[11px] font-semibold shrink-0`}>
                      {getInitial(sender)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium truncate flex-1">{sender}</span>
                        {(thread.messageCount || 0) > 1 && (
                          <span className="text-[10px] text-[var(--color-text-muted)]">({thread.messageCount})</span>
                        )}
                        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                          {thread.updatedAt ? formatRelativeTime(thread.updatedAt) : ''}
                        </span>
                      </div>
                      <p className="text-[11px] truncate">{thread.subject || '(no subject)'}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] truncate">{thread.preview || ''}</p>
                    </div>
                    {hasAttachment && <Paperclip size={11} className="text-[var(--color-text-muted)] shrink-0" />}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Thread detail ── */}
      {view === 'thread' && (
        <ThreadDetailPane
          thread={selectedThread}
          loading={threadLoading}
          inboxEmail={inboxEmail}
          onBack={() => { setView('list'); setSelectedThread(null); setSelectedThreadId(null) }}
          onReply={startReply}
          onReplyAll={startReplyAll}
          onForward={startForward}
          onDelete={() => selectedThreadId && handleDeleteThread(selectedThreadId)}
        />
      )}

      {/* ── Compose overlay ── */}
      {compose && (
        <ComposePane
          compose={compose}
          onChange={setCompose}
          onSend={handleSend}
          onCancel={() => setCompose(null)}
          sending={sending}
          error={error}
        />
      )}
    </div>
  )
}

// ── Thread Detail Pane ──

function ThreadDetailPane({ thread, loading, inboxEmail, onBack, onReply, onReplyAll, onForward, onDelete }: {
  thread: AgentMailThreadDetail | null
  loading: boolean
  inboxEmail: string
  onBack: () => void
  onReply: (msg: AgentMailMessage) => void
  onReplyAll: (msg: AgentMailMessage) => void
  onForward: (msg: AgentMailMessage) => void
  onDelete: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (thread && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [thread])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    )
  }
  if (!thread) return null

  const messages = thread.messages || []
  const lastMsg = messages[messages.length - 1]

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--color-surface)] h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        <button onClick={onBack} className="p-1 rounded hover:bg-white/10 shrink-0">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium truncate">{thread.subject || '(no subject)'}</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] truncate">
            {(thread.senders || []).map(s => extractName(s)).join(', ')} &middot; {messages.length} message{messages.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={onDelete} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map(msg => {
          const isOwn = extractEmail(msg.from || '').toLowerCase() === inboxEmail.toLowerCase()
          const sender = extractName(msg.from || '')
          const body = msg.extractedText || msg.text || ''

          return (
            <div key={msg.messageId} className={`group ${isOwn ? 'ml-8' : 'mr-8'}`}>
              <div className={`rounded-lg border border-[var(--color-border)] ${isOwn ? 'bg-[var(--color-accent)]/5' : 'bg-[var(--color-surface-raised)]'}`}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
                  <div className={`w-6 h-6 rounded-full ${avatarColor(sender)} flex items-center justify-center text-white text-[10px] font-semibold shrink-0`}>
                    {getInitial(sender)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium">{sender}</span>
                    {msg.to && (
                      <span className="text-[10px] text-[var(--color-text-muted)] ml-1">
                        to {msg.to.map(t => extractName(t)).join(', ')}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                    {msg.createdAt ? formatFullDate(msg.createdAt) : ''}
                  </span>
                </div>

                <div className="px-3 py-2.5 text-xs whitespace-pre-wrap leading-relaxed">
                  {body}
                </div>

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="px-3 pb-2 flex flex-wrap gap-1">
                    {msg.attachments.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-surface)] text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                        <Paperclip size={9} /> {a.filename || 'attachment'}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-0.5 px-2 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onReply(msg)} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]" title="Reply">
                    <Reply size={12} />
                  </button>
                  <button onClick={() => onReplyAll(msg)} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]" title="Reply All">
                    <ReplyAll size={12} />
                  </button>
                  <button onClick={() => onForward(msg)} className="p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]" title="Forward">
                    <Forward size={12} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick reply */}
      {lastMsg && (
        <div className="border-t border-[var(--color-border)] p-2">
          <button onClick={() => onReply(lastMsg)}
            className="w-full text-left px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-white/5 transition">
            Reply to {extractName(lastMsg.from || '')}...
          </button>
        </div>
      )}
    </div>
  )
}

// ── Compose Pane ──

function ComposePane({ compose, onChange, onSend, onCancel, sending, error }: {
  compose: ComposeState
  onChange: (c: ComposeState) => void
  onSend: () => void
  onCancel: () => void
  sending: boolean
  error: string | null
}) {
  const modeLabel = compose.mode === 'new' ? 'New Email' :
    compose.mode === 'reply' ? 'Reply' :
    compose.mode === 'reply_all' ? 'Reply All' : 'Forward'

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-titlebar)]">
        <button onClick={onCancel} className="p-1 rounded hover:bg-white/10">
          <X size={14} />
        </button>
        <span className="text-xs font-medium flex-1">{modeLabel}</span>
        <button onClick={onSend} disabled={sending || !compose.to.trim() || (compose.mode === 'new' && !compose.subject.trim())}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium disabled:opacity-50 hover:brightness-110 transition">
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Send
        </button>
      </div>

      <div className="border-b border-[var(--color-border)]">
        <div className="flex items-center px-3 py-1.5 border-b border-[var(--color-border)]">
          <span className="text-[11px] text-[var(--color-text-muted)] w-10 shrink-0">To</span>
          <input value={compose.to} onChange={e => onChange({ ...compose, to: e.target.value })}
            placeholder="recipient@example.com"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]"
            disabled={compose.mode === 'reply' || compose.mode === 'reply_all'}
          />
        </div>
        {(compose.mode === 'new' || compose.mode === 'reply_all') && (
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--color-border)]">
            <span className="text-[11px] text-[var(--color-text-muted)] w-10 shrink-0">Cc</span>
            <input value={compose.cc} onChange={e => onChange({ ...compose, cc: e.target.value })}
              placeholder="cc@example.com"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </div>
        )}
        <div className="flex items-center px-3 py-1.5">
          <span className="text-[11px] text-[var(--color-text-muted)] w-10 shrink-0">Subj</span>
          <input value={compose.subject} onChange={e => onChange({ ...compose, subject: e.target.value })}
            placeholder="Subject"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]"
            disabled={compose.mode === 'reply' || compose.mode === 'reply_all'}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <textarea
          autoFocus
          value={compose.body}
          onChange={e => onChange({ ...compose, body: e.target.value })}
          placeholder="Write your message..."
          className="w-full h-full bg-transparent text-xs outline-none resize-none leading-relaxed placeholder:text-[var(--color-text-muted)]"
        />
      </div>

      {error && (
        <div className="px-3 py-1.5 border-t border-[var(--color-border)] bg-[var(--color-error-muted)] text-[var(--color-error)] text-[11px]">
          {error}
        </div>
      )}
    </div>
  )
}
