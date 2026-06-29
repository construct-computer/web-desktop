import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWindowStore } from '@/stores/windowStore';
import { useWindowAccessoryStore } from '@/stores/windowAccessoryStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSound } from '@/hooks/useSound';
import { WINDOW_TRANSITION_MS, WINDOW_TRANSITION_EASING } from '@/lib/constants';
import { buildTransformOpacityTransition, kickOpenAnimation } from '@/lib/panelAnimation';
import type { WindowConfig } from '@/types';

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

  const [animating, setAnimating] = useState(false);
  /** Opacity fade on close only — open keeps opacity 1 so glass stays visible during slide-in */
  const [fadedOut, setFadedOut] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [minimizeExiting, setMinimizeExiting] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const unmountDelayMs = prefersReducedMotion ? 0 : WINDOW_TRANSITION_MS;
  const panelTransition = buildTransformOpacityTransition(
    WINDOW_TRANSITION_MS,
    WINDOW_TRANSITION_EASING,
    prefersReducedMotion,
  );

  useEffect(() => {
    if (isMinimized) {
      setShouldRender(true);
      setAnimating(false);
      setFadedOut(true);
      setMinimizeExiting(true);
      const t = setTimeout(() => {
        setShouldRender(false);
        setMinimizeExiting(false);
      }, unmountDelayMs);
      return () => clearTimeout(t);
    }

    setShouldRender(true);
    setMinimizeExiting(false);

    if (!isFocused) {
      setAnimating(false);
      setFadedOut(true);
      return;
    }

    setFadedOut(false);
    return kickOpenAnimation(setAnimating, prefersReducedMotion);
  }, [isFocused, isMinimized, prefersReducedMotion]);

  const finishClose = useCallback(() => {
    if (config.type === 'browser') {
      closeBrowserWindow(config.id);
      return;
    }
    closeWindow(config.id);
  }, [config.id, config.type, closeBrowserWindow, closeWindow]);

  const handleClose = useCallback(() => {
    play('close');
    setAnimating(false);
    setFadedOut(true);
    setTimeout(finishClose, unmountDelayMs);
  }, [play, finishClose, unmountDelayMs]);

  if (!shouldRender) return null;

  return (
    <div
      data-window-id={config.id}
      data-window-type={config.type}
      className={cn(
        'absolute inset-0',
        isFocused || minimizeExiting ? 'z-[200] visible' : 'z-[100] invisible pointer-events-none',
        minimizeExiting && 'pointer-events-none',
      )}
    >
      <div
        className="flex h-full w-full flex-col"
        style={{
          transform: isMinimized || minimizeExiting ? 'translateY(100%)' : (animating ? 'translateY(0)' : 'translateY(100%)'),
          opacity: fadedOut ? 0 : 1,
          transition: panelTransition,
          pointerEvents: animating ? 'auto' : 'none',
        }}
      >
        <div className="flex h-full w-full flex-col glass-window is-open" style={{ transform: 'translateZ(0)' }}>
          {/* Mobile Title Bar */}
          <div className="flex h-12 shrink-0 select-none touch-none items-center border-b border-black/10 px-2 surface-sidebar dark:border-white/10">
            <button
              onClick={handleClose}
              className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/20"
              aria-label="Close window"
            >
              <ChevronLeft className="h-6 w-6 text-blue-500" />
            </button>

            <div className="flex flex-1 items-center justify-center overflow-hidden px-2">
              {config.icon && (
                <img src={config.icon} alt="" className="mr-2 h-5 w-5 shrink-0" />
              )}
              <span className="truncate text-base font-semibold text-black/90 dark:text-white">
                {config.title}
              </span>
            </div>

            <div className="flex min-w-[44px] items-center justify-end gap-0.5">
              {titleBarAccessory}
            </div>
          </div>

          {/* Content Area */}
          <div className="relative flex-1 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
