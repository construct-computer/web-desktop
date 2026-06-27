/**
 * PlatformIcon — renders the official logo for a platform/service.
 * Falls back to a colored initial badge if the image fails to load.
 */

import { useEffect, useRef, useState } from 'react'
import { fetchPlatformMeta, getPlatformMeta } from '@/lib/platforms'

interface PlatformIconProps {
  platform: string
  className?: string
  size?: number
  logoUrl?: string
  name?: string
}

export function PlatformIcon({ platform, className = '', size = 20, logoUrl, name }: PlatformIconProps) {
  const [error, setError] = useState(false)
  const [fetched, setFetched] = useState<ReturnType<typeof getPlatformMeta> | null>(null)
  const key = JSON.stringify([platform, logoUrl, name])
  const prevKeyRef = useRef(key)

  if (key !== prevKeyRef.current) {
    prevKeyRef.current = key
    setError(false)
    setFetched(null)
  }

  useEffect(() => {
    if (logoUrl || name) return
    let cancelled = false
    void fetchPlatformMeta(platform).then((meta) => {
      if (!cancelled) setFetched(meta)
    })
    return () => {
      cancelled = true
    }
  }, [platform, logoUrl, name])

  const meta = fetched ?? getPlatformMeta(platform, logoUrl, name)

  if (!meta.logoUrl || error) {
    return (
      <div
        aria-label={meta.name}
        className={`rounded flex items-center justify-center text-white font-semibold ${className}`}
        style={{ width: size, height: size, backgroundColor: meta.color, fontSize: size * 0.38 }}
      >
        {meta.initials}
      </div>
    )
  }

  return (
    <img
      src={meta.logoUrl}
      alt={meta.name}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  )
}
