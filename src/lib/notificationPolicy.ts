/**
 * Controls when desktop notifications are persisted and toasted.
 *
 * - critical: always (auth, approvals, failures, agent-requested alerts)
 * - important: always (scheduled tasks, inbound messages, ask_user)
 * - default: only when the tab is in the background (user is away)
 * - silent: never — surface in chat only
 */
export type NotificationPriority = 'critical' | 'important' | 'default' | 'silent';

export function shouldPersistNotification(priority: NotificationPriority): boolean {
  if (priority === 'silent') return false;
  if (priority === 'critical' || priority === 'important') return true;
  if (typeof document === 'undefined') return true;
  return document.hidden;
}

