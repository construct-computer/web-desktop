import {
  AlertCircle,
  AppWindow,
  AtSign,
  Bell,
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  Camera,
  ClipboardList,
  Clock,
  Cog,
  Database,
  Eye,
  FileText,
  FolderOpen,
  Github,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Info,
  Keyboard,
  ListTodo,
  Mail,
  MessageSquare,
  Monitor,
  MousePointerClick,
  Network,
  Pencil,
  Plug,
  Puzzle,
  ScrollText,
  Search,
  Send,
  Terminal,
  Trash2,
  Users,
  Wrench,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';
import { composioDisplayTool } from '@/stores/agentStoreUtils';
import { getAppByWindowType, SYSTEM_WINDOW_METADATA } from '@/lib/appRegistry';
import iconMemory from '@/icons/memory.png';
import iconAppStore from '@/icons/app-store.png';
import iconGeneric from '@/icons/generic.png';
import { normalizePlatformSlug } from '@/lib/platforms';
import { useAppStore } from '@/stores/appStore';
import type { WindowType } from '@/types';

export type ActivityVisual =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'platform'; platform: string; logoUrl?: string }
  | { kind: 'lucide'; Icon: LucideIcon };

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

/** Label prefixes like "Searching:" are activity verbs, not toolkit names. */
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

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function lucideIconForTool(
  type?: ChatMessage['activityType'],
  tool?: string,
  label?: string,
): LucideIcon {
  const toolId = (tool || '').toLowerCase();
  const text = `${toolId} ${label || ''}`.toLowerCase();

  if (hasAny(text, [/gmail|email|\bmail\b|inbox|thread/])) return Mail;
  if (hasAny(text, [/slack/])) return MessageSquare;
  if (hasAny(text, [/telegram/])) return Send;
  if (hasAny(text, [/github/])) return Github;
  if (hasAny(text, [/youtube/])) return Youtube;
  if (hasAny(text, [/google_calendar|\bcalendar\b|schedule|event/])) return CalendarDays;
  if (hasAny(text, [/google_drive|\bdrive\b/])) return HardDrive;
  if (hasAny(text, [/memory|recall|forgetting memory/])) return Brain;
  if (hasAny(text, [/notify|notification|alert/])) return Bell;
  if (hasAny(text, [/task_|todo|task #|listing active tasks|listing all tasks|planning|plan/])) return ListTodo;
  if (hasAny(text, [/composio|integration|registry_app|connecting app|app connection/])) return Plug;
  if (hasAny(text, [/tool_search|finding tools/])) return Puzzle;
  if (hasAny(text, [/\bapp\b|app call|app registry|creating app|updating app|deleting app|app state/])) return AppWindow;
  if (hasAny(text, [/database|stored output|audit log|activity history|activity stats/])) return Database;
  if (hasAny(text, [/arxiv|domain|web_search|web fetch|web_fetch|fetching|searching|finding tools/])) return Search;
  if (hasAny(text, [/document_guide|coding guide|local app guide|web design guide|guide/])) return BookOpen;
  if (hasAny(text, [/image|screenshot/])) return Camera;
  if (hasAny(text, [/clicking|\bclick\b/])) return MousePointerClick;
  if (hasAny(text, [/typing|\btype\b/])) return Keyboard;
  if (hasAny(text, [/scrolling|\bscroll\b/])) return ScrollText;
  if (hasAny(text, [/reading page|snapshot|rendered page/])) return Eye;
  if (hasAny(text, [/browser|browsing|web_scrape|remote_browser/])) return Globe;
  if (hasAny(text, [/exec|terminal|running `|sandbox/])) return Terminal;
  if (hasAny(text, [/delete_file|deleting .*file|trash/])) return Trash2;
  if (hasAny(text, [/write_file|writing|edit|editing|saving .*workspace/])) return Pencil;
  if (hasAny(text, [/list_directory|listing .*files|listing \//])) return FolderOpen;
  if (hasAny(text, [/read_file|reading .*file|loading .*workspace/])) return FileText;
  if (hasAny(text, [/view_image/])) return ImageIcon;
  if (hasAny(text, [/delegate|consult|spawn_agent|spawn_agents|subagent|advisor|agent status/])) return Users;
  if (hasAny(text, [/background task/])) return Bot;
  if (hasAny(text, [/wait_for_agents|waiting for \d+ agent/])) return Clock;
  if (hasAny(text, [/ask_user|asking:/])) return AtSign;
  if (hasAny(text, [/observation|clipboard/])) return ClipboardList;

  switch (type) {
    case 'browser': return Globe;
    case 'web': return Search;
    case 'terminal': return Terminal;
    case 'file': return FileText;
    case 'desktop': return Monitor;
    case 'calendar': return CalendarDays;
    case 'delegation': return Network;
    case 'background': return Cog;
    case 'delegation-group':
    case 'consultation-group':
    case 'orchestration-group': return Users;
    case 'background-group': return Bot;
    default: return Wrench;
  }
}

function toolToWindowType(tool: string): WindowType | null {
  const t = tool.toLowerCase();
  if (t === 'browser' || t.startsWith('browser_')) return 'browser';
  if (t === 'exec' || t === 'terminal') return 'terminal';
  if (t === 'read_file' || t === 'list_directory') return 'files';
  if (t === 'read' || t === 'write' || t === 'edit' || t === 'list' || t.startsWith('file_')) return 'editor';
  if (t === 'google_drive' || t.startsWith('drive_')) return 'files';
  if (t.includes('calendar')) return 'calendar';
  if (t === 'email' || t.startsWith('send_email') || t.startsWith('read_email')) return 'email';
  if (t === 'memory' || t === 'knowledge') return 'memory';
  if (t === 'apps' || t === 'tool_search') return 'app-registry';
  return null;
}

function builtinIconForWindowType(windowType: WindowType | null): string | undefined {
  if (!windowType) return undefined;
  return getAppByWindowType(windowType)?.icon ?? SYSTEM_WINDOW_METADATA[windowType]?.icon;
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

  if (rawTool === 'web_search' || rawTool === 'web_fetch' || rawTool === 'web_scrape') {
    return {};
  }

  const slug = TOOL_PLATFORM_SLUG[rawTool];
  if (slug) {
    return { iconPlatform: slug, iconUrl: connectedToolkitLogo(slug) };
  }

  const windowType = toolToWindowType(rawTool);
  const builtin = builtinIconForWindowType(windowType);
  if (builtin) {
    return { iconUrl: builtin, iconPlatform: windowType ?? undefined };
  }

  if (rawTool === 'memory' || rawTool === 'knowledge') {
    return { iconUrl: iconMemory, iconPlatform: 'memory' };
  }

  return {};
}

export function resolveActivityVisual(input: {
  type?: ChatMessage['activityType'];
  tool?: string;
  label?: string;
  iconPlatform?: string;
  iconUrl?: string;
}): ActivityVisual {
  const { type, tool, label, iconPlatform, iconUrl } = input;
  const rawTool = tool?.toLowerCase();

  if (rawTool === 'web_search' || rawTool === 'web_fetch' || rawTool === 'web_scrape') {
    return { kind: 'lucide', Icon: Search };
  }

  if (iconUrl && !iconPlatform) {
    return { kind: 'image', src: iconUrl, alt: tool || label || 'tool' };
  }

  if (iconUrl && iconPlatform && (iconUrl.startsWith('/') || iconUrl.includes('.png') || iconUrl.includes('.svg'))) {
    return { kind: 'image', src: iconUrl, alt: iconPlatform };
  }

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

  const windowType = tool ? toolToWindowType(tool) : null;
  const builtin = builtinIconForWindowType(windowType ?? (type === 'terminal' ? 'terminal' : type === 'browser' ? 'browser' : type === 'file' ? 'files' : type === 'calendar' ? 'calendar' : null));
  if (builtin) {
    return { kind: 'image', src: builtin, alt: windowType || type || 'tool' };
  }

  if (type === 'file' || type === 'terminal' || type === 'browser' || type === 'calendar') {
    const byType = builtinIconForWindowType(
      type === 'file' ? 'files' : type === 'terminal' ? 'terminal' : type === 'browser' ? 'browser' : 'calendar',
    );
    if (byType) return { kind: 'image', src: byType, alt: type };
  }

  if (tool === 'apps' || tool === 'tool_search') {
    return { kind: 'image', src: iconAppStore, alt: 'Apps' };
  }

  const platformLogo = platform ? connectedToolkitLogo(platform) : undefined;
  if (platform && platform.length > 1 && platform !== 'tool' && platform !== 'composio' && platformLogo) {
    return { kind: 'platform', platform, logoUrl: platformLogo };
  }

  return { kind: 'lucide', Icon: lucideIconForTool(type, tool, label) };
}

export function lucideIconForActivity(
  type?: ChatMessage['activityType'],
  tool?: string,
  label?: string,
): LucideIcon {
  return lucideIconForTool(type, tool, label);
}

export { AlertCircle, Info };
