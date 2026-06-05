// `scheduled` is a pseudo-platform: scheduled-task runs reuse the external
// message card to render their task-context first bubble. It is never inferred
// from a session-key prefix (see inferExternalPlatform), so scheduled sessions
// stay interactive desktop chats.
export type ExternalPlatform = 'slack' | 'telegram' | 'email' | 'scheduled';
export type ExternalAccessRole = 'OWNER' | 'TRUSTED' | 'GUEST' | 'BLOCKED' | 'ONE_OFF';

export interface ExternalSourceMeta {
  platform: ExternalPlatform;
  senderId?: string;
  senderName?: string;
  senderHandle?: string;
  channelInfo?: string;
  subject?: string;
  messageUrl?: string;
  messageId?: string;
  threadId?: string;
  channelId?: string;
  threadTs?: string;
  teamId?: string;
  chatId?: string | number;
  // Scheduled-task metadata (platform === 'scheduled').
  scheduledAt?: string;
  recurrence?: string;
  deliveryChannel?: string;
}

export interface ExternalAccessMeta {
  role?: ExternalAccessRole;
  grant?: {
    type?: 'owner' | 'trusted' | 'guest' | 'one_off';
    approvalId?: string;
  };
}

export const EXTERNAL_PLATFORM_META: Record<ExternalPlatform, {
  label: string;
  color: string;
  accentClass: string;
}> = {
  slack: { label: 'Slack', color: '#4A154B', accentClass: 'text-purple-300 bg-purple-500/10 border-purple-400/20' },
  telegram: { label: 'Telegram', color: '#2AABEE', accentClass: 'text-sky-300 bg-sky-500/10 border-sky-400/20' },
  email: { label: 'Email', color: '#EA4335', accentClass: 'text-rose-300 bg-rose-500/10 border-rose-400/20' },
  scheduled: { label: 'Scheduled task', color: '#6366F1', accentClass: 'text-indigo-300 bg-indigo-500/10 border-indigo-400/20' },
};

export function inferExternalPlatform(sessionKey?: string | null): ExternalPlatform | null {
  if (!sessionKey) return null;
  if (sessionKey.startsWith('slack_')) return 'slack';
  if (sessionKey.startsWith('telegram_')) return 'telegram';
  if (sessionKey.startsWith('email_')) return 'email';
  return null;
}

export function isExternalSessionKey(sessionKey?: string | null): boolean {
  return inferExternalPlatform(sessionKey) !== null;
}

export function isExternalPlatform(value: unknown): value is ExternalPlatform {
  return value === 'slack' || value === 'telegram' || value === 'email' || value === 'scheduled';
}

export function coerceExternalSource(value: unknown): ExternalSourceMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (!isExternalPlatform(source.platform)) return undefined;
  return source as unknown as ExternalSourceMeta;
}

export function coerceExternalAccess(value: unknown): ExternalAccessMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as ExternalAccessMeta;
}

export function sourceLabel(source?: ExternalSourceMeta): string {
  if (!source) return '';
  return source.senderName || source.senderHandle || source.senderId || '';
}

export function sourceContext(source?: ExternalSourceMeta): string {
  if (!source) return '';
  if (source.platform === 'scheduled') return scheduledContext(source);
  if (source.subject) return source.subject;
  if (source.channelInfo) return source.channelInfo;
  if (source.threadTs) return `Thread ${source.threadTs}`;
  if (source.chatId) return `Chat ${source.chatId}`;
  return '';
}

/** Compose the context line for a scheduled-task card: "Fri, Jun 5, 9:00 AM · daily · deliver: email". */
function scheduledContext(source: ExternalSourceMeta): string {
  const parts: string[] = [];
  if (source.scheduledAt) {
    const ms = new Date(source.scheduledAt).getTime();
    if (Number.isFinite(ms)) {
      parts.push(new Date(ms).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }));
    }
  }
  if (source.recurrence) parts.push(source.recurrence);
  if (source.deliveryChannel) parts.push(`deliver: ${source.deliveryChannel}`);
  return parts.join(' · ');
}
