/**
 * Controls when desktop notifications are persisted and toasted.
 *
 * - critical: always (auth, approvals, failures, agent-requested alerts)
 * - default: only when the tab is in the background (user is away)
 * - silent: never — surface in chat / Work Status only
 */
export type NotificationPriority = 'critical' | 'default' | 'silent';

export function shouldPersistNotification(priority: NotificationPriority): boolean {
  if (priority === 'silent') return false;
  if (priority === 'critical') return true;
  if (typeof document === 'undefined') return true;
  return document.hidden;
}

/** Routine work-order lifecycle — visible in Work Status, not the notif drawer. */
export function workOrderNotificationPriority(
  status: string,
): NotificationPriority {
  if (status === 'failed') return 'critical';
  return 'silent';
}
