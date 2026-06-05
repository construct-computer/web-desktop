export function isTriggeredSessionKey(key: string): boolean {
  return key.startsWith('sched_') || key === 'scheduled_tasks' || key === 'calendar_reminders';
}
