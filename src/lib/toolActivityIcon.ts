import {
  AlertCircle,
  AtSign,
  Bell,
  BookOpen,
  Bot,
  ClipboardList,
  Clock,
  Cog,
  Database,
  Info,
  Keyboard,
  ListTodo,
  MousePointerClick,
  Plug,
  ScrollText,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';
import { composioDisplayTool } from '@/stores/agentStoreUtils';
import { getAppByWindowType, SYSTEM_WINDOW_METADATA } from '@/lib/appRegistry';
import { routeToolToWindow } from '@/lib/toolWindowRouting';
import iconMemory from '@/icons/memory.png';
import iconCalendar from '@/icons/calendar.png';
import iconAppStore from '@/icons/app-store.png';
import iconGeneric from '@/icons/generic.png';
import iconChat from '@/icons/chat.png';
import { normalizePlatformSlug } from '@/lib/platforms';
import { useAppStore } from '@/stores/appStore';
import type { WindowType } from '@/types';

export type ActivityVisual =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'platform'; platform: string; logoUrl?: string }
  | { kind: 'lucide'; Icon: LucideIcon };

const NATIVE_CALENDAR_TOOLS = new Set([
  'agent_schedule',
  'schedule_task',
  'agent_calendar',
  'calendar',
]);

const WEB_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'web_scrape',
  'remote_browser',
  'remote_browser_session',
  'browser',
  'arxiv',
  'domain_intel',
]);

/** Tools with a native app icon that routeToolToWindow does not cover. */
const DIRECT_TOOL_WINDOW: Record<string, WindowType> = {
  audit_log: 'auditlogs',
  knowledge: 'memory',
  notify: 'settings',
  notify_user: 'settings',
  tool_search: 'app-registry',
  capability: 'app-registry',
};

const TOOL_PLATFORM_SLUG: Record<string, string> = {
  slack: 'slack',
  telegram: 'telegram',
  github: 'github',
  gmail: 'gmail',
  email: 'gmail',
  google_calendar: 'googlecalendar',
  google_drive: 'googledrive',
  notion: 'notion',
  composio: 'composio',
};

const ACTIVITY_LABEL_VERBS = new Set([
  'searching',
  'browsing',
  'running',
  'reading',
  'writing',
  'listing',
  'checking',
  'executing',
  'fetching',
  'loading',
  'saving',
  'deleting',
  'editing',
  'opening',
  'navigating',
  'clicking',
  'typing',
  'scrolling',
  'waiting',
  'connecting',
  'finding',
  'working',
  'themodel',
  'delivering',
  'focusing',
  'scheduling',
  'creating',
  'updating',
  'asking',
  'spawning',
  'consulting',
  'delegating',
]);

const KNOWN_TOOLKIT_SLUGS = new Set(Object.values(TOOL_PLATFORM_SLUG));

function isNativeCalendarTool(tool?: string): boolean {
  return !!tool && NATIVE_CALENDAR_TOOLS.has(tool.toLowerCase());
}

function imageVisual(src: string, alt: string): ActivityVisual {
  return { kind: 'image', src, alt };
}

function builtinIconForWindowType(windowType: WindowType | null): string | undefined {
  if (!windowType) return undefined;
  return getAppByWindowType(windowType)?.icon ?? SYSTEM_WINDOW_METADATA[windowType]?.icon;
}

function windowTypeForActivityType(type?: ChatMessage['activityType']): WindowType | null {
  switch (type) {
    case 'browser':
    case 'web':
      return 'browser';
    case 'terminal':
      return 'terminal';
    case 'file':
      return 'files';
    case 'calendar':
      return 'calendar';
    case 'desktop':
      return 'settings';
    default:
      return null;
  }
}

function resolveWindowTypeForTool(
  tool?: string,
  params?: Record<string, unknown>,
  type?: ChatMessage['activityType'],
): WindowType | null {
  const rawTool = tool?.toLowerCase();
  if (!rawTool) return windowTypeForActivityType(type);

  if (rawTool.startsWith('browser_')) return 'browser';
  if (WEB_TOOLS.has(rawTool)) return 'browser';
  if (isNativeCalendarTool(rawTool)) return 'calendar';
  if (rawTool === 'memory' || rawTool === 'knowledge') return 'memory';

  const direct = DIRECT_TOOL_WINDOW[rawTool];
  if (direct) return direct;

  const route = routeToolToWindow(rawTool, params);
  if (route) return route.type;

  return windowTypeForActivityType(type);
}

function resolveBuiltinIcon(
  tool?: string,
  type?: ChatMessage['activityType'],
  params?: Record<string, unknown>,
): string | undefined {
  const windowType = resolveWindowTypeForTool(tool, params, type);
  return builtinIconForWindowType(windowType);
}

function connectedToolkitLogo(slug: string): string | undefined {
  const normalized = normalizePlatformSlug(slug);
  return useAppStore.getState().connectedToolkits.find(
    (t) => normalizePlatformSlug(t.toolkit) === normalized,
  )?.logo;
}

function installedAppIcon(appId: string): string | undefined {
  const app = useAppStore.getState().installedApps.find((a) => a.id === appId);
  return app?.icon_url;
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

/** Lucide icons only for tools/labels with no branded PNG available. */
function lucideIconForTool(
  type?: ChatMessage['activityType'],
  tool?: string,
  label?: string,
): LucideIcon {
  const toolId = (tool || '').toLowerCase();
  const text = `${toolId} ${label || ''}`.toLowerCase();

  if (hasAny(text, [/delegate|consult|spawn_agent|spawn_agents|subagent|advisor|agent status/])) return Users;
  if (hasAny(text, [/background task/])) return Bot;
  if (hasAny(text, [/wait_for_agents|waiting for \d+ agent/])) return Clock;
  if (hasAny(text, [/task_|todo|task #|listing active tasks|listing all tasks|planning|plan/])) return ListTodo;
  if (hasAny(text, [/composio|integration|registry_app|connecting app|app connection/])) return Plug;
  if (hasAny(text, [/document_guide|coding guide|local app guide|web design guide|guide/])) return BookOpen;
  if (hasAny(text, [/arxiv|domain intel/])) return Search;
  if (hasAny(text, [/database|stored output|activity history|activity stats/])) return Database;
  if (hasAny(text, [/notify|notification|alert/])) return Bell;
  if (hasAny(text, [/ask_user|asking:/])) return AtSign;
  if (hasAny(text, [/observation|clipboard/])) return ClipboardList;
  if (hasAny(text, [/clicking|\bclick\b/])) return MousePointerClick;
  if (hasAny(text, [/typing|\btype\b/])) return Keyboard;
  if (hasAny(text, [/scrolling|\bscroll\b/])) return ScrollText;

  switch (type) {
    case 'delegation':
    case 'delegation-group':
    case 'consultation-group':
    case 'orchestration-group':
      return Users;
    case 'background':
    case 'background-group':
      return Bot;
    default:
      return Wrench;
  }
}

export function parseToolkitFromActivityLabel(label: string): string | null {
  const idx = label.indexOf(':');
  if (idx <= 0) return null;
  const prefix = label.slice(0, idx).trim();
  if (!prefix || prefix.length > 40) return null;
  const slug = normalizePlatformSlug(prefix);
  if (ACTIVITY_LABEL_VERBS.has(slug)) return null;
  if (KNOWN_TOOLKIT_SLUGS.has(slug)) return slug;
  if (/^[A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+){0,2}$/.test(prefix)) {
    return slug;
  }
  return null;
}

export function isBrandedActivityVisual(visual: ActivityVisual): boolean {
  if (visual.kind === 'image') return true;
  if (visual.kind === 'platform') return Boolean(visual.logoUrl);
  return false;
}

export function resolveActivityIconHints(
  tool: string,
  params?: Record<string, unknown>,
): { iconPlatform?: string; iconUrl?: string } {
  const rawTool = tool.toLowerCase();

  if (rawTool === 'composio') {
    const platform = composioDisplayTool(params);
    return {
      iconPlatform: platform,
      iconUrl: connectedToolkitLogo(platform),
    };
  }

  const appId = (params?.appId ?? params?.app_id) as string | undefined;
  if (rawTool === 'apps' && appId) {
    const iconUrl = installedAppIcon(appId);
    return { iconPlatform: appId, iconUrl: iconUrl || undefined };
  }

  const slug = TOOL_PLATFORM_SLUG[rawTool];
  if (slug) {
    const logo = connectedToolkitLogo(slug);
    if (logo) return { iconPlatform: slug, iconUrl: logo };
  }

  const windowType = resolveWindowTypeForTool(rawTool, params);
  const builtin = builtinIconForWindowType(windowType);
  if (builtin) {
    return { iconUrl: builtin, iconPlatform: windowType ?? undefined };
  }

  return {};
}

export function resolveActivityVisual(input: {
  type?: ChatMessage['activityType'];
  tool?: string;
  label?: string;
  iconPlatform?: string;
  iconUrl?: string;
  params?: Record<string, unknown>;
}): ActivityVisual {
  const { type, tool, label, iconPlatform, iconUrl, params } = input;
  const rawTool = tool?.toLowerCase();

  // 1. Explicit PNG hints from the event (e.g. installed app icon).
  if (iconUrl && !iconPlatform) {
    return imageVisual(iconUrl, tool || label || 'tool');
  }
  if (iconUrl && iconPlatform && (iconUrl.startsWith('/') || iconUrl.includes('.png') || iconUrl.includes('.svg'))) {
    return imageVisual(iconUrl, iconPlatform);
  }

  // 2. Connected integration logos (Composio / toolkit).
  const platform =
    iconPlatform
    || (tool && TOOL_PLATFORM_SLUG[tool.toLowerCase()])
    || parseToolkitFromActivityLabel(label || '')
    || (tool && normalizePlatformSlug(tool));

  if (iconPlatform || iconUrl || (tool && connectedToolkitLogo(tool))) {
    const slug = platform || tool || 'tool';
    const logoUrl = iconUrl || connectedToolkitLogo(slug) || connectedToolkitLogo(tool || '');
    if (logoUrl) {
      return { kind: 'platform', platform: slug, logoUrl };
    }
  }

  if (label) {
    const fromLabel = parseToolkitFromActivityLabel(label);
    const labelLogo = fromLabel ? connectedToolkitLogo(fromLabel) : undefined;
    if (fromLabel && labelLogo) {
      return { kind: 'platform', platform: fromLabel, logoUrl: labelLogo };
    }
  }

  // 3. Native Construct app icons (PNG) — preferred over generic Lucide.
  const builtin = resolveBuiltinIcon(tool, type, params);
  if (builtin) {
    const windowType = resolveWindowTypeForTool(tool, params, type);
    return imageVisual(builtin, windowType || type || tool || 'tool');
  }

  if (rawTool === 'ask_user') {
    return imageVisual(iconChat, 'Chat');
  }

  // 4. Generic PNG fallback (Construct default app icon).
  return imageVisual(iconGeneric, tool || label || 'Tool');
}

export function lucideIconForActivity(
  type?: ChatMessage['activityType'],
  tool?: string,
  label?: string,
): LucideIcon {
  return lucideIconForTool(type, tool, label);
}

export { AlertCircle, Info };
