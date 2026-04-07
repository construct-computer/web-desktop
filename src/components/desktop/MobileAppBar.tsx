import { cn } from '@/lib/utils';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSound } from '@/hooks/useSound';
import { MOBILE_APP_BAR_HEIGHT, Z_INDEX } from '@/lib/constants';
import type { WindowType } from '@/types';

// App icons
import iconTerminal from '@/icons/terminal.png';
import iconBrowser from '@/icons/browser.png';
import iconFiles from '@/icons/files.png';
import iconEmail from '@/icons/email.png';

interface MobileAppItem {
  id: string;
  label: string;
  icon: string;
  windowType: WindowType;
}

// Chat and Tracker live as MenuBar dropdown panels, not standalone windows.
const mobileAppItems: MobileAppItem[] = [
  { id: 'browser', label: 'Browser', icon: iconBrowser, windowType: 'browser' },
  { id: 'terminal', label: 'Terminal', icon: iconTerminal, windowType: 'terminal' },
  { id: 'files', label: 'Files', icon: iconFiles, windowType: 'files' },
  { id: 'email', label: 'Email', icon: iconEmail, windowType: 'email' },
];

export function MobileAppBar() {
  const { play } = useSound();
  const { windows, focusedWindowId, openWindow, focusWindow, minimizeWindow } = useWindowStore();
  const agentActivity = useComputerStore((s) => s.agentActivity);
  const emailUnreadCount = useComputerStore((s) => s.emailUnreadCount);

  const handleTap = (item: MobileAppItem) => {
    play('click');

    const openWindowsOfType = windows.filter((w) => w.type === item.windowType);

    if (openWindowsOfType.length === 0) {
      openWindow(item.windowType);
    } else if (openWindowsOfType.length === 1) {
      const win = openWindowsOfType[0];
      if (win.id === focusedWindowId && win.state !== 'minimized') {
        minimizeWindow(win.id);
      } else {
        focusWindow(win.id);
      }
    } else {
      const currentIdx = openWindowsOfType.findIndex((w) => w.id === focusedWindowId);
      const nextIdx = (currentIdx + 1) % openWindowsOfType.length;
      focusWindow(openWindowsOfType[nextIdx].id);
    }
  };

  const isActive = (type: WindowType) => windows.some((w) => w.type === type);
  const isFocused = (type: WindowType) =>
    windows.some((w) => w.type === type && w.id === focusedWindowId && w.state !== 'minimized');

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-around
                 bg-white/60 dark:bg-black/40 backdrop-blur-2xl
                 border-t border-black/8 dark:border-white/8
                 safe-area-bottom"
      style={{ height: MOBILE_APP_BAR_HEIGHT, zIndex: Z_INDEX.taskbar }}
    >
      {mobileAppItems.map((item) => {
        const active = isActive(item.windowType);
        const focused = isFocused(item.windowType);
        const hasActivity = !!agentActivity[item.windowType];
        const badgeCount = item.windowType === 'email' ? emailUnreadCount : 0;

        return (
          <button
            key={item.id}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full',
              'active:scale-95 transition-transform',
              focused ? 'opacity-100' : 'opacity-60',
            )}
            onClick={() => handleTap(item)}
          >
            <div className="relative">
              <img
                src={item.icon}
                alt={item.label}
                className="w-7 h-7"
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
                                bg-red-500 text-white text-[9px] font-bold leading-none
                                shadow-[0_0_4px_rgba(239,68,68,0.5)]">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </div>
              )}
            </div>
            <span className="text-[10px] font-medium text-black/70 dark:text-white/70 leading-none">
              {item.label}
            </span>
            {/* Active indicator */}
            <div
              className={cn(
                'w-1 h-1 rounded-full transition-opacity duration-200',
                active ? 'opacity-100 bg-[var(--color-accent)]' : 'opacity-0'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
