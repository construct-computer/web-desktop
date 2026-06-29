import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWindowStore } from '@/stores/windowStore';
import { useWindowAccessoryStore } from '@/stores/windowAccessoryStore';
import { useComputerStore } from '@/stores/agentStore';
import { useSound } from '@/hooks/useSound';
import { TitleBar } from './TitleBar';
import { ResizeHandles } from './ResizeHandles';
import type { WindowConfig, ResizeHandle } from '@/types';
import type { MissionControlTarget } from './WindowManager';
import { MENUBAR_HEIGHT, STAGE_STRIP_WIDTH, DOCK_HEIGHT, Z_INDEX, WINDOW_TRANSITION_MS, WINDOW_TRANSITION_EASING } from '@/lib/constants';
import { buildTransformOpacityTransition, kickOpenAnimation } from '@/lib/panelAnimation';
import { computeDockMinimizeTransform, getDesktopWorkArea, computeVisuallyCenteredPosition } from '@/lib/windowBounds';

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

export function shouldEnterMissionControlOnTopEdge(opts: {
  isChatWindow: boolean;
  clientY: number;
  missionControlActive: boolean;
}): boolean {
  return !opts.isChatWindow && opts.clientY < MENUBAR_HEIGHT && !opts.missionControlActive;
}

function getDockTargetRect(config: WindowConfig): DOMRect | null {
  // ponytail: read the rendered dock item directly; no separate geometry store.
  const appId = config.type === 'app' ? (config.metadata?.appId as string | undefined) : undefined;
  const dockItems = document.querySelectorAll<HTMLElement>('[data-dock-item]');

  for (const item of dockItems) {
    if (item.dataset.dockWindowId === config.id) return item.getBoundingClientRect();
    if (config.type === 'app') {
      if (appId && item.dataset.dockAppId === appId) return item.getBoundingClientRect();
      continue;
    }
    if (item.dataset.dockWindowType === config.type) return item.getBoundingClientRect();
  }

  return null;
}

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
  const focusedWindowId = useWindowStore((s) => s.focusedWindowId);
  const closeAnimatingWindowIds = useWindowStore((s) => s.closeAnimatingWindowIds);
  const closeMissionControl = useWindowStore((s) => s.closeMissionControl);
  const titleBarAccessory = useWindowAccessoryStore((s) => s.accessories[config.id]);
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
  const isChatWindow = config.type === 'chat';
  const isClosing = !!closeAnimatingWindowIds[config.id];

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
  /** Opacity fade — only used on close/minimize; open keeps opacity 1 so glass blur stays visible during scale-in */
  const [fadedOut, setFadedOut] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [openingFromDock, setOpeningFromDock] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const prevIsMinimized = useRef(isMinimized);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const unmountDelayMs = prefersReducedMotion ? 0 : WINDOW_TRANSITION_MS;

  // Open / minimize / restore animation
  // In MC mode, force-render minimized windows so they appear in the grid.
  // When exiting MC, keep rendering until the exit animation completes.
  useEffect(() => {
    const wasMinimized = prevIsMinimized.current;
    prevIsMinimized.current = isMinimized;

    if (isClosing) {
      setShouldRender(true);
      setAnimVisible(false);
      setFadedOut(true);
      setOpeningFromDock(false);
      return;
    }

    if (inMC || exitingMC) {
      // Force visible in MC mode (or during exit animation), even for minimized windows
      setShouldRender(true);
      if (inMC) {
        setAnimVisible(true);
        setFadedOut(false);
        setOpeningFromDock(false);
      }
      return;
    }

    // During workspace transition, force instant visibility (no fade/slide animation)
    // but keep minimized windows hidden — they shouldn't appear in the slide.
    if (inWorkspaceTransition && !isMinimized) {
      setShouldRender(true);
      setAnimVisible(true);
      setFadedOut(false);
      setOpeningFromDock(false);
      return;
    }

    if (isMinimized) {
      setOpeningFromDock(false);
      setAnimVisible(false);
      setFadedOut(true);
      const t = setTimeout(() => setShouldRender(false), unmountDelayMs);
      return () => clearTimeout(t);
    }

    setShouldRender(true);
    setFadedOut(false);

    if (wasMinimized) {
      setOpeningFromDock(true);
      if (prefersReducedMotion) {
        setAnimVisible(true);
        setOpeningFromDock(false);
        return;
      }

      let cancelled = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          setAnimVisible(true);
          setOpeningFromDock(false);
        });
      });
      return () => {
        cancelled = true;
      };
    }

    setOpeningFromDock(false);
    return kickOpenAnimation(setAnimVisible, prefersReducedMotion);
  }, [isMinimized, isClosing, inMC, exitingMC, inWorkspaceTransition, unmountDelayMs, prefersReducedMotion]);

  // Re-trigger zoom-in when promoted from stage strip to center
  const prevStageTargetRef = useRef<StageTarget | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevStageTargetRef.current;
    prevStageTargetRef.current = stageTarget ?? null;
    if (prev === undefined) return;

    if (prev !== null && stageTarget === null && !isMinimized && !inMC && !exitingMC) {
      setFadedOut(false);
      setAnimVisible(false);
      return kickOpenAnimation(setAnimVisible, prefersReducedMotion);
    }
  }, [stageTarget, isMinimized, inMC, exitingMC, prefersReducedMotion]);

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
        const paddingLeft = useWindowStoreStageActive ? STAGE_STRIP_WIDTH : 0;
        
        const areaWidth = window.innerWidth;
        const areaHeight = window.innerHeight - MENUBAR_HEIGHT - DOCK_HEIGHT;
        
        newX = Math.max(paddingLeft, Math.min(newX, areaWidth - cfg.width));
        newY = Math.max(0, Math.min(newY, areaHeight - cfg.height));
        
        moveWindowRef.current(id, newX, newY);

        // ── Drag to menubar → auto-open Mission Control ──
        // When the cursor enters the menubar area during drag, open MC and
        // seamlessly transition to MC drag mode so the user can drop the
        // window onto a workspace thumbnail.
        if (shouldEnterMissionControlOnTopEdge({
          isChatWindow,
          clientY: e.clientY,
          missionControlActive: useWindowStore.getState().missionControlActive,
        })) {
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
        const paddingLeft = useWindowStoreStageActive ? STAGE_STRIP_WIDTH : 0;
        const areaWidth = window.innerWidth;
        const areaHeight = window.innerHeight - MENUBAR_HEIGHT - DOCK_HEIGHT;

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
          const workArea = getDesktopWorkArea({
            stageManagerActive: store.stageManagerActive,
            mobile: false,
          });
          const { x: centerX, y: centerY } = computeVisuallyCenteredPosition(workArea, {
            width: cfg.width,
            height: cfg.height,
          });
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
    if (isMaximized || inMC || stageTarget) return;
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
    if (isMaximized || inMC || stageTarget) return;
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
  }, [config.id, config.x, config.y, config.width, config.height, isMaximized, inMC, stageTarget, isChatWindow, focusWindow, attachInteractionListeners]);
  
  const handleClose = useCallback(() => {
    play('close');
    setAnimVisible(false);
    setFadedOut(true);
    setTimeout(() => {
      if (config.type === 'browser') {
        closeBrowserWindow(config.id);
        return;
      }
      closeWindow(config.id);
    }, unmountDelayMs);
  }, [config.id, config.type, closeBrowserWindow, closeWindow, play, unmountDelayMs]);
  
  const handleMinimize = useCallback(() => {
    play('minimize');
    minimizeWindow(config.id);
  }, [config.id, minimizeWindow, play]);
  
  const handleMaximize = useCallback(() => {
    play('maximize');
    toggleMaximize(config.id);
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
          const store = useWindowStore.getState();
          const workArea = getDesktopWorkArea({
            stageManagerActive: store.stageManagerActive,
            mobile: false,
          });
          const { x: centerX, y: centerY } = computeVisuallyCenteredPosition(workArea, {
            width: config.width,
            height: config.height,
          });
          store.moveWindow(config.id, centerX, centerY);
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
  const otherWorkspaces = isChatWindow ? [] : workspaces.filter(ws => ws.id !== config.workspaceId);

  if (!shouldRender) return null;

  // ── Compute styles ──────────────────────────────────────────────

  const normalAnimTransition = buildTransformOpacityTransition(
    WINDOW_TRANSITION_MS,
    WINDOW_TRANSITION_EASING,
    prefersReducedMotion,
  );

  const isNormalAnim =
    !inMC && !exitingMC && !stageTarget && !inWorkspaceTransition && !mcDragDelta;

  const dockTargetRect = isNormalAnim && (isMinimized || openingFromDock)
    ? getDockTargetRect(config)
    : null;
  const dockMotion = dockTargetRect
    ? computeDockMinimizeTransform(
        { x: config.x + slideXOffset, y: config.y, width: config.width, height: config.height },
        dockTargetRect,
      )
    : null;
  const minimizedTransform = dockMotion?.transform ?? 'scale(0.1)';
  const minimizedTransformOrigin = dockMotion?.transformOrigin ?? 'center center';

  const chatDockTransition = 'left 600ms cubic-bezier(0.4, 0, 0.2, 1), top 600ms cubic-bezier(0.4, 0, 0.2, 1), width 600ms cubic-bezier(0.4, 0, 0.2, 1), height 600ms cubic-bezier(0.4, 0, 0.2, 1)';

  // MC transition (spring curve) — used when entering or exiting MC
  const stagger = missionControlIndex * 15; // ms delay per window for stagger
  const mcTransition = `transform ${MC_DURATION}ms ${MC_SPRING} ${stagger}ms, opacity 300ms ease-out ${stagger}ms`;

  // Stage manager transition (smooth move to center or strip)
  const stageTransition = `transform 400ms cubic-bezier(0.32, 0.72, 0, 1), left 400ms cubic-bezier(0.32, 0.72, 0, 1), top 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 250ms ease-out`;

  // Position shell transition (bounds, MC, stage — not normal open/close)
  let shellTransition: string;
  if (inWorkspaceTransition) {
    shellTransition = 'none';
  } else if (mcDragDelta && mcDropTarget) {
    shellTransition = 'transform 200ms ease-out, opacity 200ms ease-out';
  } else if (mcDragDelta) {
    shellTransition = 'opacity 100ms ease-out';
  } else if (inMC || exitingMC) {
    shellTransition = mcTransition;
  } else if (stageTarget) {
    shellTransition = stageTransition;
  } else if (isStageActive) {
    shellTransition = `transform 400ms cubic-bezier(0.32, 0.72, 0, 1), left 400ms cubic-bezier(0.32, 0.72, 0, 1), top 400ms cubic-bezier(0.32, 0.72, 0, 1), width 400ms cubic-bezier(0.32, 0.72, 0, 1), height 400ms cubic-bezier(0.32, 0.72, 0, 1)`;
  } else if (isChatWindow && !dragRef.current && !resizeRef.current) {
    shellTransition = chatDockTransition;
  } else {
    shellTransition = 'none';
  }

  // Position shell transform/opacity (MC / stage)
  let shellTransform: string;
  let shellOpacity: number;

  if (inMC && missionControlTarget) {
    const { x: targetX, y: targetY, scale } = missionControlTarget;
    const fromDesktop = mcDragFromDesktopRef.current;

    if (mcDropTarget) {
      const padding = 6;
      const innerW = mcDropTarget.thumbW - padding * 2;
      const innerH = mcDropTarget.thumbH - padding * 2;
      const fitScale = Math.min(innerW / config.width, innerH / config.height);
      const dx = mcDropTarget.thumbCenterX - mcDropTarget.parentOffsetX - config.x - (config.width * fitScale) / 2;
      const dy = mcDropTarget.thumbCenterY - mcDropTarget.parentOffsetY - config.y - (config.height * fitScale) / 2;
      shellTransform = `translate(${dx}px, ${dy}px) scale(${fitScale})`;
      shellOpacity = 0.9;
    } else if (fromDesktop && mcDragDelta) {
      const renderScale = scale * 1.08;
      const dx = fromDesktop.grabOffsetX * (1 - renderScale) + mcDragDelta.x;
      const dy = fromDesktop.grabOffsetY * (1 - renderScale) + mcDragDelta.y;
      shellTransform = `translate(${dx}px, ${dy}px) scale(${renderScale})`;
      shellOpacity = 0.8;
    } else {
      const dx = targetX - config.x + (mcDragDelta?.x ?? 0);
      const dy = targetY - config.y + (mcDragDelta?.y ?? 0);
      const dragScale = mcDragDelta ? scale * 1.08 : scale;
      shellTransform = `translate(${dx}px, ${dy}px) scale(${dragScale})`;
      shellOpacity = mcDragDelta ? 0.8 : (isMinimized ? 0.5 : 1);
    }
  } else if (stageTarget) {
    shellTransform = `translate(${stageTarget.x}px, ${stageTarget.y}px) scale(${stageTarget.scale})`;
    shellOpacity = 1;
  } else {
    shellTransform = 'none';
    shellOpacity = 1;
  }

  const animTransform = isNormalAnim
    ? (isMinimized || openingFromDock
      ? minimizedTransform
      : (animVisible ? 'scale(1)' : minimizedTransform))
    : undefined;
  const animOpacity = isNormalAnim ? (fadedOut ? 0 : 1) : 1;
  const animTransition = isNormalAnim ? normalAnimTransition : 'none';
  
  return (
    <div
      ref={windowRef}
      data-window-id={config.id}
      data-window-type={config.type}
      className={cn(
        'absolute',
        inMC ? (mcDragDelta ? 'cursor-grabbing select-none' : 'cursor-pointer select-none')
          : stageTarget ? 'cursor-pointer select-none'
          : undefined,
      )}
        style={{
          left: config.x + slideXOffset,
          top: config.y,
          width: config.width,
          height: config.height,
          zIndex: stageTarget ? 95 : mcDragDelta ? Z_INDEX.missionControlBar + 1 : config.zIndex,
          opacity: shellOpacity,
          transform: shellTransform,
          transformOrigin: '0 0',
          transition: shellTransition,
          pointerEvents: isMinimized || openingFromDock ? 'none' : 'auto',
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
        <div
          className="flex h-full w-full flex-col"
          style={{
            transform: animTransform,
            opacity: animOpacity,
            transformOrigin: minimizedTransformOrigin,
            transition: animTransition,
            pointerEvents: isNormalAnim && !animVisible ? 'none' : 'auto',
          }}
        >
        <div
          className={cn(
            'relative flex h-full w-full flex-col is-open rounded-lg',
            'glass-window border border-black/10 dark:border-white/10',
            isFocused
              ? 'shadow-[var(--shadow-window-focus)]'
              : 'shadow-[var(--shadow-window)]',
            inMC ? 'overflow-visible rounded-xl' : stageTarget ? 'overflow-visible' : 'overflow-hidden',
          )}
          style={{ transform: 'translateZ(0)' }}
        >
          {/* Window chrome — clip overflow so content doesn't escape rounded corners */}
          <div className={cn(
            'flex h-full w-full flex-col',
            inMC ? 'overflow-hidden rounded-xl' : 'overflow-hidden',
          )}>
            <TitleBar
              title={config.title}
              icon={config.icon}
              isFocused={isFocused}
              isMobile={false}
              state={config.state}
              onMinimize={inMC ? undefined : handleMinimize}
              onMaximize={inMC || isChatWindow ? undefined : handleMaximize}
              onClose={inMC ? undefined : handleClose}
              onDoubleClick={inMC || isChatWindow ? undefined : handleMaximize}
              onPointerDown={inMC ? undefined : handleDragStart}
              onContextMenu={inMC ? undefined : handleContextMenu}
              rightAccessory={inMC ? undefined : titleBarAccessory}
            />
            
            <div className="relative flex-1 overflow-hidden">
              {children}
              {/* Invisible overlay blocks all interaction with app content during MC and Stage strip */}
              {(inMC || stageTarget) && <div className="absolute inset-0 z-50 pointer-events-auto" />}
            </div>
          </div>

          {/* Resize handles — hidden in MC mode */}
          {!inMC && !stageTarget && (
            <ResizeHandles
              onResizeStart={handleResizeStart}
              disabled={isMaximized}
            />
          )}
        </div>
      </div>

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
          <div className="glass-tooltip text-white text-sm px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            {config.title}
          </div>
        </div>
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
              'glass-popover border border-white/20',
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
              'glass-popover',
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
            glass-popover border border-black/10 dark:border-white/10
            shadow-2xl"
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
                onClick={(e) => {
                  e.stopPropagation();
                  setCtxSubmenu((v) => !v);
                }}
              >
                Move to Workspace
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
              {ctxSubmenu && createPortal(
                <div
                  ref={ctxSubmenuRef}
                  className="fixed min-w-[160px] rounded-[10px] p-1
                    glass-popover border border-black/10 dark:border-white/10
                    shadow-2xl"
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
