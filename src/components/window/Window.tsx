import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSound } from '@/hooks/useSound';
import { useIsMobile } from '@/hooks/useIsMobile';
import { TitleBar } from './TitleBar';
import { ResizeHandles } from './ResizeHandles';
import type { WindowConfig, ResizeHandle } from '@/types';
import type { MissionControlTarget } from './WindowManager';
import { MENUBAR_HEIGHT, MOBILE_MENUBAR_HEIGHT, MOBILE_APP_BAR_HEIGHT, STAGE_STRIP_WIDTH, DOCK_HEIGHT, Z_INDEX } from '@/lib/constants';

interface StageTarget {
  x: number; // delta x from current position
  y: number; // delta y from current position
  scale: number;
}

interface WindowProps {
  config: WindowConfig;
  children: ReactNode;
  /** When non-null, Mission Control is active and this window should transform to the target. */
  missionControlTarget: MissionControlTarget | null;
  /** Index of this window in the MC grid (used for stagger animation delay). */
  missionControlIndex: number;
  /** Horizontal offset applied during workspace slide transitions. */
  slideXOffset?: number;
  /** When non-null, this window is in the Stage Manager strip (scaled thumbnail). */
  stageTarget?: StageTarget | null;
  /** Whether this is the active Stage Manager window (centered in main area). */
  isStageActive?: boolean;
}

/** macOS-like spring curve for Mission Control animation. */
const MC_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const MC_DURATION = 500; // ms

export function Window({ config, children, missionControlTarget, missionControlIndex, slideXOffset = 0, stageTarget, isStageActive }: WindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startWindowX: number;
    startWindowY: number;
    pointerId?: number;
    targetEl?: HTMLElement | Element;
  } | null>(null);
  const resizeRef = useRef<{
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startBounds: { x: number; y: number; width: number; height: number };
    pointerId?: number;
    targetEl?: HTMLElement | Element;
  } | null>(null);
  
  // Refs for config values that change during drag/resize, so event listeners
  // don't need to be torn down and re-registered on every pixel of movement.
  const configRef = useRef({
    minWidth: config.minWidth,
    minHeight: config.minHeight,
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    aspectRatio: config.aspectRatio,
    lockAspectRatio: config.lockAspectRatio,
    chromeHeight: config.chromeHeight,
    width: config.width,
    height: config.height,
  });
  configRef.current = {
    minWidth: config.minWidth,
    minHeight: config.minHeight,
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    aspectRatio: config.aspectRatio,
    lockAspectRatio: config.lockAspectRatio,
    chromeHeight: config.chromeHeight,
    width: config.width,
    height: config.height,
  };

  const { play } = useSound();
  const isMobile = useIsMobile();
  const focusedWindowId = useWindowStore((s) => s.focusedWindowId);
  const closeMissionControl = useWindowStore((s) => s.closeMissionControl);
  const closeBrowserWindow = useComputerStore((s) => s.closeBrowserWindow);
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    toggleMaximize,
    moveWindow,
    setBounds,
  } = useWindowStore();

  // Stable refs for store actions so listeners never go stale
  const moveWindowRef = useRef(moveWindow);
  moveWindowRef.current = moveWindow;
  const setBoundsRef = useRef(setBounds);
  setBoundsRef.current = setBounds;
  const configIdRef = useRef(config.id);
  configIdRef.current = config.id;
  
  const workspaceTransition = useWindowStore((s) => s.workspaceTransition);
  const isFocused = focusedWindowId === config.id;
  const isMaximized = config.state === 'maximized';
  const isMinimized = config.state === 'minimized';

  // ── Mission Control state ───────────────────────────────────────

  const inMC = missionControlTarget !== null;

  // Track "exiting MC" so the return animation uses the MC spring transition.
  // When inMC goes from true → false, we keep the MC transition active for MC_DURATION ms.
  const [exitingMC, setExitingMC] = useState(false);
  const prevInMC = useRef(inMC);
  useEffect(() => {
    if (prevInMC.current && !inMC) {
      // Exiting MC — keep spring transition active so windows animate back
      setExitingMC(true);
      const t = setTimeout(() => setExitingMC(false), MC_DURATION);
      return () => clearTimeout(t);
    }
    prevInMC.current = inMC;
  }, [inMC]);

  // Hover state for MC mode — clear when exiting MC
  const [mcHovered, setMcHovered] = useState(false);
  const [stageHovered, setStageHovered] = useState(false);
  const [stageSettled, setStageSettled] = useState(false);
  useEffect(() => {
    if (!inMC) setMcHovered(false);
  }, [inMC]);

  // ── Normal animation state ──────────────────────────────────────

  // During workspace transitions, skip appear/disappear animations — windows
  // should be instantly visible so the slide transition looks correct.
  const inWorkspaceTransition = workspaceTransition !== null;

  const [animVisible, setAnimVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [animateBounds, setAnimateBounds] = useState(false);

  // Open / minimize / restore animation
  // In MC mode, force-render minimized windows so they appear in the grid.
  // When exiting MC, keep rendering until the exit animation completes.
  useEffect(() => {
    if (inMC || exitingMC) {
      // Force visible in MC mode (or during exit animation), even for minimized windows
      setShouldRender(true);
      if (inMC) setAnimVisible(true);
      return;
    }

    // During workspace transition, force instant visibility (no fade/slide animation)
    // but keep minimized windows hidden — they shouldn't appear in the slide.
    if (inWorkspaceTransition && !isMinimized) {
      setShouldRender(true);
      setAnimVisible(true);
      return;
    }

    if (isMinimized) {
      setAnimVisible(false);
      const t = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(t);
    } else {
      setShouldRender(true);
      let cancelled = false;
      requestAnimationFrame(() => {
        if (!cancelled) requestAnimationFrame(() => {
          if (!cancelled) setAnimVisible(true);
        });
      });
      return () => { cancelled = true; };
    }
  }, [isMinimized, inMC, exitingMC, inWorkspaceTransition]);

  // Stage settled — delay popover until strip animation completes (400ms)
  useEffect(() => {
    if (stageTarget) {
      setStageSettled(false);
      const t = setTimeout(() => setStageSettled(true), 450);
      return () => clearTimeout(t);
    }
    setStageSettled(false);
  }, [!!stageTarget]);
  
  // ── Interaction handlers ────────────────────────────────────────

  // Shared pointermove/pointerup handlers registered only during active interaction
  const attachInteractionListeners = useCallback(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const cfg = configRef.current;
      const id = configIdRef.current;

      // ── MC drag mode (transitioned from normal drag via menubar) ──
      if (mcDragRef.current?.dragging && !dragRef.current) {
        const dx = e.clientX - mcDragRef.current.startX;
        const dy = e.clientY - mcDragRef.current.startY;
        setMcDragDelta({ x: dx, y: dy });
        clearMCDropHighlights();
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const wsEl = el?.closest('[data-mc-workspace-id]') as HTMLElement | null;
        const windowWsId = useWindowStore.getState().windows.find(w => w.id === id)?.workspaceId;
        const hoverWsId = wsEl?.getAttribute('data-mc-workspace-id') ?? null;
        const isDropTarget = hoverWsId !== null && hoverWsId !== windowWsId;
        if (isDropTarget) {
          wsEl!.style.boxShadow = '0 0 0 2px rgba(100, 160, 255, 0.8), 0 0 16px rgba(100, 160, 255, 0.3)';
          wsEl!.style.background = 'rgba(100, 160, 255, 0.15)';
          if (hoverWsId !== mcDropTargetIdRef.current) {
            mcDropTargetIdRef.current = hoverWsId;
            const previewEl = wsEl!.querySelector('[data-mc-workspace-preview]') as HTMLElement | null;
            const thumbRect = (previewEl || wsEl!).getBoundingClientRect();
            const parentRect = windowRef.current?.offsetParent?.getBoundingClientRect();
            setMcDropTarget({
              thumbCenterX: thumbRect.left + thumbRect.width / 2,
              thumbCenterY: thumbRect.top + thumbRect.height / 2,
              thumbW: thumbRect.width,
              thumbH: thumbRect.height,
              parentOffsetX: parentRect?.left ?? 0,
              parentOffsetY: parentRect?.top ?? 0,
            });
          }
        } else if (mcDropTargetIdRef.current !== null) {
          mcDropTargetIdRef.current = null;
          setMcDropTarget(null);
        }
        return;
      }

      // Handle dragging
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        
        let newX = dragRef.current.startWindowX + dx;
        let newY = dragRef.current.startWindowY + dy;
        
        const useWindowStoreStageActive = useWindowStore.getState().stageManagerActive;
        const paddingLeft = useWindowStoreStageActive && !isMobile ? STAGE_STRIP_WIDTH : 0;
        
        const areaWidth = window.innerWidth;
        const areaHeight = window.innerHeight - MENUBAR_HEIGHT - (!isMobile ? DOCK_HEIGHT : MOBILE_APP_BAR_HEIGHT);
        
        newX = Math.max(paddingLeft, Math.min(newX, areaWidth - cfg.width));
        newY = Math.max(0, Math.min(newY, areaHeight - cfg.height));
        
        moveWindowRef.current(id, newX, newY);

        // ── Drag to menubar → auto-open Mission Control ──
        // When the cursor enters the menubar area during drag, open MC and
        // seamlessly transition to MC drag mode so the user can drop the
        // window onto a workspace thumbnail.
        if (e.clientY < MENUBAR_HEIGHT && !useWindowStore.getState().missionControlActive) {
          const store = useWindowStore.getState();
          const win = store.windows.find(w => w.id === id);
          // Store grab offset so the window stays under the cursor after MC scales it down
          mcDragFromDesktopRef.current = {
            grabOffsetX: e.clientX - (win?.x ?? 0),
            grabOffsetY: e.clientY - (win?.y ?? 0),
          };
          mcDragRef.current = { startX: e.clientX, startY: e.clientY, dragging: true };
          dragRef.current = null;
          document.body.style.cursor = 'grabbing';
          // Force delta to {0,0} (not null) so transform transition is skipped immediately
          setMcDragDelta({ x: 0, y: 0 });
          store.toggleMissionControl();
          return;
        }

      }

      // Handle resizing
      if (resizeRef.current) {
        const { handle, startX, startY, startBounds } = resizeRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newX = startBounds.x;
        let newY = startBounds.y;
        let newWidth = startBounds.width;
        let newHeight = startBounds.height;
        
        if (handle.includes('e')) {
          newWidth = Math.max(cfg.minWidth, startBounds.width + dx);
        }
        if (handle.includes('w')) {
          const proposedWidth = startBounds.width - dx;
          if (proposedWidth >= cfg.minWidth) {
            newWidth = proposedWidth;
            newX = startBounds.x + dx;
          }
        }
        if (handle.includes('s')) {
          newHeight = Math.max(cfg.minHeight, startBounds.height + dy);
        }
        if (handle.includes('n')) {
          const proposedHeight = startBounds.height - dy;
          if (proposedHeight >= cfg.minHeight) {
            newHeight = proposedHeight;
            newY = startBounds.y + dy;
          }
        }
        
        if (cfg.aspectRatio && cfg.lockAspectRatio) {
          const chrome = cfg.chromeHeight ?? 0;
          const ratio = cfg.aspectRatio;
          const hasH = handle.includes('n') || handle.includes('s');
          const hasW = handle.includes('e') || handle.includes('w');
          
          if (hasW && !hasH) {
            const contentH = newWidth / ratio;
            newHeight = Math.round(contentH + chrome);
          } else if (hasH && !hasW) {
            const contentH = newHeight - chrome;
            newWidth = Math.round(contentH * ratio);
          } else {
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDx >= absDy) {
              const contentH = newWidth / ratio;
              newHeight = Math.round(contentH + chrome);
            } else {
              const contentH = newHeight - chrome;
              newWidth = Math.round(contentH * ratio);
            }
          }
          
          newWidth = Math.max(cfg.minWidth, Math.min(newWidth, cfg.maxWidth ?? Infinity));
          newHeight = Math.max(cfg.minHeight, Math.min(newHeight, cfg.maxHeight ?? Infinity));
          
          if (handle.includes('w')) {
            newX = startBounds.x + startBounds.width - newWidth;
          }
          if (handle.includes('n')) {
            newY = startBounds.y + startBounds.height - newHeight;
          }
        }
        
        const useWindowStoreStageActive = useWindowStore.getState().stageManagerActive;
        const paddingLeft = useWindowStoreStageActive && !isMobile ? STAGE_STRIP_WIDTH : 0;
        const areaWidth = window.innerWidth;
        const areaHeight = window.innerHeight - MENUBAR_HEIGHT - (!isMobile ? DOCK_HEIGHT : MOBILE_APP_BAR_HEIGHT);

        if (newX + newWidth > areaWidth) {
          if (handle.includes('e')) newWidth = areaWidth - newX;
          else newX = areaWidth - newWidth;
        }
        if (newY + newHeight > areaHeight) {
          if (handle.includes('s')) newHeight = areaHeight - newY;
          else newY = areaHeight - newHeight;
        }
        if (newX < paddingLeft) {
          if (handle.includes('w')) { newWidth += (newX - paddingLeft); newX = paddingLeft; }
          else newX = paddingLeft;
        }
        if (newY < 0) {
          if (handle.includes('n')) { newHeight += newY; newY = 0; }
          else newY = 0;
        }

        newWidth = Math.max(cfg.minWidth, newWidth);
        newHeight = Math.max(cfg.minHeight, newHeight);

        setBoundsRef.current(id, { x: newX, y: newY, width: newWidth, height: newHeight });
      }
    };
    
    const handlePointerUp = (ev: PointerEvent) => {
      // ── MC drag drop (transitioned from normal drag via menubar) ──
      if (mcDragRef.current?.dragging) {
        clearMCDropHighlights();
        const id = configIdRef.current;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const wsEl = el?.closest('[data-mc-workspace-id]') as HTMLElement | null;
        const targetWsId = wsEl?.getAttribute('data-mc-workspace-id');
        const windowWsId = useWindowStore.getState().windows.find(w => w.id === id)?.workspaceId;

        mcDragRef.current = null;
        mcDragFromDesktopRef.current = null;
        mcDropTargetIdRef.current = null;
        setMcDragDelta(null);
        setMcDropTarget(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);

        if (targetWsId && targetWsId !== windowWsId) {
          const store = useWindowStore.getState();
          const cfg = configRef.current;
          const screenW = window.innerWidth;
          const screenH = window.innerHeight - MENUBAR_HEIGHT;
          const centerX = Math.max(0, Math.round((screenW - cfg.width) / 2));
          const centerY = Math.max(0, Math.round((screenH - cfg.height) / 2));
          store.moveWindow(id, centerX, centerY);
          if (targetWsId === '__new__') {
            // Create a new workspace and move window into it
            const newId = store.createWorkspace({
              name: `Desktop ${store.workspaces.length + 1}`,
              platform: 'desktop',
            });
            store.moveWindowToWorkspace(id, newId);
          } else {
            store.moveWindowToWorkspace(id, targetWsId);
          }
          store.closeMissionControl();
        } else {
          // Dropped outside a workspace thumbnail — close MC, window snaps back
          useWindowStore.getState().closeMissionControl();
        }
        return;
      }

      if (dragRef.current?.targetEl && dragRef.current?.pointerId !== undefined) {
        try { dragRef.current.targetEl.releasePointerCapture(dragRef.current.pointerId); } catch {}
      }
      if (resizeRef.current?.targetEl && resizeRef.current?.pointerId !== undefined) {
        try { resizeRef.current.targetEl.releasePointerCapture(resizeRef.current.pointerId); } catch {}
      }
      
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
    
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, []);
  
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (isMaximized || inMC || stageTarget) return; // Disable drag in MC mode and Stage strip
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    // Don't initiate drag when clicking window control buttons (close/min/max)
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    
    e.preventDefault();
    focusWindow(config.id);
    
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWindowX: config.x,
      startWindowY: config.y,
      pointerId: e.pointerId,
      targetEl: e.currentTarget,
    };
    
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    attachInteractionListeners();
  }, [config.id, config.x, config.y, isMaximized, inMC, stageTarget, focusWindow, attachInteractionListeners]);
  
  const handleResizeStart = useCallback((handle: ResizeHandle, e: React.PointerEvent) => {
    if (isMaximized || inMC || stageTarget) return; // Disable resize in MC mode and Stage strip
    e.preventDefault();
    e.stopPropagation();
    focusWindow(config.id);
    
    resizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: {
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
      },
      pointerId: e.pointerId,
      targetEl: e.currentTarget,
    };
    
    document.body.style.userSelect = 'none';
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    attachInteractionListeners();
  }, [config.id, config.x, config.y, config.width, config.height, isMaximized, inMC, stageTarget, focusWindow, attachInteractionListeners]);
  
  const handleClose = useCallback(() => {
    play('close');
    setAnimVisible(false);
    setTimeout(() => {
      if (config.type === 'browser') {
        closeBrowserWindow(config.id);
        return;
      }
      closeWindow(config.id);
    }, 200);
  }, [config.id, config.type, closeBrowserWindow, closeWindow, play]);
  
  const handleMinimize = useCallback(() => {
    play('minimize');
    minimizeWindow(config.id);
  }, [config.id, minimizeWindow, play]);
  
  const handleMaximize = useCallback(() => {
    play('maximize');
    setAnimateBounds(true);
    toggleMaximize(config.id);
    setTimeout(() => setAnimateBounds(false), 300);
  }, [config.id, toggleMaximize, play]);
  
  // Normal click: focus on click
  const handleClick = useCallback(() => {
    if (!isFocused) {
      play('click');
      focusWindow(config.id);
    }
  }, [config.id, isFocused, focusWindow, play]);

  // ── Workspace helpers (used by both MC drag and context menu) ────
  const workspaces = useWindowStore((s) => s.workspaces);
  const moveWindowToWorkspace = useWindowStore((s) => s.moveWindowToWorkspace);

  // ── MC drag-to-workspace ────────────────────────────────────────
  // Pointer down in MC: track for click vs. drag. If the pointer moves
  // more than 5 px, switch to drag mode and let the user drop the window
  // onto a workspace thumbnail to move it between workspaces.
  const mcDragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const [mcDragDelta, setMcDragDelta] = useState<{ x: number; y: number } | null>(null);
  // When transitioning from normal drag to MC drag (via menubar), store the
  // cursor-to-window offset so the window stays under the cursor after scaling.
  const mcDragFromDesktopRef = useRef<{
    grabOffsetX: number; // cursor X - window left at transition time
    grabOffsetY: number; // cursor Y - window top at transition time
  } | null>(null);
  // When dragging over a different workspace thumbnail, snap the window to fit inside it.
  const [mcDropTarget, setMcDropTarget] = useState<{
    thumbCenterX: number; // viewport center of the thumbnail preview
    thumbCenterY: number;
    thumbW: number;
    thumbH: number;
    parentOffsetX: number; // window parent container's viewport offset
    parentOffsetY: number;
  } | null>(null);
  const mcDropTargetIdRef = useRef<string | null>(null); // track to avoid redundant state updates

  const clearMCDropHighlights = useCallback(() => {
    document.querySelectorAll('[data-mc-workspace-id]').forEach((el) => {
      (el as HTMLElement).style.removeProperty('box-shadow');
      (el as HTMLElement).style.removeProperty('background');
    });
  }, []);

  const handleMCPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    mcDragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };

    const onMove = (ev: PointerEvent) => {
      if (!mcDragRef.current) return;
      const dx = ev.clientX - mcDragRef.current.startX;
      const dy = ev.clientY - mcDragRef.current.startY;

      if (!mcDragRef.current.dragging && Math.hypot(dx, dy) > 5) {
        mcDragRef.current.dragging = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      if (mcDragRef.current.dragging) {
        setMcDragDelta({ x: dx, y: dy });
        // Highlight workspace thumbnail under cursor
        clearMCDropHighlights();
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const wsEl = el?.closest('[data-mc-workspace-id]') as HTMLElement | null;
        const hoverWsId = wsEl?.getAttribute('data-mc-workspace-id') ?? null;
        const isDropTarget = hoverWsId !== null && hoverWsId !== config.workspaceId;
        if (isDropTarget) {
          wsEl!.style.boxShadow = '0 0 0 2px rgba(100, 160, 255, 0.8), 0 0 16px rgba(100, 160, 255, 0.3)';
          wsEl!.style.background = 'rgba(100, 160, 255, 0.15)';
          // Snap window to fit inside the workspace thumbnail preview
          if (hoverWsId !== mcDropTargetIdRef.current) {
            mcDropTargetIdRef.current = hoverWsId;
            const previewEl = wsEl!.querySelector('[data-mc-workspace-preview]') as HTMLElement | null;
            const thumbRect = (previewEl || wsEl!).getBoundingClientRect();
            const parentRect = windowRef.current?.offsetParent?.getBoundingClientRect();
            setMcDropTarget({
              thumbCenterX: thumbRect.left + thumbRect.width / 2,
              thumbCenterY: thumbRect.top + thumbRect.height / 2,
              thumbW: thumbRect.width,
              thumbH: thumbRect.height,
              parentOffsetX: parentRect?.left ?? 0,
              parentOffsetY: parentRect?.top ?? 0,
            });
          }
        } else if (mcDropTargetIdRef.current !== null) {
          mcDropTargetIdRef.current = null;
          setMcDropTarget(null);
        }
      }
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      clearMCDropHighlights();

      const wasDragging = mcDragRef.current?.dragging ?? false;
      mcDragRef.current = null;
      mcDragFromDesktopRef.current = null;
      mcDropTargetIdRef.current = null;
      setMcDragDelta(null);
      setMcDropTarget(null);

      if (wasDragging) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const wsEl = el?.closest('[data-mc-workspace-id]') as HTMLElement | null;
        const targetWsId = wsEl?.getAttribute('data-mc-workspace-id');
        if (targetWsId && targetWsId !== config.workspaceId) {
          // Center window on screen before moving to target workspace
          const screenW = window.innerWidth;
          const screenH = window.innerHeight - MENUBAR_HEIGHT;
          const centerX = Math.max(0, Math.round((screenW - config.width) / 2));
          const centerY = Math.max(0, Math.round((screenH - config.height) / 2));
          useWindowStore.getState().moveWindow(config.id, centerX, centerY);
          if (targetWsId === '__new__') {
            // Create a new workspace and move window into it
            const store = useWindowStore.getState();
            const newId = store.createWorkspace({
              name: `Desktop ${store.workspaces.length + 1}`,
              platform: 'desktop',
            });
            moveWindowToWorkspace(config.id, newId);
          } else {
            moveWindowToWorkspace(config.id, targetWsId);
          }
          closeMissionControl();
          return;
        }
        // Dropped outside a thumbnail — snap back (delta already cleared)
      } else {
        // Click (not drag) — focus and close MC
        play('click');
        focusWindow(config.id);
        closeMissionControl();
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [config.id, config.workspaceId, focusWindow, closeMissionControl, moveWindowToWorkspace, play, clearMCDropHighlights]);

  // MC close button: close this window from within MC
  const handleMCClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    play('close');
    closeWindow(config.id);
  }, [config.id, closeWindow, play]);

  // ── Context menu (right-click on title bar) ────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxSubmenu, setCtxSubmenu] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);
  const ctxSubmenuRef = useRef<HTMLDivElement>(null);
  const ctxSubmenuTriggerRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    focusWindow(config.id);
    // Clamp so the menu doesn't overflow the viewport
    const menuW = 200;
    const menuH = 160;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setCtxMenu({ x, y });
    setCtxSubmenu(false);
  }, [config.id, focusWindow]);

  // Close context menu on click-outside or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handleDown = (e: MouseEvent) => {
      if (
        ctxRef.current && !ctxRef.current.contains(e.target as Node) &&
        (!ctxSubmenuRef.current || !ctxSubmenuRef.current.contains(e.target as Node))
      ) {
        setCtxMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [ctxMenu]);

  // Other workspaces this window can move to
  const otherWorkspaces = workspaces.filter(ws => ws.id !== config.workspaceId);

  if (!shouldRender) return null;

  // ── Compute styles ──────────────────────────────────────────────

  // Normal transitions
  const baseTransition = 'opacity 200ms ease-out, transform 200ms ease-out, box-shadow 200ms ease-out';
  const boundsTransition = 'left 300ms ease-in-out, top 300ms ease-in-out, width 300ms ease-in-out, height 300ms ease-in-out';

  // MC transition (spring curve) — used when entering or exiting MC
  const stagger = missionControlIndex * 15; // ms delay per window for stagger
  const mcTransition = `transform ${MC_DURATION}ms ${MC_SPRING} ${stagger}ms, opacity 300ms ease-out ${stagger}ms, box-shadow 300ms ease-out`;

  // Stage manager transition (smooth move to center or strip)
  const stageTransition = `transform 400ms cubic-bezier(0.32, 0.72, 0, 1), left 400ms cubic-bezier(0.32, 0.72, 0, 1), top 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 250ms ease-out, box-shadow 200ms ease-out`;

  // Determine which transition to use
  let transition: string;
  if (inWorkspaceTransition) {
    // No per-window transitions during workspace slide — the parent container handles it
    transition = 'none';
  } else if (mcDragDelta && mcDropTarget) {
    // Snapping to drop target — smooth transition into the thumbnail
    transition = 'transform 200ms ease-out, opacity 200ms ease-out';
  } else if (mcDragDelta) {
    // During MC drag — no transition so window follows cursor immediately
    transition = 'opacity 100ms ease-out';
  } else if (inMC || exitingMC) {
    transition = mcTransition;
  } else if (stageTarget) {
    // Stage Manager strip window: animate into strip position
    transition = stageTransition;
  } else if (isStageActive) {
    // Stage Manager active window: only animate transform (for swap animation),
    // NOT left/top (would make dragging laggy with 400ms delay on every move)
    transition = `transform 400ms cubic-bezier(0.32, 0.72, 0, 1), ${baseTransition}`;
  } else if (animateBounds) {
    transition = `${boundsTransition}, ${baseTransition}`;
  } else {
    transition = baseTransition;
  }

  // Compute transform
  let transform: string;
  let opacity: number;

  if (inMC && missionControlTarget) {
    // Mission Control: transform to grid position with scale
    const { x: targetX, y: targetY, scale } = missionControlTarget;
    const fromDesktop = mcDragFromDesktopRef.current;

    if (mcDropTarget) {
      // Snap window to fit inside the workspace thumbnail preview
      const padding = 6;
      const innerW = mcDropTarget.thumbW - padding * 2;
      const innerH = mcDropTarget.thumbH - padding * 2;
      const fitScale = Math.min(innerW / config.width, innerH / config.height);
      const dx = mcDropTarget.thumbCenterX - mcDropTarget.parentOffsetX - config.x - (config.width * fitScale) / 2;
      const dy = mcDropTarget.thumbCenterY - mcDropTarget.parentOffsetY - config.y - (config.height * fitScale) / 2;
      transform = `translate(${dx}px, ${dy}px) scale(${fitScale})`;
      opacity = 0.9;
    } else if (fromDesktop && mcDragDelta) {
      // Drag from desktop via menubar: keep the window under the cursor.
      // The grab offset tells us where the cursor was relative to the window.
      // After scaling, adjust translate so the cursor stays at the same screen position.
      const renderScale = scale * 1.08;
      const dx = fromDesktop.grabOffsetX * (1 - renderScale) + mcDragDelta.x;
      const dy = fromDesktop.grabOffsetY * (1 - renderScale) + mcDragDelta.y;
      transform = `translate(${dx}px, ${dy}px) scale(${renderScale})`;
      opacity = 0.8;
    } else {
      // Normal MC positioning / drag within MC
      const dx = targetX - config.x + (mcDragDelta?.x ?? 0);
      const dy = targetY - config.y + (mcDragDelta?.y ?? 0);
      const dragScale = mcDragDelta ? scale * 1.08 : scale;
      transform = `translate(${dx}px, ${dy}px) scale(${dragScale})`;
      opacity = mcDragDelta ? 0.8 : (isMinimized ? 0.5 : 1);
    }
  } else if (stageTarget) {
    // Stage Manager strip: move to strip position, scale down
    transform = `translate(${stageTarget.x}px, ${stageTarget.y}px) scale(${stageTarget.scale})`;
    opacity = 1;
  } else if (animVisible) {
    transform = 'translateY(0)';
    opacity = 1;
  } else {
    transform = ' translateY(8px)';
    opacity = 0;
  }
  
  return (
    <div
      ref={windowRef}
      data-window-id={config.id}
      data-window-type={config.type}
      className={cn(
        'absolute flex flex-col backdrop-blur-2xl',
        // No rounded corners on mobile when maximized (edge-to-edge)
        isMobile && isMaximized ? '' : 'rounded-lg',
        'bg-white/70 dark:bg-black/70',
        'border border-black/10 dark:border-white/10',
        // Shadows
        isMobile && isMaximized ? '' : (
          isFocused
            ? 'shadow-[var(--shadow-window-focus)]'
            : 'shadow-[var(--shadow-window)]'
        ),
        // MC / Stage strip: overflow visible for labels/popovers, and prevent text selection
        inMC ? (mcDragDelta ? 'cursor-grabbing overflow-visible select-none' : 'cursor-pointer overflow-visible select-none')
          : stageTarget ? 'cursor-pointer overflow-visible select-none'
          : 'overflow-hidden',
      )}
      style={{
        left: config.x + slideXOffset,
        top: config.y,
        width: config.width,
        height: config.height,
        zIndex: stageTarget ? 95 : mcDragDelta ? Z_INDEX.missionControlBar + 1 : config.zIndex,
        opacity,
        transform,
        transformOrigin: '0 0',
        transition,
        // In MC or stage strip, cursor is pointer for click-to-select
        pointerEvents: inMC || stageTarget ? 'auto' : undefined,
        cursor: stageTarget ? 'pointer' : undefined,
      }}
      onPointerDown={stageTarget
        ? (e) => { 
            e.stopPropagation(); 
            play('click'); 
            if (e.shiftKey) useWindowStore.getState().addWindowToStageGroup(config.id);
            else useWindowStore.getState().setStageActiveWindow(config.id);
          }
        : inMC ? handleMCPointerDown : handleClick}
      onMouseEnter={() => {
        if (stageTarget) setStageHovered(true);
        if (inMC) setMcHovered(true);
      }}
      onMouseLeave={() => {
        setStageHovered(false);
        setMcHovered(false);
      }}
    >
      {/* Stage Manager: name popover on hover — only after animation settles */}
      {stageTarget && stageSettled && stageHovered && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: config.width + 16,
            top: config.height * 0.5 - 16,
            transform: `scale(${1 / stageTarget.scale})`,
            transformOrigin: 'left center',
          }}
        >
          <div className="bg-black/80 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            {config.title}
          </div>
        </div>
      )}

      {/* Window chrome — clip overflow so content doesn't escape rounded corners */}
      <div className={cn(
        'flex flex-col w-full h-full',
        inMC ? 'overflow-hidden rounded-xl' : 'overflow-hidden',
      )}>
        <TitleBar
          title={config.title}
          icon={config.icon}
          isFocused={isFocused}
          isMobile={isMobile}
          state={config.state}
          onMinimize={inMC ? undefined : handleMinimize}
          onMaximize={inMC ? undefined : handleMaximize}
          onClose={inMC ? undefined : handleClose}
          onDoubleClick={inMC ? undefined : handleMaximize}
          onPointerDown={inMC ? undefined : handleDragStart}
          onContextMenu={inMC ? undefined : handleContextMenu}
        />
        
        <div className="flex-1 overflow-hidden relative">
          {children}
          {/* Invisible overlay blocks all interaction with app content during MC and Stage strip */}
          {(inMC || stageTarget) && <div className="absolute inset-0 z-50 pointer-events-auto" />}
        </div>
      </div>
      
      {/* Resize handles — hidden on mobile and in MC mode */}
      {!isMobile && !inMC && !stageTarget && (
        <ResizeHandles
          onResizeStart={handleResizeStart}
          disabled={isMaximized}
        />
      )}

      {/* ── MC overlay elements (rendered outside overflow:hidden) ── */}
      {inMC && (
        <>
          {/* Hover highlight overlay — thick selection border like macOS Finder */}
          <div
            className={cn(
              'absolute rounded-xl pointer-events-none transition-all duration-150',
              mcHovered ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              // Inset slightly negative so the border sits outside the window frame
              inset: -3 / (missionControlTarget?.scale ?? 1),
              border: `${3 / (missionControlTarget?.scale ?? 1)}px solid rgba(100, 160, 255, 0.7)`,
              boxShadow: mcHovered
                ? '0 0 12px rgba(100, 160, 255, 0.3), inset 0 0 12px rgba(100, 160, 255, 0.05)'
                : 'none',
            }}
          />

          {/* Close button — top-left corner, visible on hover */}
          <button
            className={cn(
              'absolute z-10 w-6 h-6 rounded-full',
              'bg-black/60 border border-white/20 backdrop-blur-sm',
              'flex items-center justify-center',
              'transition-all duration-150',
              mcHovered
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-75',
              'hover:bg-[#FE5B5F] hover:border-[#FE5B5F]/50',
            )}
            style={{
              // Position at top-left of the scaled window, adjusted for the scale
              top: -8 / (missionControlTarget?.scale ?? 1),
              left: -8 / (missionControlTarget?.scale ?? 1),
              // Counter-scale so the button stays a consistent size
              transform: `scale(${1 / (missionControlTarget?.scale ?? 1)})`,
              transformOrigin: 'center center',
            }}
            onClick={handleMCClose}
          >
            <X className="w-3 h-3 text-white" />
          </button>

          {/* Title label below the window */}
          <div
            className={cn(
              'absolute left-0 right-0 flex justify-center pointer-events-none',
              'transition-opacity duration-200',
              mcHovered ? 'opacity-100' : 'opacity-70',
            )}
            style={{
              // Position below the scaled window
              top: config.height + 8 / (missionControlTarget?.scale ?? 1),
              // Counter-scale so text is legible
              transform: `scale(${1 / (missionControlTarget?.scale ?? 1)})`,
              transformOrigin: 'top center',
            }}
          >
            <span className={cn(
              'px-3 py-1 rounded-md text-xs font-medium text-white truncate max-w-[200px]',
              'bg-black/40 backdrop-blur-sm',
            )}>
              {config.title}
              {isMinimized && <span className="text-white/40 ml-1">(minimized)</span>}
            </span>
          </div>
        </>
      )}

      {/* ── Title bar context menu (portaled to body) ── */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          className="fixed min-w-[180px] rounded-[10px] p-1
            bg-white/70 dark:bg-black/60 border border-black/10 dark:border-white/10
            shadow-2xl backdrop-blur-3xl saturate-150"
          style={{
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: Z_INDEX.menu,
          }}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-[13px] font-medium rounded-[5px] flex items-center gap-2
              hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 text-black/80 dark:text-white/90"
            onClick={() => { handleMinimize(); setCtxMenu(null); }}
          >
            Minimize
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-[13px] font-medium rounded-[5px] flex items-center gap-2
              hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 text-black/80 dark:text-white/90"
            onClick={() => { handleMaximize(); setCtxMenu(null); }}
          >
            {isMaximized ? 'Restore' : 'Maximize'}
          </button>
          <div className="h-px bg-black/5 dark:bg-white/10 my-1 mx-1" />

          {/* Move to Workspace submenu */}
          {otherWorkspaces.length > 0 && (
            <div
              ref={ctxSubmenuTriggerRef}
              className="relative"
              onMouseEnter={() => setCtxSubmenu(true)}
              onMouseLeave={(e) => {
                // Keep submenu open if mouse moves into the portaled submenu
                const related = e.relatedTarget as Node | null;
                if (ctxSubmenuRef.current?.contains(related)) return;
                setCtxSubmenu(false);
              }}
            >
              <button
                className="w-full px-3 py-1.5 text-left text-[13px] font-medium rounded-[5px] flex items-center justify-between
                  hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 text-black/80 dark:text-white/90"
              >
                Move to Workspace
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
              {ctxSubmenu && createPortal(
                <div
                  ref={ctxSubmenuRef}
                  className="fixed min-w-[160px] rounded-[10px] p-1
                    bg-white/70 dark:bg-black/60 border border-black/10 dark:border-white/10
                    shadow-2xl backdrop-blur-3xl saturate-150"
                  style={{
                    zIndex: Z_INDEX.menu + 1,
                    left: ctxSubmenuTriggerRef.current
                      ? ctxSubmenuTriggerRef.current.getBoundingClientRect().right + 2
                      : (ctxMenu?.x ?? 0) + 180,
                    top: ctxSubmenuTriggerRef.current
                      ? ctxSubmenuTriggerRef.current.getBoundingClientRect().top
                      : ctxMenu?.y ?? 0,
                  }}
                  onMouseLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (ctxSubmenuTriggerRef.current?.contains(related)) return;
                    setCtxSubmenu(false);
                  }}
                >
                  {otherWorkspaces.map(ws => (
                    <button
                      key={ws.id}
                      className="w-full px-3 py-1.5 text-left text-[13px] font-medium rounded-[5px] flex items-center gap-2
                        hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500 text-black/80 dark:text-white/90"
                      onClick={() => {
                        moveWindowToWorkspace(config.id, ws.id);
                        setCtxMenu(null);
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ws.color ?? '#6366f1' }}
                      />
                      {ws.name}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
            </div>
          )}

          <div className="h-px bg-black/5 dark:bg-white/10 my-1 mx-1" />
          <button
            className="w-full px-3 py-1.5 text-left text-[13px] font-medium rounded-[5px] flex items-center gap-2
              text-red-500 hover:bg-red-500 hover:text-white"
            onClick={() => { handleClose(); setCtxMenu(null); }}
          >
            Close
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
