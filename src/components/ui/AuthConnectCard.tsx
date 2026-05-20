/**
 * AuthConnectCard — rendered inline in agent messages when the backend
 * requires OAuth for a Composio-backed service.
 *
 * Behaviour:
 *  - On mount: checks connection status immediately (handles page refresh)
 *  - On click: opens auth URL, starts polling for connection
 *  - On connected: updates card, auto-sends retry to agent, dismisses notification
 *  - Cross-syncs with the desktop notification via a shared "auth connect tracker"
 */

import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2, ExternalLink, ShieldCheck, RotateCw, X } from 'lucide-react'
import { composioFinalize, getAppConnection, getComposioAuthUrl, getComposioStatus, resendPendingUserAction } from '@/services/api'
import { useComputerStore } from '@/stores/agentStore'
import { useWindowStore } from '@/stores/windowStore'
import { PlatformIcon } from './PlatformIcon'
import { openAuthRedirect } from '@/lib/utils'
import { formatPlatformDescription, getPlatformColor, getPlatformDisplayName } from '@/lib/platforms'
import { authShieldStyle, platformIconFrameStyle } from './authActionStyles'
import { authSourceId } from '@/lib/authRequestState'
import {
  cancelAuthRequest,
  completeAuthRequest,
  registerAuthRequest,
  startAuthRequestWatch,
  updateAuthRequest,
  useAuthRequest,
} from '@/lib/authRequestCoordinator'
import type { AuthConnectPayload } from './authConnectMarker'

const AUTH_LINK_FALLBACK_TTL_MS = 10 * 60 * 1000

// ── Component ──

export function AuthConnectCard({ payload }: { payload: AuthConnectPayload }) {
  const displayName = getPlatformDisplayName(payload.toolkit, payload.name)
  const description = formatPlatformDescription(payload.description, payload.toolkit, displayName)
  const brandColor = getPlatformColor(payload.toolkit)
  const authKind = payload.kind || 'composio'
  const statusKey = payload.appId || payload.toolkit
  const sourceId = authSourceId(authKind, payload.toolkit, payload.appId)
  const authRequest = useAuthRequest(sourceId)

  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const connected = authRequest?.status === 'connected'
  const cancelled = authRequest?.status === 'cancelled'
  const connecting = authRequest?.status === 'connecting'
  const currentUrl = authRequest?.actionUrl ?? payload.url
  const expiresAt = authRequest?.expiresAt ?? (payload.url ? (payload.createdAt ?? Date.now()) + AUTH_LINK_FALLBACK_TTL_MS : null)
  const expired = Boolean(currentUrl && expiresAt && expiresAt <= now && !connected && !cancelled)
  const expiresInMs = expiresAt ? Math.max(0, expiresAt - now) : null
  const expiresLabel = expiresInMs == null
    ? ''
    : expired
      ? 'Link expired'
      : expiresInMs < 60_000
        ? `Expires in ${Math.max(1, Math.ceil(expiresInMs / 1000))}s`
        : `Expires in ${Math.ceil(expiresInMs / 60_000)}m`

  useEffect(() => {
    registerAuthRequest({
      kind: authKind,
      toolkit: payload.toolkit,
      name: displayName,
      description,
      url: payload.url,
      logo: payload.logo,
      appId: payload.appId,
      sessionKey: payload.sessionKey,
      expiresAt: payload.expiresAt,
      pendingActionId: payload.pendingActionId,
      createdAt: payload.createdAt,
    })
  }, [authKind, description, displayName, payload.appId, payload.createdAt, payload.expiresAt, payload.logo, payload.pendingActionId, payload.sessionKey, payload.toolkit, payload.url])

  const onConnected = useCallback(() => {
    completeAuthRequest({
      sourceId,
      kind: authKind,
      toolkit: payload.toolkit,
      name: payload.name,
      appId: payload.appId,
      sessionKey: payload.sessionKey,
    })
  }, [authKind, payload.appId, payload.name, payload.sessionKey, payload.toolkit, sourceId])

  useEffect(() => {
    if (!expiresAt || connected || cancelled) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [cancelled, connected, expiresAt])

  // On mount: check if already connected (handles page refresh)
  useEffect(() => {
    if (connected || cancelled) return
    let disposed = false
    const check = authKind === 'app' && payload.appId
      ? getAppConnection(payload.appId)
      : getComposioStatus(payload.toolkit)
    check.then(result => {
      if (!disposed && result.success && result.data?.connected) {
        onConnected()
      }
    }).catch(() => {})
    return () => { disposed = true }
  }, [authKind, cancelled, connected, payload.appId, payload.toolkit, onConnected])

  // Listen for postMessage from OAuth popup for instant detection
  useEffect(() => {
    if (connected || cancelled) return
    const handler = (e: MessageEvent) => {
      if (authKind === 'composio' && e.data?.type === 'composio:connected') {
        composioFinalize(typeof e.data.connectedAccountId === 'string' ? e.data.connectedAccountId : undefined)
          .finally(onConnected)
        return
      }
      if (e.data?.type === 'composio_auth_complete' && e.data.success &&
          e.data.toolkit?.toLowerCase() === payload.toolkit.toLowerCase()) {
        onConnected()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [authKind, cancelled, connected, payload.toolkit, onConnected])

  const handleClick = () => {
    if (expired) {
      void handleRefresh()
      return
    }
    const store = useWindowStore.getState()
    store.closeSpotlight()

    if (currentUrl) {
      startAuthRequestWatch({
        sourceId,
        kind: authKind,
        toolkit: payload.toolkit,
        name: payload.name,
        appId: payload.appId,
        sessionKey: payload.sessionKey || useComputerStore.getState().activeSessionKey || 'default',
      })
      openAuthRedirect(currentUrl)
      return
    }

    const registryMetadata = authKind === 'composio'
      ? { view: 'integrations', search: displayName, composioSlug: payload.toolkit }
      : { view: 'integrations', search: displayName, appId: payload.appId || statusKey }
    const windowId = store.openWindow('app-registry', {
      title: 'App Store',
      metadata: {
        ...registryMetadata,
        authUrl: payload.url,
      },
    })
    if (windowId) {
      store.updateWindow(windowId, { title: 'App Store', metadata: { ...registryMetadata, authUrl: payload.url } })
    }
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      if (payload.pendingActionId) {
        const result = await resendPendingUserAction(payload.pendingActionId)
        if (result.success) {
          const action = result.data.action
          updateAuthRequest(sourceId, {
            actionUrl: action.actionUrl || undefined,
            expiresAt: action.expiresAt ?? null,
            pendingActionId: action.id,
            status: action.actionUrl && action.expiresAt && action.expiresAt <= Date.now() ? 'expired' : 'pending',
          })
          setNow(Date.now())
          if (action.actionUrl) {
            startAuthRequestWatch({
              sourceId,
              kind: authKind,
              toolkit: payload.toolkit,
              name: payload.name,
              appId: payload.appId,
              sessionKey: payload.sessionKey || useComputerStore.getState().activeSessionKey || 'default',
            })
            openAuthRedirect(action.actionUrl)
          }
          return
        }
      }
      if (authKind === 'composio') {
        const result = await getComposioAuthUrl(payload.toolkit, payload.sessionKey)
        if (result.success && result.data.url) {
          updateAuthRequest(sourceId, {
            actionUrl: result.data.url,
            expiresAt: result.data.expiresAt ?? Date.now() + AUTH_LINK_FALLBACK_TTL_MS,
            status: 'pending',
          })
          setNow(Date.now())
          startAuthRequestWatch({
            sourceId,
            kind: authKind,
            toolkit: payload.toolkit,
            name: payload.name,
            appId: payload.appId,
            sessionKey: payload.sessionKey || useComputerStore.getState().activeSessionKey || 'default',
          })
          openAuthRedirect(result.data.url)
          return
        }
      }
      const store = useWindowStore.getState()
      store.openWindow('app-registry', { metadata: { view: 'integrations', search: displayName } })
    } finally {
      setRefreshing(false)
    }
  }

  const handleCancel = () => {
    if (cancelled || connected) return
    const sessionKey = payload.sessionKey || useComputerStore.getState().activeSessionKey || 'default'
    cancelAuthRequest({
      sourceId,
      kind: authKind,
      toolkit: payload.toolkit,
      appId: payload.appId,
      sessionKey,
      name: displayName,
    })
  }

  return (
    <div className="my-2 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] shadow-lg shadow-black/10 backdrop-blur">
      <div className="flex items-start gap-3 p-3.5">
        {/* Toolkit icon */}
        <div
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border p-[3px]"
          style={platformIconFrameStyle(brandColor, connected ? 'connected' : cancelled ? 'cancelled' : 'default')}
        >
          {connected ? (
            <Check className="w-5 h-5" />
          ) : cancelled ? (
            <X className="w-5 h-5" />
          ) : (
            <PlatformIcon platform={payload.toolkit} logoUrl={payload.logo} size={34} className="rounded-[10px]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <ShieldCheck className="h-3 w-3" />
            {connected ? 'Account connected' : cancelled ? 'Connection skipped' : 'Account connection required'}
          </p>
          <p className="mt-1 text-[15px] font-semibold text-text">
            Connect {displayName}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-text-muted">
            {connected ? 'Connected' : cancelled ? `Request cancelled. I'll continue without ${displayName} if possible.` : expired ? 'Link expired. Refresh it to continue.' : description}
          </p>
          {!connected && !cancelled && expiresLabel && (
            <p className={`mt-1 text-[10px] font-semibold ${expired ? 'text-amber-300/75' : 'text-text-muted/60'}`}>
              {expiresLabel}
            </p>
          )}
        </div>
      </div>

      <div className="px-3.5 pb-3.5">
        {connected ? (
          <div
            className="flex w-full items-stretch justify-center overflow-hidden rounded-[10px] text-sm font-semibold"
            style={authShieldStyle('connected')}
          >
            <span className="flex items-center justify-center bg-white/[0.025] px-3">
              <Check className="w-4 h-4" />
            </span>
            <span className="flex min-h-9 flex-1 items-center justify-center px-3 text-white/82">
              Connected
            </span>
          </div>
        ) : cancelled ? (
          <div
            className="flex w-full items-stretch justify-center overflow-hidden rounded-[10px] text-sm font-semibold"
            style={authShieldStyle('cancelled')}
          >
            <span className="flex items-center justify-center bg-white/[0.025] px-3">
              <X className="w-4 h-4" />
            </span>
            <span className="flex min-h-9 flex-1 items-center justify-center px-3 text-white/70">
              Request cancelled
            </span>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleClick}
              className="flex min-w-0 flex-1 cursor-pointer items-stretch justify-center overflow-hidden rounded-[10px] text-sm font-semibold transition-colors hover:bg-white/[0.035]"
              style={authShieldStyle('primary')}
            >
              {refreshing ? (
                <>
                  <span className="flex items-center justify-center bg-white/[0.025] px-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                  <span className="flex min-h-9 flex-1 items-center justify-center px-3 text-white/82">
                    Refreshing link...
                  </span>
                </>
              ) : expired ? (
                <>
                  <span className="flex items-center justify-center bg-white/[0.025] px-3">
                    <RotateCw className="w-4 h-4" />
                  </span>
                  <span className="flex min-h-9 flex-1 items-center justify-center px-3 text-white/82">
                    Retry with new link
                  </span>
                </>
              ) : connecting ? (
                <>
                  <span className="flex items-center justify-center bg-white/[0.025] px-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                  <span className="flex min-h-9 flex-1 items-center justify-center px-3 text-white/82">
                    Waiting for authorization...
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center justify-center bg-white/[0.025] px-3">
                    <ExternalLink className="w-4 h-4" />
                  </span>
                  <span className="flex min-h-9 flex-1 items-center justify-center px-3 text-white/82">
                    {currentUrl ? `Connect ${displayName}` : `Open ${displayName}`}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-white/[0.035] px-3 text-[12px] font-semibold text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/78"
              style={authShieldStyle('ghost')}
              title={`Cancel ${displayName} connection request`}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
