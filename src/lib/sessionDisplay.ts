import type { LucideIcon } from 'lucide-react';
import { CalendarClock, Hash, Mail, MessageSquare, Send, Gamepad2 } from 'lucide-react';
import { EXTERNAL_PLATFORM_META, inferExternalPlatform } from '@/lib/externalPlatforms';
import { isTriggeredSessionKey } from '@/stores/agentSessionKeys';
import { platformAppIcon } from '@/lib/platformAppIcons';

export type SessionDisplayKind =
  | 'desktop'
  | 'slack'
  | 'telegram'
  | 'email'
  | 'discord'
  | 'scheduled'
  | 'calendar'
  | 'legacy_scheduled'
  | 'legacy_reminders';

export interface SessionDisplayMeta {
  kind: SessionDisplayKind;
  label: string;
  icon: LucideIcon;
  iconUrl?: string;
  color: string;
  readOnly: boolean;
  legacy?: boolean;
}

const SCHEDULED_COLOR = EXTERNAL_PLATFORM_META.scheduled.color;

export function getSessionDisplayMeta(sessionKey?: string | null): SessionDisplayMeta {
  const key = sessionKey || '';
  if (key === 'scheduled_tasks') {
    return {
      kind: 'legacy_scheduled',
      label: 'Legacy scheduled',
      icon: CalendarClock,
      color: SCHEDULED_COLOR,
      readOnly: false,
      legacy: true,
    };
  }
  if (key === 'calendar_reminders') {
    return {
      kind: 'legacy_reminders',
      label: 'Legacy reminders',
      icon: CalendarClock,
      color: '#6366F1',
      readOnly: false,
      legacy: true,
    };
  }
  if (key.startsWith('calendar_evt_')) {
    return {
      kind: 'calendar',
      label: 'Calendar reminder',
      icon: CalendarClock,
      color: '#6366F1',
      readOnly: false,
    };
  }
  if (key.startsWith('sched_')) {
    return {
      kind: 'scheduled',
      label: 'Scheduled task',
      icon: CalendarClock,
      color: SCHEDULED_COLOR,
      readOnly: false,
    };
  }
  const external = inferExternalPlatform(key);
  if (external === 'slack') {
    return {
      kind: 'slack',
      label: EXTERNAL_PLATFORM_META.slack.label,
      icon: Hash,
      iconUrl: platformAppIcon('slack'),
      color: EXTERNAL_PLATFORM_META.slack.color,
      readOnly: true,
    };
  }
  if (external === 'telegram') {
    return {
      kind: 'telegram',
      label: EXTERNAL_PLATFORM_META.telegram.label,
      icon: Send,
      iconUrl: platformAppIcon('telegram'),
      color: EXTERNAL_PLATFORM_META.telegram.color,
      readOnly: true,
    };
  }
  if (external === 'email') {
    return {
      kind: 'email',
      label: EXTERNAL_PLATFORM_META.email.label,
      icon: Mail,
      color: EXTERNAL_PLATFORM_META.email.color,
      readOnly: true,
    };
  }
  if (external === 'discord') {
    return {
      kind: 'discord',
      label: EXTERNAL_PLATFORM_META.discord.label,
      icon: Gamepad2,
      iconUrl: platformAppIcon('discord'),
      color: EXTERNAL_PLATFORM_META.discord.color,
      readOnly: true,
    };
  }
  return {
    kind: 'desktop',
    label: 'Chat',
    icon: MessageSquare,
    color: 'currentColor',
    readOnly: false,
  };
}

export function isReadOnlySessionKey(sessionKey?: string | null): boolean {
  return getSessionDisplayMeta(sessionKey).readOnly;
}

export function isScheduledSessionKey(sessionKey?: string | null): boolean {
  if (!sessionKey) return false;
  return sessionKey.startsWith('sched_') || sessionKey === 'scheduled_tasks';
}

export function isCalendarReminderSessionKey(sessionKey?: string | null): boolean {
  if (!sessionKey) return false;
  return sessionKey.startsWith('calendar_evt_') || sessionKey === 'calendar_reminders';
}

export function isTriggeredDisplaySessionKey(sessionKey?: string | null): boolean {
  if (!sessionKey) return false;
  return isTriggeredSessionKey(sessionKey)
    || isCalendarReminderSessionKey(sessionKey);
}
