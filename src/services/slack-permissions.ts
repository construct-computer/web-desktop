/**
 * Slack permissions service — proxied through the backend.
 */

import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

export interface TrustedUser {
  teamId: string;
  slackUserId: string;
  slackUsername: string;
  displayName: string;
  grantedBy: string;
  grantedAt: number;
}

export interface ApprovalRequest {
  id: string;
  userId: string;
  teamId: string;
  slackUserId: string;
  slackUsername: string;
  displayName: string;
  channelId: string;
  channelName: string;
  threadTs: string;
  sessionKey: string;
  toolName: string;
  description: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: number;
  resolvedAt: number | null;
}

function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token);
}

async function apiCall<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/slack-permissions${path}`, {
    method: opts?.method || 'GET',
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error((json as Record<string, string>)?.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Trusted Users ──

export async function getTrustedUsers(): Promise<TrustedUser[]> {
  const data = await apiCall<{ users: TrustedUser[] }>('/trusted-users');
  return data.users;
}

export async function addTrustedUser(user: {
  slackUserId: string;
  slackUsername?: string;
  displayName?: string;
}): Promise<void> {
  await apiCall('/trusted-users', { method: 'POST', body: user });
}

export async function removeTrustedUser(slackUserId: string): Promise<void> {
  await apiCall(`/trusted-users/${encodeURIComponent(slackUserId)}`, { method: 'DELETE' });
}

// ── Approval Queue ──

export async function getApprovalQueue(status?: string): Promise<ApprovalRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await apiCall<{ requests: ApprovalRequest[] }>(`/approval-queue${qs}`);
  return data.requests;
}

export async function approveRequest(id: string): Promise<void> {
  await apiCall(`/approval-queue/${encodeURIComponent(id)}/approve`, { method: 'POST' });
}

export async function denyRequest(id: string): Promise<void> {
  await apiCall(`/approval-queue/${encodeURIComponent(id)}/deny`, { method: 'POST' });
}
