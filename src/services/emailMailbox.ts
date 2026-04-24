import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

export type MailboxFolder = 'inbox' | 'sent' | 'drafts' | 'all' | 'spam' | 'trash' | 'blocked';

export interface EmailAttachment {
  attachmentId: string | null;
  filename?: string;
  size?: number;
  contentType?: string;
  contentDisposition?: string;
  contentId?: string;
  downloadUrl?: string;
  expiresAt?: string;
}

export interface EmailMessage {
  inboxId: string;
  threadId: string;
  messageId: string;
  labels: string[];
  unread: boolean;
  timestamp: string;
  from: string;
  replyTo?: string[];
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
  extractedText?: string;
  extractedHtml?: string;
  attachments?: EmailAttachment[];
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
  size: number;
  updatedAt: string;
  createdAt: string;
}

export interface EmailThread {
  kind: 'thread';
  inboxId: string;
  threadId: string;
  labels: string[];
  unread: boolean;
  isSpam: boolean;
  isTrash: boolean;
  isBlocked: boolean;
  timestamp: string;
  receivedTimestamp?: string;
  sentTimestamp?: string;
  senders: string[];
  recipients: string[];
  subject?: string;
  preview?: string;
  attachments?: EmailAttachment[];
  lastMessageId: string;
  messageCount: number;
  size: number;
  updatedAt: string;
  createdAt: string;
}

export interface EmailThreadDetail extends EmailThread {
  messages: EmailMessage[];
}

export interface EmailDraft {
  kind: 'draft';
  inboxId: string;
  draftId: string;
  clientId?: string;
  labels: string[];
  replyTo?: string[];
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  inReplyTo?: string;
  references?: string[];
  sendStatus?: 'scheduled' | 'sending' | 'failed';
  sendAt?: string;
  updatedAt: string;
  createdAt: string;
}

export type MailboxItem = EmailThread | EmailDraft;

export interface MailboxPage {
  kind: 'threads' | 'drafts';
  folder: MailboxFolder;
  items: MailboxItem[];
  limit: number;
  count: number;
  nextPageToken: string | null;
  scannedPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DraftPayload {
  draftId?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  text?: string;
  html?: string;
  replyTo?: string[];
  inReplyTo?: string;
  sendAt?: string;
  attachments?: ComposeAttachment[];
}

export interface ComposeAttachment {
  filename: string;
  contentType: string;
  content: string;
}

function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token);
}

async function request<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<ApiResponse<T>> {
  try {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/email${path}`, {
      method: options?.method || 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null) as { error?: string; message?: string } | null;
      return { success: false, error: payload?.error || payload?.message || `HTTP ${res.status}` };
    }

    if (res.status === 204) return { success: true, data: undefined as T };
    const data = await res.json().catch(() => undefined) as T;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    qs.set(key, String(value));
  }
  const raw = qs.toString();
  return raw ? `?${raw}` : '';
}

export function isThreadItem(item: MailboxItem): item is EmailThread {
  return item.kind === 'thread';
}

export function isDraftItem(item: MailboxItem): item is EmailDraft {
  return item.kind === 'draft';
}

export function splitRecipients(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatRecipients(value: string[] | undefined): string {
  return (value || []).join(', ');
}

export function extractEmail(value: string): string {
  if (!value) return '';
  const match = value.match(/<([^>]+)>/);
  return match ? match[1].trim() : value.trim();
}

export function extractName(value: string): string {
  if (!value) return 'Unknown';
  const match = value.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  const at = value.indexOf('@');
  return at > 0 ? value.slice(0, at) : value;
}

export interface ParsedAddress {
  name: string | null;
  email: string;
  display: string;
}

export function parseAddress(raw: string | undefined | null): ParsedAddress {
  const value = (raw || '').trim();
  if (!value) return { name: null, email: '', display: '' };
  const match = value.match(/^"?([^"<]+)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return { name, email, display: value };
  }
  return { name: null, email: value, display: value };
}

export function parseAddressList(raw: string[] | undefined | null): ParsedAddress[] {
  return (raw || []).map((entry) => parseAddress(entry)).filter((entry) => entry.email);
}

export function getMailboxItemId(item: MailboxItem): string {
  return isThreadItem(item) ? `thread:${item.threadId}` : `draft:${item.draftId}`;
}

export async function getEmailStatus() {
  return request<{ configured: boolean; inboxId: string | null; email: string | null }>('/status');
}

export async function listMailbox(params: {
  folder: MailboxFolder;
  limit?: number;
  pageToken?: string | null;
  query?: string;
}) {
  return request<MailboxPage>(`/mailbox${buildQuery({
    folder: params.folder,
    limit: params.limit,
    pageToken: params.pageToken || undefined,
    q: params.query,
  })}`);
}

export async function getThread(threadId: string) {
  return request<EmailThreadDetail>(`/threads/${encodeURIComponent(threadId)}`);
}

export async function getDraft(draftId: string) {
  return request<EmailDraft>(`/drafts/${encodeURIComponent(draftId)}`);
}

export async function createDraft(payload: DraftPayload) {
  return request<EmailDraft>('/drafts', {
    method: 'POST',
    body: {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      reply_to: payload.replyTo,
      in_reply_to: payload.inReplyTo,
      send_at: payload.sendAt,
      attachments: payload.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content_type: attachment.contentType,
        content: attachment.content,
      })),
    },
  });
}

export async function updateDraft(payload: DraftPayload & { draftId: string }) {
  return request<EmailDraft>(`/drafts/${encodeURIComponent(payload.draftId)}`, {
    method: 'PATCH',
    body: {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      reply_to: payload.replyTo,
      send_at: payload.sendAt,
    },
  });
}

export async function saveDraft(payload: DraftPayload) {
  if (payload.draftId) return updateDraft(payload as DraftPayload & { draftId: string });
  return createDraft(payload);
}

export async function deleteDraft(draftId: string) {
  return request<{ success: boolean }>(`/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' });
}

export async function sendDraft(draftId: string) {
  return request<{ messageId: string; threadId: string }>(`/drafts/${encodeURIComponent(draftId)}/send`, {
    method: 'POST',
    body: {},
  });
}

export async function sendMessage(params: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: ComposeAttachment[];
}) {
  return request<{ messageId: string; threadId: string }>('/send', {
    method: 'POST',
    body: {
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content_type: attachment.contentType,
        content: attachment.content,
      })),
    },
  });
}

export async function replyToMessage(messageId: string, params: {
  text: string;
  cc?: string[];
  bcc?: string[];
  attachments?: ComposeAttachment[];
}) {
  return request<{ messageId: string; threadId: string }>(`/reply/${encodeURIComponent(messageId)}`, {
    method: 'POST',
    body: {
      text: params.text,
      cc: params.cc,
      bcc: params.bcc,
      attachments: params.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content_type: attachment.contentType,
        content: attachment.content,
      })),
    },
  });
}

export async function replyAllToMessage(messageId: string, params: {
  text: string;
  cc?: string[];
  bcc?: string[];
  attachments?: ComposeAttachment[];
}) {
  return request<{ messageId: string; threadId: string }>(`/reply-all/${encodeURIComponent(messageId)}`, {
    method: 'POST',
    body: {
      text: params.text,
      cc: params.cc,
      bcc: params.bcc,
      attachments: params.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content_type: attachment.contentType,
        content: attachment.content,
      })),
    },
  });
}

export async function forwardMessage(messageId: string, params: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  text?: string;
  attachments?: ComposeAttachment[];
}) {
  return request<{ messageId: string; threadId: string }>(`/forward/${encodeURIComponent(messageId)}`, {
    method: 'POST',
    body: {
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      text: params.text,
      attachments: params.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content_type: attachment.contentType,
        content: attachment.content,
      })),
    },
  });
}

export async function updateMessageLabels(messageId: string, params: { addLabels?: string[]; removeLabels?: string[] }) {
  return request<unknown>(`/messages/${encodeURIComponent(messageId)}/labels`, {
    method: 'PATCH',
    body: {
      add_labels: params.addLabels,
      remove_labels: params.removeLabels,
    },
  });
}

export async function updateThreadLabels(threadId: string, params: { addLabels?: string[]; removeLabels?: string[] }) {
  return request<unknown>(`/threads/${encodeURIComponent(threadId)}/labels`, {
    method: 'PATCH',
    body: {
      add_labels: params.addLabels,
      remove_labels: params.removeLabels,
    },
  });
}

export async function deleteThread(threadId: string, permanent = false) {
  return request<{ success: boolean; permanent: boolean }>(`/threads/${encodeURIComponent(threadId)}${buildQuery({ permanent: permanent || undefined })}`, {
    method: 'DELETE',
  });
}

export async function getThreadAttachment(threadId: string, attachmentId: string) {
  return request<EmailAttachment>(`/threads/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(attachmentId)}`);
}

export async function getMessageAttachment(messageId: string, attachmentId: string) {
  return request<EmailAttachment>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
}

export async function markThreadUnreadState(
  threadId: string,
  unread: boolean,
  preloadedMessages?: Pick<EmailMessage, 'messageId' | 'unread'>[],
): Promise<ApiResponse<boolean>> {
  let messages = preloadedMessages;
  if (!messages) {
    const detail = await getThread(threadId);
    if (!detail.success || !detail.data) return { success: false, error: detail.error };
    messages = detail.data.messages;
  }

  for (const message of messages) {
    if (message.unread === unread) continue;
    const result = await updateMessageLabels(message.messageId, unread
      ? { addLabels: ['unread'], removeLabels: ['read'] }
      : { addLabels: ['read'], removeLabels: ['UNREAD', 'unread'] });
    if (!result.success) return { success: false, error: result.error };
  }

  return { success: true, data: true };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function filesToComposeAttachments(files: FileList | File[]): Promise<ComposeAttachment[]> {
  const array = Array.from(files);
  const attachments: ComposeAttachment[] = [];
  for (const file of array) {
    const buffer = await file.arrayBuffer();
    attachments.push({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      content: arrayBufferToBase64(buffer),
    });
  }
  return attachments;
}
