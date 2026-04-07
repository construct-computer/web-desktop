import { useState, useEffect, useCallback, useRef } from 'react'

import {
  getDriveConfigured,
  getDriveAuthUrl,
  getDriveStatus,
  disconnectDrive,
  syncDrive,
  composioFinalize,
  type DriveStatus,
  type DriveSyncReport,
} from '@/services/api'
import { openAuthRedirect } from '@/lib/utils'

export function useDriveSync(instanceId: string | null) {
  const [status, setStatus] = useState<DriveStatus>({ connected: false })
  const [isConfigured, setIsConfigured] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastReport, setLastReport] = useState<DriveSyncReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check if Drive integration is configured on the server
  useEffect(() => {
    let cancelled = false
    getDriveConfigured()
      .then(result => {
        if (!cancelled && result.success) {
          setIsConfigured(result.data.configured)
        }
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Fetch Drive connection status
  const refreshStatus = useCallback(async () => {
    const result = await getDriveStatus()
    if (result.success) {
      setStatus(result.data)
      return result.data
    }
    return null
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    refreshStatus()
  }, [isConfigured, refreshStatus])

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Listen for postMessage from OAuth popup for instant detection
  const pendingAccountIdRef = useRef<string>('')
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.data?.type === 'composio:connected') {
        // Learn the mapping before checking status
        if (pendingAccountIdRef.current) {
          await composioFinalize(pendingAccountIdRef.current)
          pendingAccountIdRef.current = ''
        }
        const s = await refreshStatus()
        if (s?.connected) {
          setIsConnecting(false)
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [refreshStatus])

  // Start OAuth flow in a popup and poll for connection
  const connect = useCallback(async () => {
    setError(null)
    const result = await getDriveAuthUrl()
    if (result.success && result.data.url) {
      pendingAccountIdRef.current = (result.data as any).connected_account_id || ''
      openAuthRedirect(result.data.url)
      setIsConnecting(true)
      // Poll for connection status (fallback if postMessage doesn't fire)
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        // Try to learn mapping first if we have the account id
        if (pendingAccountIdRef.current) {
          await composioFinalize(pendingAccountIdRef.current)
        }
        const statusResult = await getDriveStatus()
        if (statusResult.success && statusResult.data.connected) {
          setStatus(statusResult.data)
          setIsConnecting(false)
          pendingAccountIdRef.current = ''
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      }, 3000)
    } else if (result.success && result.data.error) {
      setError(result.data.error)
    } else if (!result.success) {
      setError(result.error)
    }
  }, [])

  // Disconnect Drive
  const disconnect = useCallback(async () => {
    setError(null)
    const result = await disconnectDrive()
    if (result.success) {
      setStatus({ connected: false })
      setLastReport(null)
    } else {
      setError('Failed to disconnect')
    }
  }, [])

  // Sync files
  const sync = useCallback(async () => {
    if (!instanceId || !status.connected) return
    setIsSyncing(true)
    setError(null)
    try {
      const result = await syncDrive(instanceId)
      if (result.success) {
        setLastReport(result.data)
        await refreshStatus()
      } else {
        setError(result.error || 'Sync failed')
      }
    } catch {
      setError('Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }, [instanceId, status.connected, refreshStatus])

  const clearError = useCallback(() => setError(null), [])

  return {
    status,
    isConfigured,
    isConnecting,
    isLoading,
    isSyncing,
    lastReport,
    error,
    connect,
    disconnect,
    sync,
    clearError,
    refreshStatus,
  }
}
