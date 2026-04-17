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

interface MobileAppItem {
  id: string;
  label: string;
  icon: string;
  windowType: WindowType;
}

const mobileAppItems: MobileAppItem[] = [
  { id: 'app-registry', label: 'App Store', icon: iconAppStore, windowType: 'app-registry' },
  { id: 'files', label: 'Files', icon: iconFiles, windowType: 'files' },
  { id: 'calendar', label: 'Calendar', icon: iconCalendar, windowType: 'calendar' },
  { id: 'email', label: 'Email', icon: iconEmail, windowType: 'email' },
];

export function MobileAppBar() {
  const { play } = useSound();
  const { windows, focusedWindowId, openWindow, focusWindow, minimizeWindow } = useWindowStore();
  const toggleLaunchpad = useWindowStore((s) => s.toggleLaunchpad);
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
      data-tour="dock"
      className="absolute bottom-0 left-0 right-0 flex items-center justify-around px-2 pb-5 pt-3
                 bg-white/70 dark:bg-black/50 backdrop-blur-2xl
                 border-t border-black/10 dark:border-white/10
                 safe-area-bottom"
      style={{ height: MOBILE_APP_BAR_HEIGHT, zIndex: Z_INDEX.taskbar }}
    >
      {/* Launchpad button */}
      <button
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full
                   active:scale-95 transition-transform"
        onClick={() => { play('click'); toggleLaunchpad(); }}
      >
        <img src={iconLaunchpad} alt="Launchpad" className="w-7 h-7" draggable={false} />
        <span className="text-[10px] font-medium text-black/80 dark:text-white/80 leading-none">
          Launchpad
        </span>
      </button>

      {/* App items */}
      {mobileAppItems.map((item) => {
        const active = isActive(item.windowType);
        const focused = isFocused(item.windowType);
        const hasActivity = !!agentActivity[item.windowType];
        const badgeCount = item.windowType === 'email' ? emailUnreadCount : 0;

        return (
          <button
            key={item.id}
            className={cn(
              'flex flex-col items-center justify-center gap-1 flex-1 h-full',
              'active:scale-95 transition-transform',
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
            <span className="text-[10px] font-medium text-black/80 dark:text-white/80 leading-none">
              {item.label}
            </span>
            {/* Active indicator */}
            {active && (
              <div className="w-1 h-1 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
