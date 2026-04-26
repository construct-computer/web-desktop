import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSound } from '@/hooks/useSound';
import { MOBILE_APP_BAR_HEIGHT, Z_INDEX } from '@/lib/constants';
import type { WindowType } from '@/types';

// App icons
import iconLaunchpad from '@/icons/launchpad.png';
import iconAppStore from '@/icons/app-store.png';
import iconFiles from '@/icons/files.png';
import iconCalendar from '@/icons/calendar.png';
import iconEmail from '@/icons/email.png';
import iconSettings from '@/icons/settings.png';
import iconAccessLogs from '@/icons/access-logs.png';
import iconAccessControl from '@/icons/access-control.png';
import iconMemory from '@/icons/memory.png';
import iconText from '@/icons/text.png';
import iconGeneric from '@/icons/generic.png';

interface MobileAppItem {
  id: string;
  label: string;
  icon: string;
  windowType: WindowType;
  appId?: string;
  windowId?: string;
}

const pinnedItems: MobileAppItem[] = [
  { id: 'app-registry', label: 'App Store', icon: iconAppStore, windowType: 'app-registry' },
  { id: 'files', label: 'Files', icon: iconFiles, windowType: 'files' },
  { id: 'calendar', label: 'Calendar', icon: iconCalendar, windowType: 'calendar' },
  { id: 'email', label: 'Email', icon: iconEmail, windowType: 'email' },
];

const PINNED_WINDOW_TYPES = new Set<WindowType>(pinnedItems.map((i) => i.windowType));

const SYSTEM_TYPE_ICONS: Partial<Record<WindowType, string>> = {
  settings: iconSettings,
  auditlogs: iconAccessLogs,
  'access-control': iconAccessControl,
  memory: iconMemory,
  editor: iconText,
  'document-viewer': iconText,
  'app-registry': iconAppStore,
  about: iconGeneric,
};

const SYSTEM_TYPE_LABELS: Partial<Record<WindowType, string>> = {
  settings: 'Settings',
  auditlogs: 'Access Logs',
  'access-control': 'Access Control',
  memory: 'Memory',
  editor: 'Editor',
  'document-viewer': 'Editor',
  'app-registry': 'App Store',
  about: 'About',
};

export function MobileAppBar() {
  const { play } = useSound();
  const { windows, focusedWindowId, openWindow, focusWindow, minimizeWindow } = useWindowStore();
  const toggleLaunchpad = useWindowStore((s) => s.toggleLaunchpad);
  const agentActivity = useComputerStore((s) => s.agentActivity);
  const emailUnreadCount = useComputerStore((s) => s.emailUnreadCount);

  // Derive dynamic dock items from open windows
  const dynamicItems = useMemo(() => {
    const items: MobileAppItem[] = [];
    const seenTypes = new Set<WindowType>();
    const seenAppIds = new Set<string>();

    const PER_WINDOW_TYPES = new Set<WindowType>(['editor', 'document-viewer']);

    for (const win of windows) {
      if (win.type === 'app') {
        const appId = win.metadata?.appId as string;
        if (!appId || seenAppIds.has(appId)) continue;
        seenAppIds.add(appId);
        items.push({
          id: `dynamic-app-${appId}`,
          label: win.title,
          icon: win.icon || iconGeneric,
          windowType: 'app',
          appId,
        });
      } else if (PER_WINDOW_TYPES.has(win.type)) {
        items.push({
          id: `dynamic-${win.type}-${win.id}`,
          label: win.title,
          icon: win.icon || SYSTEM_TYPE_ICONS[win.type] || iconGeneric,
          windowType: win.type,
          windowId: win.id,
        });
      } else if (!PINNED_WINDOW_TYPES.has(win.type) && !seenTypes.has(win.type)) {
        seenTypes.add(win.type);
        items.push({
          id: `dynamic-${win.type}`,
          label: SYSTEM_TYPE_LABELS[win.type] || win.title,
          icon: SYSTEM_TYPE_ICONS[win.type] || iconGeneric,
          windowType: win.type,
        });
      }
    }
    return items;
  }, [windows]);

  const allItems = [...pinnedItems, ...dynamicItems];

  const handleTap = (item: MobileAppItem) => {
    play('click');

    const matchingWindows = item.windowId
      ? windows.filter((w) => w.id === item.windowId)
      : item.appId
        ? windows.filter((w) => w.type === 'app' && w.metadata?.appId === item.appId)
        : windows.filter((w) => w.type === item.windowType);

    if (matchingWindows.length === 0) {
      openWindow(item.windowType);
    } else if (matchingWindows.length === 1) {
      const win = matchingWindows[0];
      if (win.id === focusedWindowId && win.state !== 'minimized') {
        minimizeWindow(win.id);
      } else {
        focusWindow(win.id);
      }
    } else {
      const currentIdx = matchingWindows.findIndex((w) => w.id === focusedWindowId);
      const nextIdx = (currentIdx + 1) % matchingWindows.length;
      focusWindow(matchingWindows[nextIdx].id);
    }
  };

  const isWindowTypeActive = (type: WindowType) => windows.some((w) => w.type === type);
  const isAppActive = (appId: string) => windows.some((w) => w.type === 'app' && w.metadata?.appId === appId);
  
  const isItemActive = (item: MobileAppItem) => {
    if (item.windowId) return windows.some((w) => w.id === item.windowId);
    if (item.appId) return isAppActive(item.appId);
    return isWindowTypeActive(item.windowType);
  };

  const isItemFocused = (item: MobileAppItem) => {
    if (item.windowId) return focusedWindowId === item.windowId;
    if (item.appId) return windows.some((w) => w.type === 'app' && w.metadata?.appId === item.appId && w.id === focusedWindowId && w.state !== 'minimized');
    return windows.some((w) => w.type === item.windowType && w.id === focusedWindowId && w.state !== 'minimized');
  };

  return (
    <div
      data-tour="dock"
      className="absolute bottom-0 left-0 right-0 px-1 pb-[18px] pt-1.5
                 bg-white/70 dark:bg-black/70 backdrop-blur-2xl
                 border-t border-black/10 dark:border-white/10
                 overflow-x-auto scrollbar-none"
      style={{ height: MOBILE_APP_BAR_HEIGHT, zIndex: Z_INDEX.taskbar }}
    >
      <div className="flex items-center w-max mx-auto h-full">
        {/* Launchpad button */}
        <button
          className="flex flex-col items-center justify-center gap-1.5 shrink-0 min-w-[72px] h-full
                     active:scale-95 transition-transform"
          onClick={() => { play('click'); toggleLaunchpad(); }}
        >
          <img src={iconLaunchpad} alt="Launchpad" className="w-10 h-10" draggable={false} />
          <span className="text-[11px] font-medium text-black/80 dark:text-white/80 leading-none">
            Launchpad
          </span>
        </button>

        {/* Divider */}
        {dynamicItems.length > 0 && (
          <div className="w-px h-9 bg-black/10 dark:bg-white/10 mx-1 shrink-0" />
        )}

        {/* App items */}
        {allItems.map((item) => {
          const active = isItemActive(item);
          const focused = isItemFocused(item);
          const hasActivity = !!agentActivity[item.windowType];
          const badgeCount = item.windowType === 'email' ? emailUnreadCount : 0;

          return (
            <button
              key={item.id}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1.5 shrink-0 min-w-[72px] h-full',
                'active:scale-95 transition-transform',
              )}
              onClick={() => handleTap(item)}
            >
              <div className="relative">
                <img
                  src={item.icon}
                  alt={item.label}
                  className="w-10 h-10"
                  draggable={false}
                />
                {hasActivity && !badgeCount && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full
                                  bg-amber-400 animate-pulse
                                  shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                )}
                {badgeCount > 0 && (
                  <div className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-0.5
                                  flex items-center justify-center rounded-full
                                  bg-red-500 text-white text-[10px] font-bold leading-none
                                  shadow-[0_0_4px_rgba(239,68,68,0.5)]">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-medium text-black/80 dark:text-white/80 leading-none truncate max-w-[68px]">
                {item.label}
              </span>
              {/* Active indicator */}
              {active && (
                <div className="absolute bottom-[3px] w-1 h-1 rounded-full bg-[var(--color-accent)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
