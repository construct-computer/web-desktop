import { useSyncExternalStore } from 'react';
import {
  authConnectNotifIds,
  pendingAuthCards,
  saveAuthCards,
  type StoredAuthCard,
} from '@/stores/agentStoreUtils';
import { useNotificationStore } from '@/stores/notificationStore';
import {
  getAppConnection,
  getComposioStatus,
  resolvePendingUserActionBySource,
} from '@/services/api';
import { agentWS } from '@/services/websocket';
import {
  authSourceId,
  dispatchAuthRequestCancelled,
  dispatchAuthRequestStateChanged,
} from './authRequestState';

export type AuthRequestStatus = 'pending' | 'connecting' | 'connected' | 'cancelled' | 'expired';

export interface AuthRequestRecord {
  sourceId: string;
  kind: 'composio' | 'app';
  toolkit: string;
  name: string;
  description: string;
  logo?: string;
  appId?: string;
  sessionKey: string;
  actionUrl?: string;
  pendingActionId?: string;
  expiresAt?: number | null;
  status: AuthRequestStatus;
  createdAt: number;
  updatedAt: number;
}

type Listener = () => void;

const requests = new Map<string, AuthRequestRecord>();
const listeners = new Set<Listener>();
const resumeSentSources = new Set<string>();
const pollTimers = new Map<string, ReturnType<typeof setInterval>>();
let requestsSnapshot: AuthRequestRecord[] = [];

function now() {
  return Date.now();
}

function emit() {
  requestsSnapshot = Array.from(requests.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const listener of listeners) listener();
}

function activeForPersistence(record: AuthRequestRecord): boolean {
  return record.status === 'pending' || record.status === 'connecting' || record.status === 'expired';
}

function storageCard(record: AuthRequestRecord): StoredAuthCard {
  return {
    kind: record.kind,
    toolkit: record.toolkit,
    name: record.name,
    description: record.description,
    url: record.actionUrl,
    logo: record.logo,
    appId: record.appId,
    sessionKey: record.sessionKey,
    expiresAt: record.expiresAt ?? undefined,
    pendingActionId: record.pendingActionId,
    timestamp: record.createdAt,
  };
}

function persistActiveRequests() {
  pendingAuthCards.clear();
  for (const record of requests.values()) {
    if (activeForPersistence(record)) {
      pendingAuthCards.set(record.sourceId, storageCard(record));
    }
  }
  saveAuthCards(pendingAuthCards);
}

function dismissNotification(record: Pick<AuthRequestRecord, 'sourceId' | 'toolkit'>) {
  const keys = [record.sourceId, record.toolkit.toLowerCase()];
  for (const key of keys) {
    const notifId = authConnectNotifIds.get(key);
    if (!notifId) continue;
    const store = useNotificationStore.getState();
    store.dismissToast(notifId);
    store.removeNotification(notifId);
    authConnectNotifIds.delete(key);
  }
}

function upsertRecord(record: AuthRequestRecord, persist = true) {
  requests.set(record.sourceId, record);
  if (persist) persistActiveRequests();
  emit();
}

function statusFor(record: { actionUrl?: string; expiresAt?: number | null }, at = now()): AuthRequestStatus {
  return record.actionUrl && record.expiresAt && record.expiresAt <= at ? 'expired' : 'pending';
}

function hydrateFromStorage() {
  for (const card of pendingAuthCards.values()) {
    const kind = card.kind || 'composio';
    const sourceId = authSourceId(kind, card.toolkit, card.appId);
    if (requests.has(sourceId)) continue;
    requests.set(sourceId, {
      sourceId,
      kind,
      toolkit: card.toolkit,
      name: card.name,
      description: card.description,
      logo: card.logo,
      appId: card.appId,
      sessionKey: card.sessionKey || 'default',
      actionUrl: card.url,
      pendingActionId: card.pendingActionId,
      expiresAt: card.expiresAt ?? null,
      status: statusFor({ actionUrl: card.url, expiresAt: card.expiresAt }),
      createdAt: card.timestamp,
      updatedAt: card.timestamp,
    });
  }
}

hydrateFromStorage();
requestsSnapshot = Array.from(requests.values()).sort((a, b) => b.updatedAt - a.updatedAt);

export function subscribeAuthRequests(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthRequest(sourceId: string): AuthRequestRecord | null {
  return requests.get(sourceId) ?? null;
}

export function getAuthRequests(): AuthRequestRecord[] {
  return requestsSnapshot;
}

export function useAuthRequest(sourceId: string): AuthRequestRecord | null {
  return useSyncExternalStore(
    subscribeAuthRequests,
    () => getAuthRequest(sourceId),
    () => getAuthRequest(sourceId),
  );
}

export function useAuthRequests(): AuthRequestRecord[] {
  return useSyncExternalStore(subscribeAuthRequests, getAuthRequests, getAuthRequests);
}

export function registerAuthRequest(input: {
  kind?: 'composio' | 'app';
  toolkit: string;
  name: string;
  description: string;
  url?: string;
  logo?: string;
  appId?: string;
  sessionKey?: string;
  expiresAt?: number | null;
  pendingActionId?: string;
  createdAt?: number;
}): AuthRequestRecord {
  const kind = input.kind || 'composio';
  const sourceId = authSourceId(kind, input.toolkit, input.appId);
  const existing = requests.get(sourceId);
  if (existing?.status === 'connected' || existing?.status === 'cancelled') return existing;

  const createdAt = input.createdAt ?? existing?.createdAt ?? now();
  const record: AuthRequestRecord = {
    sourceId,
    kind,
    toolkit: input.toolkit,
    name: input.name,
    description: input.description,
    logo: input.logo,
    appId: input.appId,
    sessionKey: input.sessionKey || existing?.sessionKey || 'default',
    actionUrl: input.url || existing?.actionUrl,
    pendingActionId: input.pendingActionId || existing?.pendingActionId,
    expiresAt: input.expiresAt ?? existing?.expiresAt ?? null,
    status: existing?.status === 'connecting'
      ? 'connecting'
      : statusFor({ actionUrl: input.url || existing?.actionUrl, expiresAt: input.expiresAt ?? existing?.expiresAt }),
    createdAt,
    updatedAt: now(),
  };
  upsertRecord(record);
  dispatchAuthRequestStateChanged({ state: 'pending', sourceId, toolkit: record.toolkit, sessionKey: record.sessionKey });
  return record;
}

export function updateAuthRequest(
  sourceId: string,
  patch: Partial<Omit<AuthRequestRecord, 'sourceId' | 'createdAt'>>,
): AuthRequestRecord | null {
  const existing = requests.get(sourceId);
  if (!existing) return null;
  const record = { ...existing, ...patch, updatedAt: now() };
  upsertRecord(record);
  return record;
}

export function markAuthRequestConnecting(sourceId: string): AuthRequestRecord | null {
  return updateAuthRequest(sourceId, { status: 'connecting' });
}

export function completeAuthRequest(input: {
  sourceId: string;
  kind: 'composio' | 'app';
  toolkit: string;
  name: string;
  appId?: string;
  sessionKey?: string;
}): void {
  const existing = requests.get(input.sourceId);
  const record: AuthRequestRecord = {
    sourceId: input.sourceId,
    kind: input.kind,
    toolkit: input.toolkit,
    name: existing?.name || input.name,
    description: existing?.description || '',
    logo: existing?.logo,
    appId: input.appId || existing?.appId,
    sessionKey: input.sessionKey || existing?.sessionKey || 'default',
    actionUrl: existing?.actionUrl,
    pendingActionId: existing?.pendingActionId,
    expiresAt: existing?.expiresAt,
    status: 'connected',
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  stopAuthRequestWatch(input.sourceId);
  upsertRecord(record);
  dismissNotification(record);
  dispatchAuthRequestStateChanged({ state: 'connected', sourceId: record.sourceId, toolkit: record.toolkit, sessionKey: record.sessionKey });

  if (!resumeSentSources.has(record.sourceId)) {
    resumeSentSources.add(record.sourceId);
    window.setTimeout(() => {
      agentWS.sendAuthResume({
        sessionKey: record.sessionKey,
        toolkit: record.toolkit,
        name: record.name,
        kind: record.kind,
        appId: record.appId,
      });
    }, 800);
  }
}

export function cancelAuthRequest(input: {
  sourceId: string;
  kind: 'composio' | 'app';
  toolkit: string;
  appId?: string;
  sessionKey?: string;
  name?: string;
}): void {
  const existing = requests.get(input.sourceId);
  const record: AuthRequestRecord = {
    sourceId: input.sourceId,
    kind: input.kind,
    toolkit: input.toolkit,
    name: input.name || existing?.name || input.toolkit,
    description: existing?.description || '',
    logo: existing?.logo,
    appId: input.appId || existing?.appId,
    sessionKey: input.sessionKey || existing?.sessionKey || 'default',
    actionUrl: existing?.actionUrl,
    pendingActionId: existing?.pendingActionId,
    expiresAt: existing?.expiresAt,
    status: 'cancelled',
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  stopAuthRequestWatch(input.sourceId);
  upsertRecord(record);
  dismissNotification(record);
  dispatchAuthRequestCancelled({ sourceId: record.sourceId, toolkit: record.toolkit, sessionKey: record.sessionKey });
  void resolvePendingUserActionBySource({
    kind: 'auth',
    sourceId: record.sourceId,
    status: 'resolved',
    sessionKey: record.sessionKey,
    name: record.name,
  }).catch(() => {});
}

export function clearAuthRequestsForSession(sessionKey: string): void {
  const key = sessionKey || 'default';
  let changed = false;
  for (const [sourceId, record] of requests.entries()) {
    if (record.sessionKey === key) {
      stopAuthRequestWatch(sourceId);
      requests.delete(sourceId);
      changed = true;
    }
  }
  if (!changed) return;
  persistActiveRequests();
  emit();
}

export function startAuthRequestWatch(input: {
  sourceId: string;
  kind: 'composio' | 'app';
  toolkit: string;
  name: string;
  appId?: string;
  sessionKey?: string;
}): void {
  if (pollTimers.has(input.sourceId)) return;
  markAuthRequestConnecting(input.sourceId);
  const startedAt = now();
  const poll = async () => {
    if (now() - startedAt > 5 * 60_000) {
      stopAuthRequestWatch(input.sourceId);
      return;
    }
    const result = input.kind === 'app' && input.appId
      ? await getAppConnection(input.appId)
      : await getComposioStatus(input.toolkit);
    if (result.success && result.data?.connected) {
      completeAuthRequest(input);
    }
  };
  void poll().catch(() => {});
  pollTimers.set(input.sourceId, window.setInterval(() => {
    void poll().catch(() => {});
  }, 3000));
}

export function stopAuthRequestWatch(sourceId: string): void {
  const timer = pollTimers.get(sourceId);
  if (!timer) return;
  window.clearInterval(timer);
  pollTimers.delete(sourceId);
}
