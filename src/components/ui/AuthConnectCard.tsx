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

import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Loader2, ExternalLink } from 'lucide-react'
import { composioFinalize, getAppConnection, getComposioStatus } from '@/services/api'
import { useComputerStore, authConnectNotifIds, clearAuthCard } from '@/stores/agentStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useWindowStore } from '@/stores/windowStore'
import { agentWS } from '@/services/websocket'
import { PlatformIcon } from './PlatformIcon'
import { openAuthRedirect } from '@/lib/utils'
import { formatPlatformDescription, getPlatformColor, getPlatformDisplayName } from '@/lib/platforms'

// ── Types ──

export interface AuthConnectPayload {
  kind?: 'composio' | 'app'
  toolkit: string
  name: string
  description: string
  url?: string
  logo?: string
  appId?: string
  sessionKey?: string
}

// ── Global tracker: coordinates between card instances and notifications ──
// When any card or notification detects a connection, all others for the same toolkit update.
type AuthListener = (toolkit: string) => void
const authListeners = new Set<AuthListener>()
const connectedToolkits = new Set<string>()

function notifyAuthConnected(toolkit: string) {
  connectedToolkits.add(toolkit)
  authListeners.forEach(l => l(toolkit))
}

// ── Parser ──

const AUTH_MARKER_RE = /<!--AUTH_CONNECT:(.*?)-->/

export function parseAuthMarker(content: string): { payload: AuthConnectPayload; rest: string } | null {
  const match = content.match(AUTH_MARKER_RE)
  if (!match) return null
  try {
    const payload = JSON.parse(match[1]) as AuthConnectPayload
    const rest = content.replace(AUTH_MARKER_RE, '').trim()
    return { payload, rest }
  } catch {
    return null
  }
}

// ── Component ──

export function AuthConnectCard({ payload }: { payload: AuthConnectPayload }) {
  const displayName = getPlatformDisplayName(payload.toolkit, payload.name)
  const description = formatPlatformDescription(payload.description, payload.toolkit, displayName)
  const color = getPlatformColor(payload.toolkit)
  const authKind = payload.kind || 'composio'
  const statusKey = payload.appId || payload.toolkit

  const [connected, setConnected] = useState(() => connectedToolkits.has(payload.toolkit.toLowerCase()))
  const [polling, setPolling] = useState(false)
  const sentRetryRef = useRef(false)

  // Dismiss the corresponding notification and auto-send retry
  const onConnected = useCallback(() => {
    setConnected(true)
    setPolling(false)
    notifyAuthConnected(payload.toolkit.toLowerCase())

    // Dismiss the corresponding notification toast
    const notifId = authConnectNotifIds.get(payload.toolkit.toLowerCase())
    if (notifId) {
      const store = useNotificationStore.getState()
      store.dismissToast(notifId)
      store.removeNotification(notifId)
      authConnectNotifIds.delete(payload.toolkit.toLowerCase())
    }

    // Clear the persisted card from sessionStorage
    clearAuthCard(payload.toolkit)

    // Resume the blocked task without adding a fake user bubble.
    if (!sentRetryRef.current) {
      sentRetryRef.current = true
      setTimeout(() => {
        const sessionKey = payload.sessionKey || useComputerStore.getState().activeSessionKey || 'default'
        agentWS.sendAuthResume({
          sessionKey,
          toolkit: payload.toolkit,
          name: payload.name,
        })
      }, 800)
    }
  }, [payload.toolkit, payload.name, payload.sessionKey])

  // Listen for cross-instance connected notifications
  useEffect(() => {
    const listener: AuthListener = (toolkit) => {
      if (toolkit === payload.toolkit.toLowerCase()) {
        setConnected(true)
        setPolling(false)
      }
    }
    authListeners.add(listener)
    return () => { authListeners.delete(listener) }
  }, [payload.toolkit])

  // On mount: check if already connected (handles page refresh)
  useEffect(() => {
    if (connected) return
    let cancelled = false
    const check = authKind === 'app' && payload.appId
      ? getAppConnection(payload.appId)
      : getComposioStatus(payload.toolkit)
    check.then(result => {
      if (!cancelled && result.success && result.data?.connected) {
        onConnected()
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [authKind, connected, payload.appId, payload.toolkit, onConnected])

  // Poll while waiting for auth to complete
  useEffect(() => {
    if (!polling || connected) return
    const interval = setInterval(async () => {
      try {
        const result = authKind === 'app' && payload.appId
          ? await getAppConnection(payload.appId)
          : await getComposioStatus(payload.toolkit)
        if (result.success && result.data?.connected) {
          onConnected()
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, connected, authKind, payload.appId, payload.toolkit, onConnected])

  // Listen for postMessage from OAuth popup for instant detection
  useEffect(() => {
    if (connected) return
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
  }, [authKind, connected, payload.toolkit, onConnected])

  const handleClick = () => {
    const store = useWindowStore.getState()
    store.closeSpotlight()

    if (payload.url) {
      setPolling(true)
      openAuthRedirect(payload.url)
      return
    }

    setPolling(false)
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

  return (
    <div className="rounded-[20px] border border-border/80 bg-surface/95 overflow-hidden my-2 w-full max-w-md shadow-xl shadow-black/10 backdrop-blur">
      <div className="flex items-start gap-3 p-4">
        {/* Toolkit icon */}
        <div
          className="w-11 h-11 rounded-[15px] flex items-center justify-center shrink-0 overflow-hidden bg-white/95 border border-black/5 shadow-sm p-[3px]"
          style={{ backgroundColor: connected ? '#16a34a' : undefined }}
        >
          {connected ? (
            <Check className="w-5 h-5 text-white" />
          ) : (
            <PlatformIcon platform={payload.toolkit} logoUrl={payload.logo} size={38} className="rounded-[12px]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Account connection required
          </p>
          <p className="text-base font-semibold text-text mt-0.5">
            Connect {displayName}
          </p>
          <p className="text-sm text-text-muted mt-1 leading-relaxed">
            {connected ? 'Connected' : description}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        {connected ? (
          <div className="flex items-center justify-center gap-2 w-full rounded-lg px-3 py-2 text-sm font-medium text-white bg-green-600">
            <Check className="w-4 h-4" />
            Connected
          </div>
        ) : (
          <button
            onClick={handleClick}
            className="flex items-center justify-center gap-2 w-full rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity cursor-pointer"
            style={{ backgroundColor: color }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {polling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for authorization...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                {payload.url ? `Connect ${displayName}` : `Open ${displayName}`}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
