/**
 * Hook for draggable, slot-snapping desktop widgets.
 * Handles pointer drag, snap-to-slot on release, bump-on-collision,
 * window resize adaptation, and localStorage persistence.
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  initWidget, normalizeWidgetSize, snapToSlotWithSize, slotPosition, WIDGET_HEIGHT, WIDGET_WIDTH,
  type WidgetSize,
  type SlotId,
} from '@/lib/widgetSlots';
import { Z_INDEX } from '@/lib/constants';

const SPRING = 'left 0.35s cubic-bezier(0.34,1.56,0.64,1), top 0.35s cubic-bezier(0.34,1.56,0.64,1)';

export function useDraggableWidget(widgetId: string, defaultSlot: SlotId) {
  const [slot, setSlot] = useState<SlotId>(() => initWidget(widgetId, defaultSlot));
  const [widgetSize, setWidgetSize] = useState<WidgetSize>(() => normalizeWidgetSize({ width: WIDGET_WIDTH, height: WIDGET_HEIGHT }));
  const [pos, setPos] = useState(() => slotPosition(slot, widgetSize));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ mx: number; my: number; sx: number; sy: number } | null>(null);
  const posRef = useRef(pos);
  const sizeRef = useRef(widgetSize);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clampPos = useCallback((x: number, y: number, size = sizeRef.current) => {
    const measured = normalizeWidgetSize(size);
    const minX = 0;
    const maxX = Math.max(0, window.innerWidth - measured.width);
    const minY = 0;
    const maxY = Math.max(0, window.innerHeight - measured.height);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  const setClampedPos = useCallback((next: { x: number; y: number }) => {
    const clamped = clampPos(next.x, next.y);
    posRef.current = clamped;
    setPos(clamped);
  }, [clampPos]);

  const measure = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return sizeRef.current;
    const next = normalizeWidgetSize({ width: rect.width, height: rect.height });
    const prev = sizeRef.current;
    if (Math.abs(prev.width - next.width) > 0.5 || Math.abs(prev.height - next.height) > 0.5) {
      sizeRef.current = next;
      setWidgetSize(next);
      setClampedPos(slotPosition(slot, next));
    }
    return next;
  }, [setClampedPos, slot]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Re-snap on window resize
  useEffect(() => {
    const h = () => {
      if (dragging) return;
      const size = measure();
      setClampedPos(slotPosition(slot, size));
    };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [dragging, measure, setClampedPos, slot]);

  // Listen for bump events (another widget claimed our slot)
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent).detail as { widgetId: string; slot: SlotId };
      if (detail.widgetId === widgetId) {
        const size = measure();
        setSlot(detail.slot);
        setClampedPos(slotPosition(detail.slot, size));
      }
    };
    window.addEventListener('widget-bumped', h);
    return () => window.removeEventListener('widget-bumped', h);
  }, [measure, setClampedPos, widgetId]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const size = measure();
    sizeRef.current = size;
    dragRef.current = { mx: e.clientX, my: e.clientY, sx: posRef.current.x, sy: posRef.current.y };
    setDragging(true);
  }, [measure]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setClampedPos({
      x: dragRef.current.sx + e.clientX - dragRef.current.mx,
      y: dragRef.current.sy + e.clientY - dragRef.current.my,
    });
  }, [setClampedPos]);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    const size = measure();
    const latest = posRef.current;
    const newSlot = snapToSlotWithSize(widgetId, latest.x, latest.y, size);
    setSlot(newSlot);
    setClampedPos(slotPosition(newSlot, size));
  }, [measure, setClampedPos, widgetId]);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    top: pos.y,
    zIndex: Z_INDEX.desktopWidget,
    transition: dragging ? 'none' : SPRING,
    userSelect: 'none',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
  };

  return {
    containerStyle,
    containerProps: {
      ref: containerRef,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      className: 'pointer-events-auto cursor-grab active:cursor-grabbing',
    },
    dragging,
    slot,
  };
}
