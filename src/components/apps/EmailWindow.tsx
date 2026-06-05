/**
 * EmailWindow — production-style mailbox client for desktop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  ArrowLeft,
  Paperclip,
  Trash2,
  Search,
  Mail,
  MailOpen,
  ChevronDown,
  ChevronUp,
  X,
  Check,
} from 'lucide-react';
import type { WindowConfig } from '@/types';
import {
  deleteThread,
  downloadAttachment,
  deleteDraft,
  extractEmail,
  extractName,
  getEmailStatus,
  getMailboxItemId,
  getThread,
  isDraftItem,
  isThreadItem,
  listMailbox,
  markThreadUnreadState,
  sendDraft,
  updateMessageLabels,
  type EmailDraft,
  type EmailMessage,
  parseAddress,
  parseAddressList,
  type EmailThread,
  type EmailThreadDetail,
  type MailboxFolder,
  type MailboxItem,
  type ParsedAddress,
} from '@/services/emailMailbox';
import { useComputerStore } from '@/stores/agentStore';
import { EmailSetupPane } from './EmailSetupPane';
import { EmailHtmlBody } from './email/EmailHtmlBody';
import { formatRelativeTimeShort } from '@/lib/format';
import { getEmailAvatarClass, getEmailInitial } from '@/services/emailUi';
import { FreshnessText, RefreshButton, StatusBanner, AnimatedListItem, AnimatedListContainer } from '@/components/ui';
import { useFreshness } from '@/hooks/useFreshness';
import { useAnimatedList } from '@/hooks/useAnimatedList';

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const MAILBOX_FOLDERS: Array<{ key: MailboxFolder; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'outbox', label: 'Outbox' },
  { key: 'trash', label: 'Trash' },
];

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  className = '',
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const active = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
          : 'border-white/25 bg-transparent hover:border-white/50 hover:bg-white/5'
      } ${className}`}
    >
      {indeterminate ? (
        <span className="block h-0.5 w-2 rounded-full bg-white" />
      ) : checked ? (
        <Check size={11} strokeWidth={3} />
      ) : null}
    </button>
  );
}

function dedupeMailboxItems(items: MailboxItem[]) {
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

export function EmailWindow(props: { config: WindowConfig }) {
  void props;
  const [inboxEmail, setInboxEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [items, setItems] = useState<MailboxItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listPending, setListPending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [folder, setFolder] = useState<MailboxFolder>('all');

  const [selectedThread, setSelectedThread] = useState<EmailThreadDetail | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [pendingAction, setPendingAction] = useState<null | 'read' | 'unread' | 'delete'>(null);
  const [pendingDraftAction, setPendingDraftAction] = useState<null | 'send' | 'delete'>(null);

  const selectedCount = useMemo(
    () => Object.values(selection).filter(Boolean).length,
    [selection],
  );

  const selectedIds = useMemo(
    () => new Set(Object.keys(selection).filter((key) => selection[key])),
    [selection],
  );

  const visibleThreadIds = useMemo(
    () => items.filter(isThreadItem).map((item) => getMailboxItemId(item)),
    [items],
  );

  const allVisibleSelected = visibleThreadIds.length > 0
    && visibleThreadIds.every((id) => selection[id]);
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected;

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelection({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const id of visibleThreadIds) next[id] = true;
    setSelection(next);
  }, [allVisibleSelected, visibleThreadIds]);

  const loadMailbox = useCallback(async (reset = true, opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const hasItems = itemsRef.current.length > 0;
    if (reset) {
      if (silent || hasItems) {
        if (!silent && hasItems) setListPending(true);
      } else {
        setListLoading(true);
      }
    } else {
      setLoadingMore(true);
    }

    const result = await listMailbox({
      folder,
      limit: 30,
      pageToken: reset ? undefined : nextPageToken,
      query: searchQuery || undefined,
    });

    if (result.success && result.data) {
      setItems((prev) => (reset ? result.data!.items : dedupeMailboxItems([...prev, ...result.data!.items])));
      setNextPageToken(result.data.nextPageToken);
      setActionError(null);
    } else if (result.error) {
      setActionError(result.error);
    }

    setListLoading(false);
    setListPending(false);
    setLoadingMore(false);
  }, [folder, nextPageToken, searchQuery]);

  const init = useCallback(async () => {
    setLoading(true);
    setNotConfigured(false);
    setInitError(null);
    const status = await getEmailStatus();
    if (!status.success) {
      setInitError(status.error || 'Failed to load email');
      setLoading(false);
      return;
    }
    if (!status.data?.configured) {
      setNotConfigured(true);
      setLoading(false);
      return;
    }

    setInboxEmail(status.data.email || '');
    setLoading(false);
  }, []);

  const mailboxFreshness = useFreshness(
    () => loadMailbox(true, { silent: true }),
    {
      enabled: !loading && !notConfigured && !initError,
      intervalMs: 30_000,
      staleMs: 75_000,
      refreshOnFocus: true,
      refreshOnOnline: true,
    },
  );
  const { refreshNow } = mailboxFreshness;

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (loading || notConfigured || initError) return;
    void loadMailbox(true, { silent: itemsRef.current.length > 0 });
  }, [loading, notConfigured, initError, searchQuery, folder, loadMailbox]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setSelection({});
    setSelectedThread(null);
    setSelectedDraft(null);
  }, [folder, searchQuery]);

  useEffect(() => {
    const handler = () => {
      void init();
      void refreshNow();
    };
    window.addEventListener('agent-email-configured', handler);
    window.addEventListener('agent-email-refresh', handler);
    return () => {
      window.removeEventListener('agent-email-configured', handler);
      window.removeEventListener('agent-email-refresh', handler);
    };
  }, [init, refreshNow]);

  const openThread = useCallback(async (thread: EmailThread) => {
    setThreadLoading(true);
    setSelectedDraft(null);
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
          setActionError(`Couldn't mark thread as read: ${markResult.error}`);
        }
      }
      setSelectedThread(nextThread);
      useComputerStore.getState().clearEmailUnread();
    } else if (detail.error) {
      setActionError(detail.error);
    }
    setThreadLoading(false);
  }, []);

  const handleDeleteSelection = useCallback(async () => {
    const targets = items.filter(
      (item): item is EmailThread => isThreadItem(item) && selectedIds.has(getMailboxItemId(item)),
    );
    if (targets.length === 0) return;

    setPendingAction('delete');
    setActionError(null);

    const previousItems = items;
    const deletedIds = new Set(targets.map((target) => target.threadId));
    setItems((current) => current.filter((item) => !isThreadItem(item) || !deletedIds.has(item.threadId)));
    setSelection({});
    if (selectedThread && deletedIds.has(selectedThread.threadId)) setSelectedThread(null);

    const failures: string[] = [];
    for (const item of targets) {
      const result = await deleteThread(item.threadId);
      if (!result.success && result.error) failures.push(result.error);
    }

    if (failures.length > 0) {
      setActionError(`Couldn't delete ${failures.length} thread${failures.length === 1 ? '' : 's'}: ${failures[0]}`);
      setItems(previousItems);
    }

    await loadMailbox(true, { silent: true });
    setPendingAction(null);
  }, [items, selectedIds, selectedThread, loadMailbox]);

  const handleMarkSelection = useCallback(async (unread: boolean) => {
    const threadTargets = items.filter(
      (item): item is EmailThread => isThreadItem(item) && selectedIds.has(getMailboxItemId(item)),
    );
    if (threadTargets.length === 0) return;

    setPendingAction(unread ? 'unread' : 'read');
    setActionError(null);

    const previousItems = items;
    const targetIds = new Set(threadTargets.map((target) => target.threadId));
    setItems((current) => current.map((item) => {
      if (!isThreadItem(item) || !targetIds.has(item.threadId)) return item;
      return {
        ...item,
        unread,
        labels: unread
          ? Array.from(new Set([...item.labels, 'unread']))
          : item.labels.filter((label) => label.toLowerCase() !== 'unread'),
      };
    }));
    if (selectedThread && targetIds.has(selectedThread.threadId)) {
      setSelectedThread(unread
        ? { ...selectedThread, unread: true }
        : markThreadReadLocally(selectedThread));
    }
    setSelection({});

    const failures: string[] = [];
    for (const item of threadTargets) {
      const result = await markThreadUnreadState(item.threadId, unread);
      if (!result.success && result.error) failures.push(result.error);
    }

    if (failures.length > 0) {
      setActionError(
        `Couldn't mark ${failures.length} thread${failures.length === 1 ? '' : 's'} as ${unread ? 'unread' : 'read'}: ${failures[0]}`,
      );
      setItems(previousItems);
    }

    await loadMailbox(true, { silent: true });
    setPendingAction(null);
  }, [items, selectedIds, selectedThread, loadMailbox]);

  const handleThreadDelete = useCallback(async (threadId: string) => {
    await deleteThread(threadId);
    setSelectedThread(null);
    await loadMailbox(true, { silent: true });
  }, [loadMailbox]);

  const handleDraftSend = useCallback(async (draftId: string) => {
    setPendingDraftAction('send');
    setActionError(null);
    const result = await sendDraft(draftId);
    if (!result.success && result.error) setActionError(result.error);
    setSelectedDraft(null);
    await loadMailbox(true, { silent: true });
    setPendingDraftAction(null);
  }, [loadMailbox]);

  const handleDraftDelete = useCallback(async (draftId: string) => {
    setPendingDraftAction('delete');
    setActionError(null);
    const result = await deleteDraft(draftId);
    if (!result.success && result.error) setActionError(result.error);
    setSelectedDraft(null);
    await loadMailbox(true, { silent: true });
    setPendingDraftAction(null);
  }, [loadMailbox]);

  const handleMessageUnreadToggle = useCallback(async (message: EmailMessage) => {
    const result = await updateMessageLabels(message.messageId, message.unread
      ? { addLabels: ['read'], removeLabels: ['UNREAD', 'unread'] }
      : { addLabels: ['unread'], removeLabels: ['read'] });
    if (!result.success && result.error) setActionError(result.error);
    await loadMailbox(true, { silent: true });
    if (selectedThread) {
      const detail = await getThread(selectedThread.threadId);
      if (detail.success && detail.data) setSelectedThread(detail.data);
    }
  }, [loadMailbox, selectedThread]);

  const openAttachment = useCallback(async (_message: EmailMessage | EmailDraft, attachmentId: string | null) => {
    if (!attachmentId) return;
    const attachment = await downloadAttachment(attachmentId);
    const url = attachment.data?.url;
    if (attachment.success && url) {
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else if (attachment.error) {
      setActionError(attachment.error);
    }
  }, []);

  const animatedItems = useAnimatedList(items, getMailboxItemId);
  const showBlockingLoader = listLoading && items.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full surface-app">
        <Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  if (notConfigured) {
    return <EmailSetupPane onConfigured={init} />;
  }

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center h-full surface-app gap-3 p-6 text-center">
        <Mail size={32} className="text-[var(--color-text-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-text-muted)]">{initError}</p>
        <button onClick={() => void init()} className="text-xs text-[var(--color-accent)] hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (threadLoading || selectedThread || selectedDraft) {
    return (
      <div className="relative flex h-full min-h-0 min-w-0 surface-app text-sm overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col surface-app">
          {threadLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" />
            </div>
          ) : selectedThread ? (
            <ThreadPane
              inboxEmail={inboxEmail}
              thread={selectedThread}
              onBack={() => setSelectedThread(null)}
              onDelete={handleThreadDelete}
              onToggleUnread={handleMessageUnreadToggle}
              onOpenAttachment={openAttachment}
            />
          ) : selectedDraft ? (
            <DraftPane
              draft={selectedDraft}
              pendingAction={pendingDraftAction}
              onBack={() => setSelectedDraft(null)}
              onSend={handleDraftSend}
              onDelete={handleDraftDelete}
              onOpenAttachment={openAttachment}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 surface-app text-sm overflow-hidden">
      <div className="w-full min-h-0 border-[var(--color-border)] flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--color-border)] surface-toolbar px-3 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{MAILBOX_FOLDERS.find((item) => item.key === folder)?.label || 'Mail'}</div>
              <div className="text-[10px] text-[var(--color-text-muted)] truncate" title={inboxEmail}>{inboxEmail}</div>
            </div>
            <button
              onClick={() => setSearchOpen((open) => !open)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/10"
              title="Search"
            >
              <Search size={15} />
            </button>
            <div className="hidden text-[10px] text-[var(--color-text-muted)] sm:block">
              <FreshnessText
                lastUpdatedAt={mailboxFreshness.lastUpdatedAt}
                now={mailboxFreshness.now}
                isRefreshing={mailboxFreshness.isRefreshing || listLoading}
                isStale={mailboxFreshness.isStale}
              />
            </div>
            <RefreshButton
              onClick={() => void mailboxFreshness.refreshNow()}
              refreshing={mailboxFreshness.isRefreshing || listLoading}
              className="h-7 w-7"
            />
          </div>

          {searchOpen && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] surface-control px-2.5 py-2">
              <Search size={13} className="text-[var(--color-text-muted)]" />
              <input
                autoFocus
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search subject, sender, recipients..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]"
              />
              <button
                onClick={() => { setSearchInput(''); setSearchQuery(''); setSearchOpen(false); }}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X size={13} />
              </button>
            </div>
          )}

          <div className="flex gap-1 overflow-x-auto scrollbar-x-none pb-0.5">
            {MAILBOX_FOLDERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFolder(entry.key)}
                className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                  folder === entry.key
                    ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/10'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {selectedCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] surface-control px-2 py-1.5">
              <Checkbox
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                onChange={toggleSelectAll}
                ariaLabel={allVisibleSelected ? 'Deselect all' : 'Select all'}
              />
              <span className="ml-1 text-[10px] font-medium text-[var(--color-text-muted)] mr-auto">
                {selectedCount} selected
              </span>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void handleMarkSelection(false)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-text)]/90 bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Mark as read"
              >
                {pendingAction === 'read' ? <Loader2 size={11} className="animate-spin" /> : <MailOpen size={11} />}
                Read
              </button>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void handleMarkSelection(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-text)]/90 bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Mark as unread"
              >
                {pendingAction === 'unread' ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                Unread
              </button>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void handleDeleteSelection()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-red-300 bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Delete selected"
              >
                {pendingAction === 'delete' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Delete
              </button>
            </div>
          )}

          {actionError && (
            <StatusBanner
              tone="error"
              className="rounded-lg border text-[10px]"
              action={(
                <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error">
                  <X size={11} />
                </button>
              )}
            >
              {actionError}
            </StatusBanner>
          )}

          {!actionError && mailboxFreshness.isStale && (
            <StatusBanner
              tone="warning"
              className="rounded-lg border text-[10px]"
              action={<button className="underline" onClick={() => void mailboxFreshness.refreshNow()}>Refresh</button>}
            >
              Mail may be out of date.
            </StatusBanner>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {showBlockingLoader ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" />
            </div>
          ) : items.length === 0 && !listPending ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2">
              <Mail size={24} className="opacity-40" />
              <p className="text-xs">{searchQuery ? 'No matching results' : 'No mail yet'}</p>
            </div>
          ) : (
            <AnimatedListContainer pending={listPending}>
              {animatedItems.map(({ key, item, phase }) => {
                if (isDraftItem(item)) {
                  const id = getMailboxItemId(item);
                  const title = item.subject || '(no subject)';
                  const recipients = item.to.length ? item.to.join(', ') : 'No recipients';
                  const status = item.sendStatus === 'scheduled' && item.sendAt
                    ? `Scheduled ${formatRelativeTimeShort(item.sendAt)}`
                    : item.sendStatus === 'failed'
                      ? 'Failed'
                      : item.sendStatus === 'sending'
                        ? 'Sending'
                        : 'Draft';
                  return (
                    <AnimatedListItem key={key} phase={phase}>
                      <button
                        type="button"
                        onClick={() => { setSelectedThread(null); setSelectedDraft(item); }}
                        className="block w-full text-left border-b border-[var(--color-border)] px-3 py-2.5 hover:bg-white/5"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[var(--color-text-muted)] shrink-0">
                            <Mail size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium text-[var(--color-text)] truncate flex-1">{title}</span>
                              <span className={`text-[10px] shrink-0 ${item.sendStatus === 'failed' ? 'text-red-300' : 'text-[var(--color-text-muted)]'}`}>
                                {status}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-muted)] truncate">To: {recipients}</p>
                            {item.preview && <p className="text-[10px] text-[var(--color-text-muted)] truncate">{item.preview}</p>}
                          </div>
                          {(item.attachments || []).length > 0 && <Paperclip size={11} className="text-[var(--color-text-muted)] shrink-0" />}
                        </div>
                      </button>
                    </AnimatedListItem>
                  );
                }
                if (!isThreadItem(item)) return null;
                const id = getMailboxItemId(item);
                const checked = !!selection[id];
                const unread = item.unread;
                const title = item.subject || '(no subject)';
                const sender = extractName((item.senders || ['Unknown'])[0]);
                const hasAttachment = (item.attachments || []).length > 0;

                return (
                  <AnimatedListItem key={key} phase={phase}>
                    <div
                      className={`relative border-b border-[var(--color-border)] ${
                        unread
                          ? 'bg-[var(--color-accent)]/5 hover:bg-[var(--color-accent)]/10'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {unread && (
                        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-accent)]" />
                      )}
                      <div className="flex items-start gap-2.5 px-3 py-2.5">
                        <div className="pt-1">
                          <Checkbox
                            checked={checked}
                            onChange={(next) => setSelection((current) => ({ ...current, [id]: next }))}
                            ariaLabel={`Select thread ${title}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void openThread(item)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center gap-2">
                            <div className="relative shrink-0">
                              <div className={`w-8 h-8 rounded-full ${getEmailAvatarClass(sender)} flex items-center justify-center text-white text-[11px] font-semibold`}>
                                {getEmailInitial(sender)}
                              </div>
                              {unread && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-surface)]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className={`text-xs truncate flex-1 ${unread ? 'font-semibold text-[var(--color-text)]' : 'font-medium text-[var(--color-text)]/90'}`}>
                                  {sender}
                                </span>
                                <span className={`text-[10px] shrink-0 ${unread ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-text-muted)]'}`}>
                                  {formatRelativeTimeShort(item.updatedAt)}
                                </span>
                              </div>
                              <p className={`text-[11px] truncate ${unread ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text)]/80'}`}>{title}</p>
                              {item.preview && (
                                <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                                  {item.preview}
                                </p>
                              )}
                            </div>
                            {hasAttachment && <Paperclip size={11} className="text-[var(--color-text-muted)] shrink-0 mt-1" />}
                          </div>
                        </button>
                      </div>
                    </div>
                  </AnimatedListItem>
                );
              })}

              {nextPageToken && (
                <div className="p-3 border-t border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => void loadMailbox(false)}
                    disabled={loadingMore}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:bg-white/5 disabled:opacity-50"
                  >
                    {loadingMore ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} />}
                    Load more
                  </button>
                </div>
              )}
            </AnimatedListContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftPane({
  draft,
  pendingAction,
  onBack,
  onSend,
  onDelete,
  onOpenAttachment,
}: {
  draft: EmailDraft;
  pendingAction: null | 'send' | 'delete';
  onBack: () => void;
  onSend: (draftId: string) => Promise<void>;
  onDelete: (draftId: string) => Promise<void>;
  onOpenAttachment: (draft: EmailDraft, attachmentId: string | null) => Promise<void>;
}) {
  const status = draft.sendStatus === 'scheduled' && draft.sendAt
    ? `Scheduled for ${formatFullDate(draft.sendAt)}`
    : draft.sendStatus === 'failed'
      ? 'Failed to send'
      : draft.sendStatus === 'sending'
        ? 'Sending'
        : 'Draft';

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] surface-toolbar">
        <button onClick={onBack} className="p-2.5 -m-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/10 shrink-0">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium truncate">{draft.subject || '(no subject)'}</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] truncate">{status}</p>
        </div>
        <button
          onClick={() => void onSend(draft.draftId)}
          disabled={pendingAction !== null}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-text)]/90 bg-white/10 hover:bg-white/15 disabled:opacity-50"
          title="Send now"
        >
          {pendingAction === 'send' ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Send
        </button>
        <button
          onClick={() => void onDelete(draft.draftId)}
          disabled={pendingAction !== null}
          className="p-2.5 -m-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/10 text-[var(--color-text-muted)] disabled:opacity-50"
          title="Delete"
        >
          {pendingAction === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div className="px-3 py-3 border-b border-[var(--color-border)] space-y-1.5">
            <DetailRow label="To" addresses={parseAddressList(draft.to)} />
            <DetailRow label="Cc" addresses={parseAddressList(draft.cc)} />
            <DetailRow label="Bcc" addresses={parseAddressList(draft.bcc)} />
            {draft.sendAt && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] w-14 shrink-0 pt-[3px]">
                  Send
                </span>
                <span className="text-[11px] text-[var(--color-text)]/90">{formatFullDate(draft.sendAt)}</span>
              </div>
            )}
          </div>
          <div className="px-3 py-2.5">
            <EmailHtmlBody html={draft.html} text={draft.text || draft.preview || ''} />
          </div>
          {draft.attachments?.length ? (
            <div className="px-3 pb-3 flex flex-wrap gap-1.5">
              {draft.attachments.map((attachment) => (
                <button
                  key={attachment.attachmentId || attachment.filename}
                  type="button"
                  onClick={() => void onOpenAttachment(draft, attachment.attachmentId)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded surface-control text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-white/5"
                >
                  <Paperclip size={9} />
                  {attachment.filename || 'attachment'}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ThreadPane({
  thread,
  inboxEmail,
  onBack,
  onDelete,
  onToggleUnread,
  onOpenAttachment,
}: {
  thread: EmailThreadDetail;
  inboxEmail: string;
  onBack: () => void;
  onDelete: (threadId: string) => Promise<void>;
  onToggleUnread: (message: EmailMessage) => Promise<void>;
  onOpenAttachment: (message: EmailMessage, attachmentId: string | null) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.threadId]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] surface-toolbar">
        <button onClick={onBack} className="p-2.5 -m-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/10 shrink-0">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium truncate">{thread.subject || '(no subject)'}</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] truncate">
            {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => void onDelete(thread.threadId)}
          className="p-2.5 -m-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/10 text-[var(--color-text-muted)]"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {thread.messages.map((message) => {
          const isOwn = extractEmail(message.from || '').toLowerCase() === inboxEmail.toLowerCase();
          return (
            <div key={message.messageId} className={`group flex ${isOwn ? 'justify-end pl-10' : 'justify-start pr-10'}`}>
              <div className={`w-full max-w-[960px] overflow-hidden rounded-lg border shadow-sm ${
                isOwn
                  ? 'border-[var(--color-accent)]/20 bg-[var(--color-accent)]/[0.07]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-raised)]'
              }`}
              >
                <MessageHeader message={message} />

                <div className="px-4 py-3">
                  <EmailHtmlBody
                    html={message.extractedHtml || message.html}
                    text={message.extractedText || message.text}
                    preferPlainText={isOwn}
                  />
                </div>

                {message.attachments?.length ? (
                  <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                    {message.attachments.map((attachment) => (
                      <button
                        key={attachment.attachmentId || attachment.filename}
                        type="button"
                        onClick={() => void onOpenAttachment(message, attachment.attachmentId)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded surface-control text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-white/5"
                      >
                        <Paperclip size={9} />
                        {attachment.filename || 'attachment'}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-center gap-1 px-2 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => void onToggleUnread(message)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 text-[10px] text-[var(--color-text-muted)]">
                    {message.unread ? <MailOpen size={11} /> : <Mail size={11} />}
                    {message.unread ? 'Mark read' : 'Mark unread'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddressPill({ address }: { address: ParsedAddress }) {
  if (!address.email) return null;
  return (
    <span className="inline-flex items-baseline gap-1 rounded bg-white/5 px-1.5 py-0.5">
      {address.name && (
        <span className="text-[11px] text-[var(--color-text)]">{address.name}</span>
      )}
      <a
        href={`mailto:${address.email}`}
        className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {address.email}
      </a>
    </span>
  );
}

function DetailRow({ label, addresses }: { label: string; addresses: ParsedAddress[] }) {
  if (!addresses.length) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] w-14 shrink-0 pt-[3px]">
        {label}
      </span>
      <div className="flex-1 flex flex-wrap gap-1">
        {addresses.map((address, index) => (
          <AddressPill key={`${label}-${address.email}-${index}`} address={address} />
        ))}
      </div>
    </div>
  );
}

function MessageHeader({ message }: { message: EmailMessage }) {
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
    const firstLabel = first.email;
    if (toAddresses.length === 1) return `to ${firstLabel}`;
    return `to ${firstLabel}, +${toAddresses.length - 1} more`;
  }, [toAddresses]);

  const hasExtraDetails = !!(
    ccAddresses.length
    || bccAddresses.length
    || replyToAddresses.length
    || toAddresses.length > 1
    || fromAddress.name
  );

  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="flex items-start gap-2 px-3 py-2">
        <div className={`w-7 h-7 rounded-full ${getEmailAvatarClass(senderDisplay)} flex items-center justify-center text-white text-[10px] font-semibold shrink-0 mt-[1px]`}>
          {getEmailInitial(senderDisplay)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold truncate text-[var(--color-text)]">
              {senderDisplay}
            </span>
            {fromAddress.email && fromAddress.name && (
              <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                &lt;{fromAddress.email}&gt;
              </span>
            )}
            {message.unread && (
              <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">
                Unread
              </span>
            )}
          </div>
          {!expanded && (
            <p className="text-[10px] text-[var(--color-text-muted)] truncate">
              {recipientSummary}
              {ccAddresses.length > 0 && ` · cc ${ccAddresses.length}`}
              {bccAddresses.length > 0 && ` · bcc ${bccAddresses.length}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {message.createdAt ? formatFullDate(message.createdAt) : ''}
          </span>
          {hasExtraDetails && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/10"
              title={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-1.5">
          {fromAddress.email && <DetailRow label="From" addresses={[fromAddress]} />}
          {replyToAddresses.length > 0 && <DetailRow label="Reply-To" addresses={replyToAddresses} />}
          <DetailRow label="To" addresses={toAddresses} />
          <DetailRow label="Cc" addresses={ccAddresses} />
          <DetailRow label="Bcc" addresses={bccAddresses} />
          {message.createdAt && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] w-14 shrink-0 pt-[3px]">
                Date
              </span>
              <span className="text-[11px] text-[var(--color-text)]/90">{formatFullDate(message.createdAt)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
