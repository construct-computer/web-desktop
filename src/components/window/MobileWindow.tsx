import { useCallback, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWindowStore } from '@/stores/windowStore';
import { useWindowAccessoryStore } from '@/stores/windowAccessoryStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSound } from '@/hooks/useSound';
import type { WindowConfig } from '@/types';
import { MOBILE_MENUBAR_HEIGHT, MOBILE_APP_BAR_HEIGHT } from '@/lib/constants';

interface MobileWindowProps {
  config: WindowConfig;
  children: ReactNode;
}

export function MobileWindow({ config, children }: MobileWindowProps) {
  const { play } = useSound();
  const focusedWindowId = useWindowStore((s) => s.focusedWindowId);
  const titleBarAccessory = useWindowAccessoryStore((s) => s.accessories[config.id]);
  const closeBrowserWindow = useComputerStore((s) => s.closeBrowserWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  const isFocused = focusedWindowId === config.id;
  const isMinimized = config.state === 'minimized';

  const handleClose = useCallback(() => {
    play('close');
    if (config.type === 'browser') {
      closeBrowserWindow(config.id);
      return;
    }
    closeWindow(config.id);
  }, [config.id, config.type, closeBrowserWindow, closeWindow, play]);

  // If minimized, don't render or hide it completely
  if (isMinimized) return null;

  return (
    <div
      data-window-id={config.id}
      data-window-type={config.type}
      className={cn(
        'absolute inset-x-0 flex flex-col bg-white dark:bg-black',
        // Instead of conditionally unmounting, we use z-index and visibility to ensure
        // unfocused windows don't block interactions or render pointlessly, but keep their state.
        isFocused ? 'z-[200] visible' : 'z-[100] invisible'
      )}
      style={{
        top: MOBILE_MENUBAR_HEIGHT,
        bottom: MOBILE_APP_BAR_HEIGHT,
      }}
    >
      {/* Mobile Title Bar */}
      <div className="flex items-center h-12 px-2 shrink-0 border-b border-black/10 dark:border-white/10 select-none touch-none">
        {/* Back / Close button */}
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/20 transition-colors"
          aria-label="Close window"
        >
          <ChevronLeft className="w-6 h-6 text-blue-500" />
        </button>

        {/* Title */}
        <div className="flex-1 flex items-center justify-center overflow-hidden px-2">
          {config.icon && (
            <img src={config.icon} alt="" className="w-5 h-5 mr-2 shrink-0" />
          )}
          <span className="font-semibold text-base truncate text-black/90 dark:text-white">
            {config.title}
          </span>
        </div>

        {/* Right Accessory (or placeholder to balance the back button) */}
        <div className="flex items-center justify-end min-w-[40px] gap-0.5">
          {titleBarAccessory}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
