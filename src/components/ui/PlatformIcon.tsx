/**
 * PlatformIcon — renders the official logo for a platform/service.
 * Falls back to a colored initial badge if the image fails to load.
 */

import { useEffect, useState } from 'react'
import { getPlatformMeta, getPlatformName } from '@/lib/platforms'

interface PlatformIconProps {
  platform: string
  className?: string
  size?: number
  logoUrl?: string
}

export function PlatformIcon({ platform, className = '', size = 20, logoUrl }: PlatformIconProps) {
  const [error, setError] = useState(false)
  const meta = getPlatformMeta(platform, logoUrl)

  useEffect(() => {
    setError(false)
  }, [platform, meta.logoUrl])

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

export { getPlatformName }
