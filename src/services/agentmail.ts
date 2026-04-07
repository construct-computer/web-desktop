/**
 * AgentMail service for the frontend.
 *
 * All calls are proxied through the backend — the API key never
 * leaves the server.
 */

import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

export interface AgentMailThread {
  inboxId: string;
  threadId: string;
  labels: string[];
  timestamp: string;
  receivedTimestamp?: string;
  sentTimestamp?: string;
  senders: string[];
  recipients: string[];
  subject?: string;
  preview?: string;
  attachments?: Array<{ filename?: string; contentType?: string; size?: number }>;
  lastMessageId: string;
  messageCount: number;
  size: number;
  updatedAt: string;
  createdAt: string;
}

export interface AgentMailMessage {
  inboxId: string;
  threadId: string;
  messageId: string;
  labels: string[];
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
  attachments?: Array<{ filename?: string; contentType?: string; size?: number }>;
  inReplyTo?: string;
  references?: string[];
  size: number;
  updatedAt: string;
  createdAt: string;
}

/**
 * The response from GET /threads/:threadId — a full thread object
 * with thread-level metadata plus the nested messages array.
 */
export interface AgentMailThreadDetail {
  inboxId: string;
  threadId: string;
  labels: string[];
  timestamp: string;
  senders: string[];
  recipients: string[];
  subject?: string;
  preview?: string;
  lastMessageId: string;
  messageCount: number;
  size: number;
  updatedAt: string;
  createdAt: string;
  messages: AgentMailMessage[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token);
}

/**
 * Recursively convert snake_case keys to camelCase.
 * The AgentMail REST API returns snake_case but our types use camelCase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snakeToCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, val]) => [
        key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        snakeToCamel(val),
      ]),
    );
  }
  return obj;
}

async function apiCall<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<ApiResponse<T>> {
  try {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/email${path}`, {
      method: options?.method || 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      const errMsg = (json as any)?.error || `HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    const raw = await res.json();
    const data = snakeToCamel(raw) as T;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Check if AgentMail is configured and get the inbox address. */
export async function getEmailStatus(): Promise<ApiResponse<{
  configured: boolean;
  inboxId: string | null;
  email: string | null;
  error?: string;
}>> {
  return apiCall('/status');
}

/** List messages in an inbox. */
export async function listMessages(
  inboxId: string,
  params?: { limit?: number },
): Promise<ApiResponse<{ messages: AgentMailMessage[] }>> {
  const qs = new URLSearchParams({ inbox_id: inboxId });
  if (params?.limit) qs.set('limit', String(params.limit));
  return apiCall(`/messages?${qs}`);
}

/** List threads in an inbox. */
export async function listThreads(
  inboxId: string,
  params?: { limit?: number },
): Promise<ApiResponse<{ threads: AgentMailThread[] }>> {
  const qs = new URLSearchParams({ inbox_id: inboxId });
  if (params?.limit) qs.set('limit', String(params.limit));
  return apiCall(`/threads?${qs}`);
}

/** Get a single thread with its messages. */
export async function getThread(
  inboxId: string,
  threadId: string,
): Promise<ApiResponse<AgentMailThreadDetail>> {
  return apiCall(`/threads/${encodeURIComponent(threadId)}?inbox_id=${encodeURIComponent(inboxId)}`);
}

/** Send a new email. */
export async function sendMessage(
  inboxId: string,
  params: { to: string[]; subject: string; text: string; cc?: string[] },
): Promise<ApiResponse<{ messageId: string; threadId: string }>> {
  return apiCall(`/send?inbox_id=${encodeURIComponent(inboxId)}`, {
    method: 'POST',
    body: params,
  });
}

/** Reply to a message. */
export async function replyToMessage(
  inboxId: string,
  messageId: string,
  params: { text: string },
): Promise<ApiResponse<{ messageId: string; threadId: string }>> {
  return apiCall(`/reply/${encodeURIComponent(messageId)}?inbox_id=${encodeURIComponent(inboxId)}`, {
    method: 'POST',
    body: params,
  });
}

/** Reply-all to a message. */
export async function replyAllToMessage(
  inboxId: string,
  messageId: string,
  params: { text: string },
): Promise<ApiResponse<{ messageId: string; threadId: string }>> {
  return apiCall(`/reply-all/${encodeURIComponent(messageId)}?inbox_id=${encodeURIComponent(inboxId)}`, {
    method: 'POST',
    body: params,
  });
}

/** Forward a message. */
export async function forwardMessage(
  inboxId: string,
  messageId: string,
  params: { to: string; text?: string },
): Promise<ApiResponse<{ messageId: string; threadId: string }>> {
  return apiCall(`/forward/${encodeURIComponent(messageId)}?inbox_id=${encodeURIComponent(inboxId)}`, {
    method: 'POST',
    body: params,
  });
}

/** Update labels on a message. */
export async function updateMessageLabels(
  inboxId: string,
  messageId: string,
  params: { addLabels?: string[]; removeLabels?: string[] },
): Promise<ApiResponse<unknown>> {
  return apiCall(`/messages/${encodeURIComponent(messageId)}/labels?inbox_id=${encodeURIComponent(inboxId)}`, {
    method: 'PATCH',
    body: params,
  });
}

/** Delete a thread. */
export async function deleteThread(
  inboxId: string,
  threadId: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return apiCall(`/threads/${encodeURIComponent(threadId)}?inbox_id=${encodeURIComponent(inboxId)}`, {
    method: 'DELETE',
  });
}
