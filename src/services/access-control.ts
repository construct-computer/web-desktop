/**
 * Access Control API Client
 *
 * Frontend service for the unified access control system.
 */

import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants'

function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token)
}

async function apiCall<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}/access-control${path}`, {
    method: opts?.method || 'GET',
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error((json as Record<string, string>)?.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Types ──

export interface AccessListEntry {
  id: string
  userId: string
  platform: 'slack' | 'telegram' | 'email'
  senderId: string
  senderName: string
  senderHandle: string
  teamId: string
  status: 'trusted' | 'blocked'
  grantedBy: string
  createdAt: number
  updatedAt: number
}

export interface ApprovalQueueEntry {
  id: string
  userId: string
  platform: 'slack' | 'telegram' | 'email'
  senderId: string
  senderName: string
  senderHandle: string
  teamId: string
  channelInfo: string
  sessionKey: string
  originalMessage: string
  impactSummary: string
  toolName: string
  status: 'pending' | 'approved' | 'denied' | 'expired'
  mode: 'full_block' | 'escalation'
  platformMeta: string
  requestedAt: number
  resolvedAt: number | null
}

export interface WorkspaceBinding {
  id: string
  userId: string
  platform: string
  groupId: string
  groupName: string
  createdAt: number
}

export type PlatformSettings = Record<string, string>

// ── Settings API ──

export async function getAccessSettings(): Promise<PlatformSettings> {
  const data = await apiCall<{ settings: PlatformSettings }>('/settings')
  return data.settings
}

export async function setAccessSetting(platform: string, mode: string): Promise<void> {
  await apiCall(`/settings/${platform}`, { method: 'PUT', body: { mode } })
}

// ── Access List API ──

export async function getAccessList(platform?: string, status?: string): Promise<AccessListEntry[]> {
  const params = new URLSearchParams()
  if (platform) params.set('platform', platform)
  if (status) params.set('status', status)
  const qs = params.toString() ? `?${params}` : ''
  const data = await apiCall<{ entries: AccessListEntry[] }>(`/list${qs}`)
  return data.entries
}

export async function addAccessEntry(entry: {
  platform: string; senderId: string; senderName?: string;
  senderHandle?: string; teamId?: string; status: 'trusted' | 'blocked'
}): Promise<string> {
  const data = await apiCall<{ id: string }>('/list', { method: 'POST', body: entry })
  return data.id
}

export async function updateAccessEntry(id: string, status: 'trusted' | 'blocked'): Promise<void> {
  await apiCall(`/list/${id}`, { method: 'PUT', body: { status } })
}

export async function removeAccessEntry(id: string): Promise<void> {
  await apiCall(`/list/${id}`, { method: 'DELETE' })
}

// ── Approval Queue API ──

export async function getApprovalQueue(status?: string, platform?: string): Promise<ApprovalQueueEntry[]> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (platform) params.set('platform', platform)
  const qs = params.toString() ? `?${params}` : ''
  const data = await apiCall<{ requests: ApprovalQueueEntry[] }>(`/queue${qs}`)
  return data.requests
}

export async function approveRequest(id: string, whitelist = false): Promise<void> {
  await apiCall(`/queue/${id}/approve`, { method: 'POST', body: { whitelist } })
}

export async function denyRequest(id: string, blacklist = false): Promise<void> {
  await apiCall(`/queue/${id}/deny`, { method: 'POST', body: { blacklist } })
}

// ── Workspace Bindings API ──

export async function getWorkspaceBindings(): Promise<WorkspaceBinding[]> {
  const data = await apiCall<{ bindings: WorkspaceBinding[] }>('/bindings')
  return data.bindings
}

export async function createWorkspaceBinding(platform: string, groupId: string, groupName: string): Promise<string> {
  const data = await apiCall<{ id: string }>('/bindings', { method: 'POST', body: { platform, groupId, groupName } })
  return data.id
}

export async function deleteWorkspaceBinding(id: string): Promise<void> {
  await apiCall(`/bindings/${id}`, { method: 'DELETE' })
}

export async function generateTelegramBindCode(): Promise<{ code: string; expiresAt: number }> {
  return apiCall('/telegram/bind-code', { method: 'POST' })
}
