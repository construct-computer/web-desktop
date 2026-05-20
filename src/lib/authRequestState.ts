export const AUTH_REQUEST_CANCELLED_EVENT = 'construct:auth-request-cancelled';
export const AUTH_REQUEST_STATE_CHANGED_EVENT = 'construct:auth-request-state-changed';

export interface AuthRequestCancelledDetail {
  sourceId: string;
  toolkit?: string;
  sessionKey?: string;
}

export interface AuthRequestStateChangedDetail extends AuthRequestCancelledDetail {
  state: 'pending' | 'connected' | 'cancelled';
}

export function authSourceId(kind: 'composio' | 'app' | undefined, toolkit: string, appId?: string): string {
  const source = kind === 'app' ? (appId || toolkit) : toolkit;
  return `${kind === 'app' ? 'app' : 'composio'}:${source}`;
}

export function dispatchAuthRequestCancelled(detail: AuthRequestCancelledDetail): void {
  window.dispatchEvent(new CustomEvent<AuthRequestCancelledDetail>(AUTH_REQUEST_CANCELLED_EVENT, { detail }));
  window.dispatchEvent(new CustomEvent<AuthRequestStateChangedDetail>(AUTH_REQUEST_STATE_CHANGED_EVENT, {
    detail: { ...detail, state: 'cancelled' },
  }));
}

export function dispatchAuthRequestStateChanged(detail: AuthRequestStateChangedDetail): void {
  window.dispatchEvent(new CustomEvent<AuthRequestStateChangedDetail>(AUTH_REQUEST_STATE_CHANGED_EVENT, { detail }));
}
