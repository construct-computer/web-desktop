import { AGENT_EMAIL_DOMAIN } from '@/lib/config';

export function normalizeAgentEmailUsername(value: string): string {
  const raw = value.trim().toLowerCase();
  const local = raw.includes('@') ? raw.split('@')[0] : raw;
  return local.replace(/[^a-z0-9._+-]/g, '');
}

export function stagingAgentEmailUsername(email?: string | null): string {
  if (!email) return '';
  return normalizeAgentEmailUsername(email);
}

export function formatAgentEmail(username: string): string {
  return `${username}@${AGENT_EMAIL_DOMAIN}`;
}
