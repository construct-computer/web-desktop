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
import { getComposioStatus } from '@/services/api'
import { useComputerStore, authConnectNotifIds, clearAuthCard } from '@/stores/agentStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { PlatformIcon } from './PlatformIcon'
import { openAuthRedirect } from '@/lib/utils'

// ── Types ──

export interface AuthConnectPayload {
  toolkit: string
  name: string
  description: string
  url: string
}

// ── Toolkit colors (for the connect button) ──

const TOOLKIT_COLORS: Record<string, string> = {
  googlecalendar: '#4285F4',
  googledrive: '#0F9D58',
  gmail: '#EA4335',
  notion: '#000000',
  github: '#24292E',
  jira: '#0052CC',
  slack: '#4A154B',
  linear: '#5E6AD2',
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
  const color = TOOLKIT_COLORS[payload.toolkit.toLowerCase()] || '#6B7280'

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

    // Auto-send retry message (once)
    if (!sentRetryRef.current) {
      sentRetryRef.current = true
      setTimeout(() => {
        useComputerStore.getState().sendChatMessage(
          `I've connected ${payload.name}. Please continue with what you were doing.`
        )
      }, 800)
    }
  }, [payload.toolkit, payload.name])

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
    getComposioStatus(payload.toolkit).then(result => {
      if (!cancelled && result.success && result.data.connected) {
        setConnected(true)
        notifyAuthConnected(payload.toolkit.toLowerCase())
        clearAuthCard(payload.toolkit)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while waiting for auth to complete
  useEffect(() => {
    if (!polling || connected) return
    const interval = setInterval(async () => {
      try {
        const result = await getComposioStatus(payload.toolkit)
        if (result.success && result.data.connected) {
          onConnected()
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, connected, payload.toolkit, onConnected])

  // Listen for postMessage from OAuth popup for instant detection
  useEffect(() => {
    if (connected) return
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'composio_auth_complete' && e.data.success &&
          e.data.toolkit?.toLowerCase() === payload.toolkit.toLowerCase()) {
        onConnected()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [connected, payload.toolkit, onConnected])

  const handleClick = () => {
    setPolling(true)
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden my-2 max-w-sm">
      <div className="flex items-center gap-3 p-3">
        {/* Toolkit icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
          style={{ backgroundColor: connected ? '#16a34a' : undefined }}
        >
          {connected ? (
            <Check className="w-5 h-5 text-white" />
          ) : (
            <PlatformIcon platform={payload.toolkit} size={32} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text)]">{payload.name}</p>
          <p className="text-xs text-[var(--color-text-muted)] truncate">
            {connected ? 'Connected' : payload.description}
          </p>
        </div>
      </div>

      <div className="px-3 pb-3">
        {connected ? (
          <div className="flex items-center justify-center gap-2 w-full rounded-lg px-3 py-2 text-sm font-medium text-white bg-green-600">
            <Check className="w-4 h-4" />
            Connected
          </div>
        ) : (
          <button
            onClick={() => { openAuthRedirect(payload.url); }}
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
                Connect {payload.name}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
