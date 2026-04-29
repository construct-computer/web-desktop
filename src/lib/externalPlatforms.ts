export type ExternalPlatform = 'slack' | 'telegram' | 'email';
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
  return value === 'slack' || value === 'telegram' || value === 'email';
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
  if (source.subject) return source.subject;
  if (source.channelInfo) return source.channelInfo;
  if (source.threadTs) return `Thread ${source.threadTs}`;
  if (source.chatId) return `Chat ${source.chatId}`;
  return '';
}
