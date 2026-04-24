import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Wifi, WifiOff, Sun, Moon, Volume2, VolumeOff, List, FileText, MessageSquare, Activity, Info, Settings, Lock, RotateCcw, Power, LogOut, Monitor, MessageCircle, Send, Mail, Calendar, X, LayoutGrid, Brain, Shield, Map, Package } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAgentTrackerStore } from '@/stores/agentTrackerStore';
import { useAgentStateLabel } from '@/hooks/useAgentStateLabel';
import { MENUBAR_HEIGHT, MOBILE_MENUBAR_HEIGHT, DOCK_HEIGHT, Z_INDEX } from '@/lib/constants';
import { DebugPanelToggle } from './DebugPanel';
import { formatTime, formatDate } from '@/lib/utils';
import { getSlackStatus } from '@/services/api';
import { useLatency } from '@/hooks/useLatency';
import { usePWA } from '@/hooks/usePWA';
import { openSettingsToSection } from '@/lib/settingsNav';
import { useAuthStore } from '@/stores/authStore';
import { Download, ExternalLink, Plus } from 'lucide-react';

// Lazy panel imports (these are the full window components rendered inline)
import { ChatWindow } from '@/components/apps/ChatWindow';
import { TrackerWindow } from '@/components/apps/TrackerWindow';
import type { WindowConfig } from '@/types';

// Assets
import constructLogo from '@/assets/logo.png';

interface MenuBarProps {
  onLogout?: () => void;
  onLockScreen?: () => void;
  onReconnect?: () => void;
  isConnected?: boolean;
  isMobile?: boolean;
}

interface MenuState {
  open: string | null;
}

// Dummy WindowConfig for panel components (they accept config but don't read .type)
const PANEL_CONFIG: WindowConfig = {
  id: '__menubar_panel__',
  type: 'settings', // placeholder — panel components don't use config.type
  title: '',
  x: 0, y: 0, width: 400, height: 500,
  minWidth: 300, minHeight: 300,
  state: 'normal',
  zIndex: 0,
  workspaceId: 'main',
};

export function MenuBar({ onLogout, onLockScreen, onReconnect, isConnected, isMobile }: MenuBarProps) {
  const [menu, setMenu] = useState<MenuState>({ open: null });
  const panel = useWindowStore((s) => s.menuBarPanel);
  const toggleMenuBarPanel = useWindowStore((s) => s.toggleMenuBarPanel);
  const closeMenuBarPanel = useWindowStore((s) => s.closeMenuBarPanel);
  const [time, setTime] = useState(new Date());
  const menuRef = useRef<HTMLDivElement>(null);
  const logoButtonRef = useRef<HTMLButtonElement>(null);
  const chatIconRef = useRef<HTMLButtonElement>(null);
  const trackerIconRef = useRef<HTMLButtonElement>(null);
  const [wifiHover, setWifiHover] = useState(false);
  const wifiRef = useRef<HTMLDivElement>(null);
  const latency = useLatency(wifiHover);
  const { isStandalone, isInstalled, deferredPrompt, installPWA } = usePWA();
  const { theme, soundEnabled, toggleTheme, toggleSound } = useSettingsStore();
  const { windows, focusedWindowId, openWindow } = useWindowStore();
  const workspaces = useWindowStore((s) => s.workspaces);
  const activeWorkspaceId = useWindowStore((s) => s.activeWorkspaceId);
  const switchWorkspace = useWindowStore((s) => s.switchWorkspace);
  const deleteWorkspace = useWindowStore((s) => s.deleteWorkspace);
  const missionControlActive = useWindowStore((s) => s.missionControlActive);
  const toggleMissionControl = useWindowStore((s) => s.toggleMissionControl);
  // Stage manager is permanently on — no toggle needed
  const trackerPanelOpen = useWindowStore((s) => s.trackerPanelOpen);
  const toggleTrackerPanel = useWindowStore((s) => s.toggleTrackerPanel);
  const toggleDrawer = useNotificationStore((s) => s.toggleDrawer);
  const drawerOpen = useNotificationStore((s) => s.drawerOpen);
  const unreadCount = useNotificationStore((s) => s.unreadCount)();
  const userPlan = useAuthStore((s) => s.user?.plan);
  // pendingApprovalCount available via Access Control dropdown item if needed

  // Slack connection state (for conditional menu items)
  const [slackConnected, setSlackConnected] = useState(false);
  useEffect(() => {
    getSlackStatus().then((r) => { if (r.success) setSlackConnected(r.data.connected); });
  }, []);

  // Agent state for animated icons
  const agentRunning = useComputerStore((s) => s.agentRunning);
  const agentThinking = useComputerStore((s) => s.agentThinking);
  const platformAgents = useComputerStore((s) => s.platformAgents);
  const operations = useAgentTrackerStore((s) => s.operations);

  // Compute activity indicators
  const hasActiveAgents =
    agentRunning ||
    Object.values(platformAgents).some((p) => p.running) ||
    Object.values(operations).some((op) => op.status === 'running' || op.status === 'aggregating');
  const isChatActive = !!(agentRunning || agentThinking);

  const focusedWindow = windows.find((w) => w.id === focusedWindowId);
  const activeAppName = 'Construct Computer';

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Check portaled dropdowns
        const dropdown = document.getElementById('menu-dropdown-portal');
        if (dropdown && dropdown.contains(e.target as Node)) return;
        const panelEl = document.getElementById('menubar-panel-portal');
        if (panelEl && panelEl.contains(e.target as Node)) return;
        setMenu({ open: null });
      }
    };
    if (menu.open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [menu.open]);

  // Robust tour integration
  useEffect(() => {
    const handleForceOpen = () => {
      setMenu({ open: 'apple' });
      closeMenuBarPanel();
    };
    const handleForceClose = () => setMenu({ open: null });
    
    window.addEventListener('construct:open-apple-menu', handleForceOpen);
    window.addEventListener('construct:close-apple-menu', handleForceClose);
    return () => {
      window.removeEventListener('construct:open-apple-menu', handleForceOpen);
      window.removeEventListener('construct:close-apple-menu', handleForceClose);
    };
  }, [closeMenuBarPanel]);

  // Close panel on outside click
  useEffect(() => {
    if (!panel) return;
    const handleClick = (e: MouseEvent) => {
      const panelEl = document.getElementById('menubar-panel-portal');
      if (panelEl && panelEl.contains(e.target as Node)) return;
      // Don't close if clicking inside a portaled child dropdown (e.g. session picker)
      const sessionDropdown = document.getElementById('chat-session-dropdown');
      if (sessionDropdown && sessionDropdown.contains(e.target as Node)) return;
      // Don't close if clicking the toggle button itself (toggle handler does that)
      if (chatIconRef.current?.contains(e.target as Node)) return;
      if (trackerIconRef.current?.contains(e.target as Node)) return;
      closeMenuBarPanel();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [panel, closeMenuBarPanel]);

  const toggleMenu = (name: string) => {
    setMenu((s) => ({ open: s.open === name ? null : name }));
    closeMenuBarPanel(); // close panels when menu opens
  };

  const hoverMenu = (name: string) => {
    if (menu.open && menu.open !== name) {
      setMenu({ open: name });
    }
  };

  const togglePanel = (name: 'chat' | 'tracker') => {
    toggleMenuBarPanel(name);
    setMenu({ open: null }); // close menus when panel opens
  };

  // Compute dropdown position from the logo button
  const getDropdownPos = () => {
    if (!logoButtonRef.current) return { top: MENUBAR_HEIGHT + 4, left: 6 };
    const rect = logoButtonRef.current.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left };
  };

  // Compute panel position anchored to the icon
  const getPanelPos = (ref: React.RefObject<HTMLButtonElement | null>, panelWidth: number, align: 'left' | 'right' = 'right') => {
    if (!ref.current) {
      return align === 'left'
        ? { top: MENUBAR_HEIGHT + 4, left: 8 }
        : { top: MENUBAR_HEIGHT + 4, right: 8 };
    }
    const rect = ref.current.getBoundingClientRect();
    if (align === 'left') {
      // Left-align panel to icon, clamped to viewport
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
      return { top: rect.bottom + 6, left };
    }
    // Right-align panel to icon, clamped to viewport
    const right = Math.max(8, window.innerWidth - rect.right);
    return { top: rect.bottom + 6, right };
  };

  const barHeight = isMobile ? MOBILE_MENUBAR_HEIGHT : MENUBAR_HEIGHT;

  return (
    <div
      ref={menuRef}
      className="absolute top-0 left-0 right-0 flex items-center select-none
                 bg-white/20 dark:bg-black/30 backdrop-blur-2xl
                 border-b border-white/5 dark:border-white/5 shadow-[0_1px_10px_rgba(0,0,0,0.05)]"
      style={{ height: barHeight, zIndex: Z_INDEX.taskbar }}
    >
      {/* Logo + app name menu (single button) */}
      <div className="relative flex items-center ml-3">
        <button
          ref={logoButtonRef}
          data-tour="menu"
          className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md transition ${
            menu.open === 'apple' ? 'bg-black/10 dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          onClick={() => toggleMenu('apple')}
          onMouseEnter={() => hoverMenu('apple')}
        >
          <img
            src={constructLogo}
            alt="construct.computer"
            className={isMobile ? 'h-5 w-5 object-contain invert dark:invert-0' : 'h-4 w-4 object-contain invert dark:invert-0'}
            draggable={false}
          />
          <span className={`font-semibold text-black/90 dark:text-white truncate ${isMobile ? 'text-base' : 'text-sm tracking-tight'}`}>
            {activeAppName}
          </span>
        </button>
        {menu.open === 'apple' && (
          <MenuDropdownPortal position={getDropdownPos()} isMobile={isMobile}>
            {/* About */}
            <MenuItem label="About Construct Computer" isMobile={isMobile} icon={<Info className="w-3.5 h-3.5" />} onClick={() => { openWindow('about'); setMenu({ open: null }); }} />
            <MenuDivider />

            {/* Apps & configuration */}
            <MenuItem label="App Registry..." isMobile={isMobile} icon={<Package className="w-3.5 h-3.5" />} onClick={() => { openWindow('app-registry'); setMenu({ open: null }); }} />
            <MenuItem label="Settings..." isMobile={isMobile} icon={<Settings className="w-3.5 h-3.5" />} onClick={() => { openWindow('settings'); setMenu({ open: null }); }} />
            <MenuDivider />
            <MenuItem label="Access Control" isMobile={isMobile} icon={<Shield className="w-3.5 h-3.5" />} onClick={() => { openWindow('access-control'); setMenu({ open: null }); }} />
            <MenuItem label="Audit Logs" isMobile={isMobile} icon={<FileText className="w-3.5 h-3.5" />} onClick={() => { openWindow('auditlogs'); setMenu({ open: null }); }} />
            <MenuItem label="Memory" isMobile={isMobile} icon={<Brain className="w-3.5 h-3.5" />} onClick={() => { openWindow('memory'); setMenu({ open: null }); }} />
            <MenuDivider />
            <MenuItem label="Take a Tour" isMobile={isMobile} icon={<Map className="w-3.5 h-3.5" />} onClick={() => { setMenu({ open: null }); window.dispatchEvent(new Event('construct:force-tour')); }} />
            <MenuDivider />

            {/* Session controls */}
            <MenuItem label="Lock Screen" isMobile={isMobile} icon={<Lock className="w-3.5 h-3.5" />} onClick={() => { onLockScreen?.(); setMenu({ open: null }); }} />
            {/* Restart/Shutdown removed — no containers in serverless mode */}
            <MenuDivider />
            <MenuItem label="Log Out..." isMobile={isMobile} icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => { onLogout?.(); setMenu({ open: null }); }} />
          </MenuDropdownPortal>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Right side - workspaces + status icons + clock */}
      <div className="flex items-center gap-1 px-3 shrink-0">

        {/* ── Workspace switcher ── */}
        {!isMobile && workspaces.length > 1 && (
          <div className="flex items-center gap-0.5 mr-1 px-1 py-0.5 rounded-md bg-black/5 dark:bg-white/5">
            {workspaces.map((ws, i) => {
              const isActive = ws.id === activeWorkspaceId;
              const windowCount = windows.filter(w => w.workspaceId === ws.id).length;
              const PlatformIcon = ws.platform === 'slack' ? MessageCircle
                : ws.platform === 'telegram' ? Send
                : ws.platform === 'email' ? Mail
                : ws.platform === 'calendar' ? Calendar
                : Monitor;
              return (
                <button
                  key={ws.id}
                  className={`relative flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white dark:bg-white/20 shadow-sm text-black/90 dark:text-white'
                      : 'text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  onClick={() => switchWorkspace(ws.id)}
                  title={`${ws.name}${windowCount > 0 ? ` (${windowCount} windows)` : ''} — Ctrl+${i + 1}`}
                >
                  <PlatformIcon className="w-3 h-3" style={isActive ? { color: ws.color } : undefined} />
                  <span className="max-w-[80px] truncate">{ws.name}</span>
                  {ws.active && (
                    <span className="flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full opacity-75" style={{ backgroundColor: ws.color }} />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: ws.color }} />
                    </span>
                  )}
                  {ws.id !== 'main' && isActive && (
                    <button
                      className="ml-0.5 rounded hover:bg-black/10 dark:hover:bg-white/15 p-0.5"
                      onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id); }}
                      title="Close workspace"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Workspaces button — hidden, workspaces are manually managed via Mission Control
        {!isMobile && (
          <button
            className={`flex items-center gap-1.5 rounded-md transition p-1.5 mr-1 ${
              missionControlActive
                ? 'bg-[var(--color-accent)] shadow-sm'
                : 'hover:bg-black/8 dark:hover:bg-white/10'
            }`}
            onClick={toggleMissionControl}
            title="Workspaces (Ctrl+Up)"
          >
            <LayoutGrid className={`w-3.5 h-3.5 ${
              missionControlActive ? 'text-white' : 'text-black/80 dark:text-white/90'
            }`} />
          </button>
        )}
        */}

        {/* ── Agent activity indicator (compact glanceable status) ── */}
        {!isMobile && <AgentActivityIndicator />}

        {/* Debug console toggle — staging only */}
        {!isMobile && window.location.hostname !== 'beta.construct.computer' && <DebugPanelToggle />}

        {/* Upgrade Pill */}
        {!isMobile && (!userPlan || userPlan === 'free') && (
          <button
            onClick={() => openSettingsToSection('subscription')}
            className="flex items-center justify-center gap-1 h-6 pl-1.5 pr-2.5 mr-1 rounded-md transition-all cursor-pointer bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400"
            title="Upgrade Plan"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span className="text-xs font-medium">Upgrade</span>
          </button>
        )}

        {/* PWA Install / Open App Pill */}
        {!isStandalone && !isMobile && (
          (deferredPrompt || !isInstalled) ? (
            <button
              onClick={installPWA}
              disabled={!deferredPrompt}
              className={`flex items-center justify-center gap-1.5 h-6 pl-2 pr-2.5 mr-1 rounded-md transition-all ${
                deferredPrompt 
                  ? 'bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400 cursor-pointer'
                  : 'text-black/30 dark:text-white/30 cursor-default'
              }`}
              title="Install App"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Install App</span>
            </button>
          ) : (
            <button
              onClick={() => {
                alert("To open the app, click the 'Open in app' icon in your browser's address bar or launch it from your applications folder.");
              }}
              className="flex items-center justify-center gap-1.5 h-6 pl-2 pr-2.5 mr-1 rounded-md transition-all cursor-pointer bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400"
              title="Open in App"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Open in App</span>
            </button>
          )
        )}

        {/* Connection — clickable when disconnected to trigger manual reconnect */}
        {isConnected ? (
          <div
            ref={wifiRef}
            className={`relative ${isMobile ? 'p-1.5' : 'p-1'} rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition cursor-default`}
            onMouseEnter={() => setWifiHover(true)}
            onMouseLeave={() => setWifiHover(false)}
          >
            <Wifi className={isMobile ? 'w-5 h-5 text-black/70 dark:text-white' : 'w-4 h-4 text-black/70 dark:text-white'} />
            {wifiHover && <LatencyPopover anchorRef={wifiRef} latency={latency} />}
          </div>
        ) : (
          <button
            className={`${isMobile ? 'p-1.5' : 'p-1'} rounded-md hover:bg-black/8 dark:hover:bg-white/10 transition`}
            onClick={onReconnect}
            title="Disconnected — click to reconnect"
          >
            <WifiOff className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'} text-red-500 dark:text-red-400 animate-pulse`} />
          </button>
        )}

        {/* Clock */}
        <span className={`font-medium text-black/90 dark:text-white px-2 ${isMobile ? 'text-base' : 'text-sm tracking-tight'}`} title={formatDate(time)}>
          {formatTime(time)}
        </span>

        {/* Notification center toggle */}
        <button
          id="notification-center-toggle"
          className={`relative rounded-md transition ${isMobile ? 'p-2' : 'p-1'} ${
            drawerOpen ? 'bg-black/10 dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          onClick={toggleDrawer}
          title="Notifications"
        >
          <List className={isMobile ? 'w-5 h-5 text-black/70 dark:text-white' : 'w-4 h-4 text-black/70 dark:text-white'} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center px-0.5 rounded-full bg-[var(--color-accent)] text-white text-[9px] font-bold leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Panel portals removed — Chat uses Spotlight, Tracker uses sliding side panel */}
    </div>
  );
}

// --- Agent Activity Indicator ---

/**
 * Smooth scrolling text for the menubar agent indicator.
 *
 * Two modes, auto-detected:
 * - **Streaming** (text changes rapidly): shows the tail end of text, pinned to
 *   the right with a smooth CSS transition so new tokens glide in naturally.
 * - **Static** (text stable for >800ms): gentle back-and-forth marquee at 35px/s
 *   with fade-out edges and pauses at each end.
 */
function MarqueeText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  // --- Streaming vs static detection ---
  const lastChangeRef = useRef<number>(performance.now());
  const [isStreaming, setIsStreaming] = useState(false);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    lastChangeRef.current = performance.now();
    setIsStreaming(true);
    // After text stops changing for 800ms, switch to static marquee mode
    clearTimeout(streamTimerRef.current);
    streamTimerRef.current = setTimeout(() => setIsStreaming(false), 800);
    return () => clearTimeout(streamTimerRef.current);
  }, [text]);

  // --- Streaming mode: show tail, smooth transition ---
  const displayText = useMemo(() => {
    if (!isStreaming || !text) return text;
    // Show the last ~60 chars, breaking at a word boundary
    if (text.length <= 60) return text;
    const tail = text.slice(-60);
    const firstSpace = tail.indexOf(' ');
    return firstSpace > 0 && firstSpace < 15 ? '…' + tail.slice(firstSpace + 1) : '…' + tail;
  }, [text, isStreaming]);

  // --- Static marquee mode ---
  const [marqueeOffset, setMarqueeOffset] = useState(0);
  const rafRef = useRef<number>(0);
  const marqueeState = useRef({ paused: true, pauseStart: 0, direction: 1, lastTime: 0 });

  useEffect(() => {
    if (isStreaming) {
      // Cancel any running marquee when streaming
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setMarqueeOffset(0);
      return;
    }

    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    const scrollWidth = inner.scrollWidth;
    const containerWidth = container.clientWidth;
    if (scrollWidth <= containerWidth + 2) {
      setMarqueeOffset(0);
      return;
    }

    const maxOffset = scrollWidth - containerWidth + 16;
    const speed = 35; // px/s
    const pauseMs = 1800;

    const ms = marqueeState.current;
    ms.paused = true;
    ms.pauseStart = performance.now();
    ms.direction = 1;
    ms.lastTime = 0;

    const animate = (time: number) => {
      if (ms.paused) {
        if (time - ms.pauseStart >= pauseMs) {
          ms.paused = false;
          ms.lastTime = time;
        }
        rafRef.current = requestAnimationFrame(animate);
        return;
      }
      const dt = ms.lastTime ? (time - ms.lastTime) / 1000 : 0;
      ms.lastTime = time;

      setMarqueeOffset(prev => {
        let next = prev + speed * dt * ms.direction;
        if (ms.direction === 1 && next >= maxOffset) {
          next = maxOffset;
          ms.paused = true;
          ms.pauseStart = time;
          ms.direction = -1;
        } else if (ms.direction === -1 && next <= 0) {
          next = 0;
          ms.paused = true;
          ms.pauseStart = time;
          ms.direction = 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isStreaming, displayText]);

  // Determine if we need the fade mask
  const needsMask = useMemo(() => {
    const el = innerRef.current;
    const cEl = containerRef.current;
    if (!el || !cEl) return isStreaming; // assume yes while streaming
    return el.scrollWidth > cEl.clientWidth + 2;
  }, [displayText, isStreaming]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{
        maskImage: needsMask || isStreaming
          ? 'linear-gradient(to right, transparent 0%, black 10%, black 88%, transparent 100%)'
          : undefined,
        WebkitMaskImage: needsMask || isStreaming
          ? 'linear-gradient(to right, transparent 0%, black 10%, black 88%, transparent 100%)'
          : undefined,
      }}
    >
      <span
        ref={innerRef}
        className="text-[10px] leading-tight text-black/50 dark:text-white/45 whitespace-nowrap inline-block"
        style={isStreaming
          ? { transition: 'transform 0.3s ease-out', transform: 'translateX(0px)' }
          : { transform: `translateX(-${marqueeOffset}px)`, willChange: 'transform' }
        }
      >
        {displayText}
      </span>
    </div>
  );
}

function AgentActivityIndicator() {
  const { stateLabel, isActive, isIdle } = useAgentStateLabel();
  const toggleSpotlight = useWindowStore((s) => s.toggleSpotlight);

  if (isIdle) return null;

  return (
    <button
      onClick={toggleSpotlight}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/8 max-w-[180px] hover:bg-black/10 dark:hover:bg-white/15 transition cursor-pointer"
      title="Show agent chat (Ctrl+Space)"
    >
      {/* Status dot */}
      <span className="relative flex-shrink-0 flex h-2 w-2">
        {isActive && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isActive ? 'bg-blue-400' : 'bg-gray-400'}`} />
      </span>
      {/* Status text */}
      <span className="text-[11px] font-medium truncate text-black/70 dark:text-white/70">
        {stateLabel}
      </span>
    </button>
  );
}

// --- Menu primitives ---

/** Portaled dropdown — rendered at document.body to escape MenuBar's backdrop-filter stacking context */
function MenuDropdownPortal({ children, position, isMobile }: { children: React.ReactNode; position: { top: number; left: number }; isMobile?: boolean }) {
  return createPortal(
    <div
      id="menu-dropdown-portal"
      className={`fixed py-1.5
                 bg-white/50 dark:bg-black/50 backdrop-blur-2xl saturate-150
                 border border-black/10 dark:border-white/15 rounded-xl
                 shadow-2xl shadow-black/20 dark:shadow-black/40
                 ${isMobile ? 'min-w-[260px] max-w-[calc(100vw-24px)]' : 'min-w-[220px]'}`}
      style={{ zIndex: Z_INDEX.menu, top: position.top, left: isMobile ? 12 : position.left }}
    >
      {children}
    </div>,
    document.body
  );
}

/** Portaled panel — larger dropdown for embedded app content */
function PanelPortal({ children, position, width, height }: {
  children: React.ReactNode;
  position: { top: number; left?: number; right?: number };
  width: number;
  height: number;
}) {
  return createPortal(
    <div
      id="menubar-panel-portal"
      className="fixed flex flex-col overflow-hidden
                 bg-white/70 dark:bg-[#1a1918]/85 backdrop-blur-2xl saturate-150
                 border border-black/10 dark:border-white/15 rounded-xl
                 shadow-2xl shadow-black/25 dark:shadow-black/50"
      style={{
        zIndex: Z_INDEX.menu,
        top: position.top,
        ...(position.left != null ? { left: position.left } : {}),
        ...(position.right != null ? { right: position.right } : {}),
        width,
        height,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function MenuItem({ label, icon, shortcut, onClick, disabled, className, isMobile }: {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  isMobile?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 text-left transition
                  ${isMobile ? 'px-4 py-2.5 text-base' : 'px-3 py-1.5 text-sm'}
                  ${disabled ? 'text-black/25 dark:text-white/30 cursor-default' : 'text-black/90 dark:text-white/90 hover:bg-[#0063E1] hover:text-white'}
                  ${className || ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {icon && (
        <span className={`flex items-center justify-center shrink-0 ${isMobile ? 'w-5' : 'w-4'}`}>
          {icon}
        </span>
      )}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-xs text-black/25 dark:text-white/30 ml-4">{shortcut}</span>}
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-2 my-1 border-t border-black/10 dark:border-white/10" />;
}

// --- Latency popover ---

import type { LatencyData } from '@/hooks/useLatency';

function LatencyPopover({ anchorRef, latency }: { anchorRef: React.RefObject<HTMLDivElement | null>; latency: LatencyData }) {
  const rect = anchorRef.current?.getBoundingClientRect();
  if (!rect) return null;

  // Position below the icon, right-aligned
  const top = rect.bottom + 6;
  const right = Math.max(8, window.innerWidth - rect.right);

  return createPortal(
    <div
      className="fixed py-2 px-3 min-w-[180px]
                 bg-white/70 dark:bg-[#1a1918]/85 backdrop-blur-2xl saturate-150
                 border border-black/10 dark:border-white/15 rounded-xl
                 shadow-2xl shadow-black/20 dark:shadow-black/40
                 text-xs text-black/80 dark:text-white/90"
      style={{ zIndex: Z_INDEX.menu, top, right }}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <div className="font-semibold text-black/60 dark:text-white/60 mb-1.5 text-[10px] uppercase tracking-wider">
        Connection
      </div>
      <LatencyRow label="Worker" value={latency.http} />
      <LatencyRow label="Agent" value={latency.agentWs} />
    </div>,
    document.body,
  );
}

function LatencyRow({ label, value }: { label: string; value: number | null }) {
  const color = value === null
    ? 'text-black/30 dark:text-white/30'
    : value < 50
      ? 'text-green-600 dark:text-green-400'
      : value < 150
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-500 dark:text-red-400';

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-black/60 dark:text-white/60">{label}</span>
      <span className={`font-mono font-medium ${color}`}>
        {value === null ? '...' : `${value}ms`}
      </span>
    </div>
  );
}
