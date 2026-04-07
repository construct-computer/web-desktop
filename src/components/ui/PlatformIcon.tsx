/**
 * PlatformIcon — renders the official logo for a platform/service.
 * Falls back to a colored initial badge if the image fails to load.
 */

import { useState } from 'react'

interface PlatformIconProps {
  platform: string
  className?: string
  size?: number
}

interface PlatformMeta {
  logoUrl: string
  color: string
  initials: string
  name: string
}

const PLATFORMS: Record<string, PlatformMeta> = {
  googlecalendar: {
    logoUrl: 'https://www.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_18_2x.png',
    color: '#4285F4',
    initials: 'GC',
    name: 'Google Calendar',
  },
  googledrive: {
    logoUrl: 'https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png',
    color: '#0F9D58',
    initials: 'GD',
    name: 'Google Drive',
  },
  slack: {
    logoUrl: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
    color: '#4A154B',
    initials: 'S',
    name: 'Slack',
  },
  telegram: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
    color: '#2AABEE',
    initials: 'T',
    name: 'Telegram',
  },
  gmail: {
    logoUrl: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
    color: '#EA4335',
    initials: 'GM',
    name: 'Gmail',
  },
  notion: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=notion.so&sz=64',
    color: '#000000',
    initials: 'N',
    name: 'Notion',
  },
  github: {
    logoUrl: 'https://github.githubassets.com/favicons/favicon-dark.svg',
    color: '#24292E',
    initials: 'GH',
    name: 'GitHub',
  },
  jira: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=jira.atlassian.com&sz=64',
    color: '#0052CC',
    initials: 'J',
    name: 'Jira',
  },
  linear: {
    logoUrl: 'https://www.google.com/s2/favicons?domain=linear.app&sz=64',
    color: '#5E6AD2',
    initials: 'L',
    name: 'Linear',
  },
}

export function PlatformIcon({ platform, className = '', size = 20 }: PlatformIconProps) {
  const [error, setError] = useState(false)
  const meta = PLATFORMS[platform.toLowerCase()]

  if (!meta || error) {
    const color = meta?.color || '#6B7280'
    const initials = meta?.initials || platform.charAt(0).toUpperCase()
    return (
      <div
        className={`rounded flex items-center justify-center text-white font-semibold ${className}`}
        style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
      >
        {initials}
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

/** Get the display name for a platform slug. */
export function getPlatformName(platform: string): string {
  return PLATFORMS[platform.toLowerCase()]?.name || platform
}
