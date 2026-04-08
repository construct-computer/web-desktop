import { useRef, useState, useEffect, useMemo, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSound } from '@/hooks/useSound';
import { Z_INDEX } from '@/lib/constants';
import type { WindowType } from '@/types';

// Icons — pinned apps
import iconTerminal from '@/icons/terminal.png';
import iconBrowser from '@/icons/browser.png';
import iconFiles from '@/icons/files.png';
import iconCalendar from '@/icons/calendar.png';
import iconEmail from '@/icons/email.png';
import iconLaunchpad from '@/icons/launchpad.png';

// Icons — non-pinned system types (used for dynamic dock items)
import iconSettings from '@/icons/settings.png';
import iconAccessLogs from '@/icons/access-logs.png';
import iconAccessControl from '@/icons/access-control.png';
import iconMemory from '@/icons/memory.png';
import iconText from '@/icons/text.png';
import iconAppStore from '@/icons/app-store.png';
import iconGeneric from '@/icons/generic.png';

// ── Types ────────────────────────────────────────────────────

interface DockItemConfig {
  id: string;
  label: string;
  icon: string;
  windowType: WindowType;
  /** For app-type windows, the specific appId to match. */
  appId?: string;
  /** For per-window dock items (editor/document-viewer), the specific window ID. */
  windowId?: string;
}

// ── Constants ────────────────────────────────────────────────

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Gaussian magnification
const MAX_SCALE = 1.6;
const SIGMA = 60;
const PUSH_FACTOR = 22;

// Sizing — base (normal) and minimum (when dock shrinks to fit)
const BASE_ICON = 56;       // icon img size in px
const BASE_CONTAINER = 72;  // icon container size in px
const MIN_ICON = 36;
const MIN_CONTAINER = 48;
const BASE_GAP = 8;
const MIN_GAP = 4;
const DOCK_PAD_X = 24;      // px-3 * 2
const DIVIDER_APPROX_W = 10;

// Pinned dock items (always present)
const pinnedItems: DockItemConfig[] = [
  { id: 'app-registry', label: 'App Registry', icon: iconAppStore, windowType: 'app-registry' },
  { id: 'browser', label: 'Browser', icon: iconBrowser, windowType: 'browser' },
  { id: 'terminal', label: 'Terminal', icon: iconTerminal, windowType: 'terminal' },
  { id: 'files', label: 'Files', icon: iconFiles, windowType: 'files' },
  { id: 'calendar', label: 'Agent Calendar', icon: iconCalendar, windowType: 'calendar' },
  { id: 'email', label: 'Email', icon: iconEmail, windowType: 'email' },
];

const PINNED_WINDOW_TYPES = new Set<WindowType>(pinnedItems.map((i) => i.windowType));

/** Icon fallbacks for non-pinned system window types. */
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
  'app-registry': 'App Registry',
  about: 'About',
};

// ── Sizing computation ───────────────────────────────────────

function computeDockSizing(totalItems: number, dividerCount: number) {
  const available = (globalThis.innerWidth || 1920) - 80; // 40px margin each side
  const ideal =
    totalItems * (BASE_CONTAINER + BASE_GAP) +
    dividerCount * DIVIDER_APPROX_W +
    DOCK_PAD_X;

  if (ideal <= available) {
    return { iconSize: BASE_ICON, containerSize: BASE_CONTAINER, gap: BASE_GAP, needsScroll: false };
  }

  // Shrink proportionally to fit
  const usable = available - dividerCount * DIVIDER_APPROX_W - DOCK_PAD_X;
  const ratio = usable / (totalItems * (BASE_CONTAINER + BASE_GAP));

  const containerSize = Math.max(MIN_CONTAINER, Math.round(BASE_CONTAINER * ratio));
  const iconSize = Math.max(MIN_ICON, Math.round(BASE_ICON * ratio));
  const gap = Math.max(MIN_GAP, Math.round(BASE_GAP * ratio));

  // If we hit minimum size and still don't fit, enable scroll
  return { iconSize, containerSize, gap, needsScroll: containerSize <= MIN_CONTAINER };
}

// ── Calendar dock icon (scales with dock size) ───────────────

function CalendarDockIcon({ size }: { size: number }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const msUntilMidnight = () => {
      const t = new Date();
      t.setHours(24, 0, 0, 0);
      return t.getTime() - Date.now();
    };
    let timer = setTimeout(function tick() {
      setNow(new Date());
      timer = setTimeout(tick, msUntilMidnight());
    }, msUntilMidnight());
    return () => clearTimeout(timer);
  }, []);

  const month = MONTH_SHORT[now.getMonth()];
  const day = now.getDate();
  const s = size / 56; // scale relative to base 56px

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <img src={iconCalendar} alt="Agent Calendar" style={{ width: size, height: size }} draggable={false} />
      {/* Month in the red header band */}
      <span
        className="absolute inset-x-0 text-center font-semibold leading-none text-white pointer-events-none select-none"
        style={{ top: `${10 * s}px`, fontSize: `${8.5 * s}px`, letterSpacing: `${0.5 * s}px`, textShadow: '0 0.5px 1px rgba(0,0,0,0.2)' }}
      >
        {month}
      </span>
      {/* Day in the white area */}
      <span
        className="absolute inset-x-0 text-center font-bold leading-none text-[#333] pointer-events-none select-none"
        style={{ top: `${24 * s}px`, fontSize: `${24 * s}px` }}
      >
        {day}
      </span>
    </div>
  );
}

// ── Launchpad dock item ──────────────────────────────────────

const LaunchpadDockItem = forwardRef<
  HTMLDivElement,
  {
    mouseX: number | null;
    iconSize: number;
    containerSize: number;
    disableMagnification?: boolean;
    onClick: () => void;
    bouncing: boolean;
  }
>(({ mouseX, iconSize, containerSize, disableMagnification, onClick, bouncing }, ref) => {
  const innerRef = useRef<HTMLDivElement>(null);

  let scale = 1;
  let translateX = 0;

  if (!disableMagnification && mouseX !== null && innerRef.current) {
    const rect = innerRef.current.getBoundingClientRect();
    const iconCenterX = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - iconCenterX);
    const signedDistance = iconCenterX - mouseX;

    scale = 1 + (MAX_SCALE - 1) * Math.exp(-(distance * distance) / (2 * SIGMA * SIGMA));
    const normalized = signedDistance / (SIGMA * 1.2);
    translateX = Math.abs(normalized) < 0.15 ? 0 : normalized * (scale - 1) * PUSH_FACTOR;
  }

  const lift = (scale - 1) * 18;
  const bounceOffset = bouncing ? 22 : 0;

  return (
    <div
      ref={(el) => {
        (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      data-tour="launchpad"
      className="relative group flex flex-col items-center cursor-pointer shrink-0"
      onClick={onClick}
    >
      {/* Tooltip */}
      <div className="pointer-events-none absolute -top-14
                     opacity-0 scale-95
                     group-hover:opacity-100 group-hover:scale-100
                     transition-all duration-200
                     flex flex-col items-center z-50">
        <div className="px-3 py-1 text-xs text-white rounded-md
                        bg-black/80 backdrop-blur-md whitespace-nowrap">
          Launchpad
        </div>
        <div className="w-2 h-2 bg-black/80 rotate-45 -mt-1" />
      </div>

      {/* Icon */}
      <div
        className="relative flex items-center justify-center
                  transition-transform duration-300
                  ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  will-change-transform"
        style={{
          width: containerSize,
          height: containerSize,
          transform: `translateX(${translateX}px) translateY(-${lift + bounceOffset}px) scale(${scale})`,
        }}
      >
        <img
          src={iconLaunchpad}
          alt="Launchpad"
          style={{ width: iconSize, height: iconSize }}
          draggable={false}
        />
      </div>

      {/* No active dot for Launchpad */}
      <div className="w-1 h-1 mt-1 rounded-full opacity-0" />
    </div>
  );
});
LaunchpadDockItem.displayName = 'LaunchpadDockItem';

// ── Dock item ────────────────────────────────────────────────

function DockItem({
  item,
  mouseX,
  iconSize,
  containerSize,
  disableMagnification,
  isActive,
  isAgentActive,
  badgeCount,
  onClick,
}: {
  item: DockItemConfig;
  mouseX: number | null;
  iconSize: number;
  containerSize: number;
  disableMagnification?: boolean;
  isActive: boolean;
  isAgentActive: boolean;
  badgeCount?: number;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bouncing, setBouncing] = useState(false);

  let scale = 1;
  let translateX = 0;

  if (!disableMagnification && mouseX !== null && ref.current) {
    const rect = ref.current.getBoundingClientRect();
    const iconCenterX = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - iconCenterX);
    const signedDistance = iconCenterX - mouseX;

    scale = 1 + (MAX_SCALE - 1) * Math.exp(-(distance * distance) / (2 * SIGMA * SIGMA));
    const normalized = signedDistance / (SIGMA * 1.2);
    translateX = Math.abs(normalized) < 0.15 ? 0 : normalized * (scale - 1) * PUSH_FACTOR;
  }

  const lift = (scale - 1) * 18;
  const bounceOffset = bouncing ? 22 : 0;

  return (
    <div
      ref={ref}
      data-tour={item.id}
      className="relative group flex flex-col items-center cursor-pointer shrink-0"
      onClick={() => {
        if (bouncing) return;
        setBouncing(true);
        setTimeout(() => setBouncing(false), 300);
        onClick();
      }}
    >
      {/* Tooltip */}
      <div
        className="pointer-events-none absolute -top-14
                   opacity-0 scale-95
                   group-hover:opacity-100 group-hover:scale-100
                   transition-all duration-200
                   flex flex-col items-center z-50"
      >
        <div className="px-3 py-1 text-xs text-white rounded-md
                        bg-black/80 backdrop-blur-md whitespace-nowrap">
          {item.label}
        </div>
        <div className="w-2 h-2 bg-black/80 rotate-45 -mt-1" />
      </div>

      {/* Icon */}
      <div
        className="relative flex items-center justify-center
                   transition-transform duration-300
                   ease-[cubic-bezier(0.34,1.56,0.64,1)]
                   will-change-transform"
        style={{
          width: containerSize,
          height: containerSize,
          transform: `translateX(${translateX}px) translateY(-${lift + bounceOffset}px) scale(${scale})`,
        }}
      >
        {item.id === 'calendar' ? (
          <CalendarDockIcon size={iconSize} />
        ) : (
          <img
            src={item.icon}
            alt={item.label}
            style={{ width: iconSize, height: iconSize }}
            draggable={false}
          />
        )}
        {/* Dev app badge */}
        {item.appId === 'dev-app' && (
          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2
                          px-1 py-px rounded text-[7px] font-bold uppercase tracking-wider
                          bg-emerald-500 text-white leading-none
                          shadow-[0_0_4px_rgba(16,185,129,0.5)]">
            dev
          </div>
        )}
        {/* Agent activity badge */}
        {isAgentActive && !badgeCount && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full
                          bg-amber-400 animate-pulse
                          shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
        )}
        {/* Unread count badge (e.g. email) */}
        {!!badgeCount && badgeCount > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
                          flex items-center justify-center rounded-full
                          bg-red-500 text-white text-[10px] font-bold leading-none
                          shadow-[0_0_6px_rgba(239,68,68,0.5)]">
            {badgeCount > 99 ? '99+' : badgeCount}
          </div>
        )}
      </div>

      {/* Active indicator dot */}
      <div
        className={cn(
          'w-1 h-1 mt-1 rounded-full transition-opacity duration-200',
          isActive ? 'opacity-100 bg-black/60 dark:bg-white/70' : 'opacity-0',
        )}
      />
    </div>
  );
}

// ── Main Dock component ──────────────────────────────────────

export function Dock() {
  const dockRef = useRef<HTMLDivElement>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const { play } = useSound();
  const { windows, focusedWindowId, openWindow, focusWindow, minimizeWindow, switchWorkspace } = useWindowStore();
  const activeWorkspaceId = useWindowStore((s) => s.activeWorkspaceId);
  const missionControlActive = useWindowStore((s) => s.missionControlActive);
  const toggleLaunchpad = useWindowStore((s) => s.toggleLaunchpad);
  const agentActivity = useComputerStore((s) => s.agentActivity);
  const emailUnreadCount = useComputerStore((s) => s.emailUnreadCount);
  const launchpadRef = useRef<HTMLDivElement>(null);
  const [launchpadBounce, setLaunchpadBounce] = useState(false);

  // ── Derive dynamic dock items from open windows ──
  // Windows whose type is not in the pinned set get a temporary dock icon.
  // For 'app' windows, each unique appId gets its own icon.
  const dynamicItems = useMemo(() => {
    const items: DockItemConfig[] = [];
    const seenTypes = new Set<WindowType>();
    const seenAppIds = new Set<string>();

    // Window types that get individual dock items per window (like apps)
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
        // Each editor/document-viewer window gets its own dock icon
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

  // ── Compute dynamic icon sizing ──
  const { iconSize, containerSize, gap, needsScroll } = useMemo(() => {
    const totalItems = 1 + pinnedItems.length + dynamicItems.length; // +1 for launchpad
    const dividers = dynamicItems.length > 0 ? 2 : 1;
    return computeDockSizing(totalItems, dividers);
  }, [dynamicItems.length]);

  const dividerHeight = Math.floor(containerSize * 0.56);

  // ── Click handler (works for both pinned + dynamic items) ──
  const handleClick = (item: DockItemConfig) => {
    play('click');

    // Match windows: by windowId for per-window items, appId for apps, windowType for system items
    const matchingWindows = item.windowId
      ? windows.filter((w) => w.id === item.windowId)
      : item.appId
        ? windows.filter((w) => w.type === 'app' && w.metadata?.appId === item.appId)
        : windows.filter((w) => w.type === item.windowType);

    if (matchingWindows.length === 0) {
      // No windows open — launch one (only applies to pinned items)
      if (item.windowType === 'browser') {
        useComputerStore.getState().openBrowserWindow();
      } else {
        openWindow(item.windowType);
      }
    } else if (matchingWindows.length === 1) {
      const win = matchingWindows[0];
      const {
        stageManagerActive,
        stageManagerActiveIds,
        setStageActiveWindow,
        activeWorkspaceId: currentWs,
      } = useWindowStore.getState();

      if (win.workspaceId !== currentWs) {
        switchWorkspace(win.workspaceId);
        focusWindow(win.id);
      } else if (stageManagerActive && win.state !== 'minimized') {
        const wsActives = stageManagerActiveIds[currentWs] || [];
        if (wsActives.includes(win.id)) {
          minimizeWindow(win.id);
        } else {
          setStageActiveWindow(win.id);
        }
      } else if (win.id === focusedWindowId && win.state !== 'minimized') {
        minimizeWindow(win.id);
      } else {
        focusWindow(win.id);
      }
    } else {
      // Multiple windows — cycle through them
      const { stageManagerActive, setStageActiveWindow } = useWindowStore.getState();
      const currentIdx = matchingWindows.findIndex((w) => w.id === focusedWindowId);
      const nextIdx = (currentIdx + 1) % matchingWindows.length;
      const nextWin = matchingWindows[nextIdx];
      if (nextWin.workspaceId !== activeWorkspaceId) {
        switchWorkspace(nextWin.workspaceId);
      }
      if (stageManagerActive && nextWin.state !== 'minimized') {
        setStageActiveWindow(nextWin.id);
      } else {
        focusWindow(nextWin.id);
      }
    }
  };

  const isWindowTypeActive = (type: WindowType) => windows.some((w) => w.type === type);
  const isAppActive = (appId: string) =>
    windows.some((w) => w.type === 'app' && w.metadata?.appId === appId);

  return (
    <div
      className={cn(
        'absolute bottom-0 left-1/2 -translate-x-1/2 transition-all duration-[400ms] ease-out',
        missionControlActive
          ? 'translate-y-full opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100',
      )}
      style={{
        zIndex: Z_INDEX.taskbar,
        maxWidth: needsScroll ? 'calc(100vw - 40px)' : undefined,
      }}
    >
      <div className="relative bottom-0">
        {/* Dock bar */}
        <div
          ref={dockRef}
          className={cn(
            'relative flex items-end px-3 pt-1 pb-1 rounded-t-[14px]',
            'bg-white/20 dark:bg-black/30 backdrop-blur-2xl',
            'border-t border-l border-r border-white/20 dark:border-white/5',
            'shadow-[0_-5px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-5px_20px_rgba(0,0,0,0.4)]',
            needsScroll && 'overflow-x-auto scrollbar-none',
          )}
          style={{ gap: `${gap}px` }}
          onMouseMove={(e) => setMouseX(e.clientX)}
          onMouseLeave={() => setMouseX(null)}
        >
          {/* Launchpad icon */}
          <LaunchpadDockItem
            ref={launchpadRef}
            mouseX={mouseX}
            iconSize={iconSize}
            containerSize={containerSize}
            disableMagnification={needsScroll}
            onClick={() => {
              if (launchpadBounce) return;
              setLaunchpadBounce(true);
              setTimeout(() => setLaunchpadBounce(false), 300);
              play('click');
              toggleLaunchpad();
            }}
            bouncing={launchpadBounce}
          />

          {/* Divider: launchpad | pinned */}
          <div
            className="w-px bg-white/20 dark:bg-white/10 mx-0.5 self-center shrink-0"
            style={{ height: dividerHeight }}
          />

          {/* Pinned items */}
          {pinnedItems.map((item) => (
            <DockItem
              key={item.id}
              item={item}
              mouseX={mouseX}
              iconSize={iconSize}
              containerSize={containerSize}
              disableMagnification={needsScroll}
              isActive={isWindowTypeActive(item.windowType)}
              isAgentActive={!!agentActivity[item.windowType]}
              badgeCount={item.windowType === 'email' ? emailUnreadCount : undefined}
              onClick={() => handleClick(item)}
            />
          ))}

          {/* Dynamic items (from open windows not in pinned set) */}
          {dynamicItems.length > 0 && (
            <>
              {/* Divider: pinned | dynamic */}
              <div
                className="w-px bg-white/20 dark:bg-white/10 mx-0.5 self-center shrink-0"
                style={{ height: dividerHeight }}
              />
              {dynamicItems.map((item) => (
                <DockItem
                  key={item.id}
                  item={item}
                  mouseX={mouseX}
                  iconSize={iconSize}
                  containerSize={containerSize}
                  disableMagnification={needsScroll}
                  isActive={item.windowId ? windows.some(w => w.id === item.windowId) : item.appId ? isAppActive(item.appId) : isWindowTypeActive(item.windowType)}
                  isAgentActive={false}
                  onClick={() => handleClick(item)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
