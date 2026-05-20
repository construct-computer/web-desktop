import type { ChatMessage } from '@/stores/agentStore';

export type ActivityTone = 'default' | 'warn' | 'error' | 'info';

export const ACTIVITY_ICON_CLASS = 'text-blue-300 bg-blue-400/10 border border-blue-300/10';

export const ACTIVITY_COLORS: Record<string, string> = {
  browser: ACTIVITY_ICON_CLASS,
  web: ACTIVITY_ICON_CLASS,
  terminal: ACTIVITY_ICON_CLASS,
  file: ACTIVITY_ICON_CLASS,
  desktop: ACTIVITY_ICON_CLASS,
  calendar: ACTIVITY_ICON_CLASS,
  delegation: ACTIVITY_ICON_CLASS,
  background: ACTIVITY_ICON_CLASS,
  tool: ACTIVITY_ICON_CLASS,
};

export function activityToneClass(type?: ChatMessage['activityType'], tone: ActivityTone = 'default'): string {
  if (tone === 'error' || tone === 'warn' || tone === 'info') return ACTIVITY_ICON_CLASS;
  return ACTIVITY_COLORS[type || 'tool'] || ACTIVITY_COLORS.tool;
}
