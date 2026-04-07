/**
 * App Registry — central source of truth for all launchable apps.
 *
 * System apps are built-in and always present. Installed apps
 * come from the app store (future: fetched from backend API).
 */

import type { WindowType } from '@/types';

// Icons
import iconBrowser from '@/icons/browser.png';
import iconTerminal from '@/icons/terminal.png';
import iconFiles from '@/icons/files.png';
import iconCalendar from '@/icons/calendar.png';
import iconEmail from '@/icons/email.png';
import iconSettings from '@/icons/settings.png';
import iconMemory from '@/icons/memory.png';
import iconAccessLogs from '@/icons/access-logs.png';
import iconAccessControl from '@/icons/access-control.png';
import iconText from '@/icons/text.png';
import iconAppStore from '@/icons/app-store.png';

export interface AppDefinition {
  /** Unique identifier. */
  id: string;
  /** Display name under the icon. */
  label: string;
  /** WindowType to open when clicked. */
  windowType: WindowType;
  /** Path to icon image. */
  icon: string;
  /** Category for grouping in Launchpad. */
  category: 'system' | 'installed';
  /** Whether this app is pinned to the Dock by default. */
  dockPinned?: boolean;
  /** Extra keywords for search filtering. */
  keywords?: string[];
  /** Metadata for installed/connected apps. */
  appMetadata?: {
    appId: string;
    /** Custom UI config — only present for apps with a GUI. */
    ui?: {
      type: 'static';
      entry: string;
      width?: number;
      height?: number;
      minWidth?: number;
      minHeight?: number;
    };
    /** Composio toolkit slug — present for connected Composio integrations. */
    composioSlug?: string;
  };
}

/**
 * System apps — always available, ordered by importance.
 * Dock-pinned apps first, then utilities.
 */
export const SYSTEM_APPS: AppDefinition[] = [
  // ── App Registry ──
  {
    id: 'app-registry',
    label: 'App Registry',
    windowType: 'app-registry',
    icon: iconAppStore,
    category: 'system',
    keywords: ['apps', 'store', 'install', 'marketplace', 'registry', 'smithery', 'mcp', 'plugins', 'extensions'],
  },

  // ── System utilities ──
  {
    id: 'settings',
    label: 'Settings',
    windowType: 'settings',
    icon: iconSettings,
    category: 'system',
    keywords: ['preferences', 'config', 'configuration', 'options'],
  },
  {
    id: 'auditlogs',
    label: 'Audit Logs',
    windowType: 'auditlogs',
    icon: iconAccessLogs,
    category: 'system',
    keywords: ['audit', 'logs', 'history', 'activity', 'security'],
  },
  {
    id: 'access-control',
    label: 'Access Control',
    windowType: 'access-control',
    icon: iconAccessControl,
    category: 'system',
    keywords: ['permissions', 'security', 'rules', 'policies'],
  },
  {
    id: 'memory',
    label: 'Memory',
    windowType: 'memory',
    icon: iconMemory,
    category: 'system',
    keywords: ['remember', 'knowledge', 'facts', 'notes', 'long-term'],
  },

  // ── Permanent apps ──
  {
    id: 'terminal',
    label: 'Terminal',
    windowType: 'terminal',
    icon: iconTerminal,
    category: 'system',
    dockPinned: true,
    keywords: ['shell', 'bash', 'command', 'console', 'cli'],
  },
  {
    id: 'files',
    label: 'Files',
    windowType: 'files',
    icon: iconFiles,
    category: 'system',
    dockPinned: true,
    keywords: ['finder', 'file manager', 'documents', 'folders'],
  },
  {
    id: 'browser',
    label: 'Browser',
    windowType: 'browser',
    icon: iconBrowser,
    category: 'system',
    dockPinned: true,
    keywords: ['web', 'safari', 'chrome', 'internet', 'browse'],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    windowType: 'calendar',
    icon: iconCalendar,
    category: 'system',
    dockPinned: true,
    keywords: ['schedule', 'events', 'google calendar', 'agenda'],
  },
  {
    id: 'email',
    label: 'Email',
    windowType: 'email',
    icon: iconEmail,
    category: 'system',
    dockPinned: true,
    keywords: ['mail', 'inbox', 'agentmail', 'messages'],
  },
  {
    id: 'editor',
    label: 'Editor',
    windowType: 'editor',
    icon: iconText,
    category: 'system',
    keywords: ['code', 'vscode', 'edit', 'programming', 'ide', 'document', 'viewer', 'markdown', 'pdf', 'text'],
  },
];

/** Get a system app by its WindowType. */
export function getAppByWindowType(type: WindowType): AppDefinition | undefined {
  return SYSTEM_APPS.find((a) => a.windowType === type);
}

/** Get all apps that are pinned to the dock. */
export function getDockApps(): AppDefinition[] {
  return SYSTEM_APPS.filter((a) => a.dockPinned);
}
