/**
 * Hook for draggable, slot-snapping desktop widgets.
 * Handles pointer drag, snap-to-slot on release, bump-on-collision,
 * window resize adaptation, and localStorage persistence.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  initWidget, snapToSlot, slotPosition, WIDGET_WIDTH,
  type SlotId,
} from '@/lib/widgetSlots';
import { Z_INDEX } from '@/lib/constants';

const SPRING = 'left 0.35s cubic-bezier(0.34,1.56,0.64,1), top 0.35s cubic-bezier(0.34,1.56,0.64,1)';

export function useDraggableWidget(widgetId: string, defaultSlot: SlotId) {
  const [slot, setSlot] = useState<SlotId>(() => initWidget(widgetId, defaultSlot));
  const [pos, setPos] = useState(() => slotPosition(slot));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ mx: number; my: number; sx: number; sy: number } | null>(null);

  // Re-snap on window resize
  useEffect(() => {
    const h = () => { if (!dragging) setPos(slotPosition(slot)); };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [slot, dragging]);

  // Listen for bump events (another widget claimed our slot)
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent).detail as { widgetId: string; slot: SlotId };
      if (detail.widgetId === widgetId) {
        setSlot(detail.slot);
        setPos(slotPosition(detail.slot));
      }
    };
    window.addEventListener('widget-bumped', h);
    return () => window.removeEventListener('widget-bumped', h);
  }, [widgetId]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { mx: e.clientX, my: e.clientY, sx: pos.x, sy: pos.y };
    setDragging(true);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.sx + e.clientX - dragRef.current.mx,
      y: dragRef.current.sy + e.clientY - dragRef.current.my,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    const newSlot = snapToSlot(widgetId, pos.x, pos.y);
    setSlot(newSlot);
    setPos(slotPosition(newSlot));
  }, [widgetId, pos]);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    top: pos.y,
    width: WIDGET_WIDTH,
    zIndex: Z_INDEX.desktopWidget,
    transition: dragging ? 'none' : SPRING,
    userSelect: 'none',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
  };

  return {
    containerStyle,
    containerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      className: 'pointer-events-auto cursor-grab active:cursor-grabbing',
    },
    dragging,
    slot,
  };
}
