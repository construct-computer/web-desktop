/**
 * Widget slot system — manages snap positions for desktop widgets.
 *
 * 4 corner slots:
 *
 *   [tl]                    [tr]
 *
 *   [bl]                    [br]
 *
 * Rules:
 *   - Each slot holds at most 1 widget
 *   - Widgets snap to nearest free slot on drop
 *   - Slot assignments persist to localStorage
 */

import { MENUBAR_HEIGHT, DOCK_HEIGHT } from '@/lib/constants';

const PAD = 14;
const W = 210;
const H = 100;

export type SlotId = 'tl' | 'tr' | 'bl' | 'br';

const ALL_SLOTS: SlotId[] = ['tl', 'tr', 'bl', 'br'];

// ── Pixel positions ──────────────────────────────────────────────────────────

export function slotPosition(id: SlotId): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = MENUBAR_HEIGHT + PAD;
  const bottom = vh - DOCK_HEIGHT - PAD - H;
  const right = vw - W - PAD;

  switch (id) {
    case 'tl': return { x: PAD, y: top };
    case 'tr': return { x: right, y: top };
    case 'bl': return { x: PAD, y: bottom };
    case 'br': return { x: right, y: bottom };
  }
}

// ── Occupancy tracking ───────────────────────────────────────────────────────

const STORAGE_KEY = 'construct:widget-slots';
const occupancy = new Map<SlotId, string>();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, string>;
    for (const [slot, widget] of Object.entries(data)) {
      if (ALL_SLOTS.includes(slot as SlotId)) {
        occupancy.set(slot as SlotId, widget);
      }
    }
  } catch { /* corrupt storage — start fresh */ }
}

function save() {
  try {
    const data: Record<string, string> = {};
    for (const [slot, widget] of occupancy) data[slot] = widget;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

load();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get which slot a widget occupies. */
export function getWidgetSlot(widgetId: string): SlotId | null {
  for (const [slot, wid] of occupancy) {
    if (wid === widgetId) return slot;
  }
  return null;
}

/** Release a widget from its current slot. */
function release(widgetId: string) {
  for (const [slot, wid] of occupancy) {
    if (wid === widgetId) { occupancy.delete(slot); return; }
  }
}

/** Distance² between a point and a slot's position. */
function dist2(x: number, y: number, slotId: SlotId): number {
  const p = slotPosition(slotId);
  const dx = p.x - x;
  const dy = p.y - y;
  return dx * dx + dy * dy;
}

/** Find nearest FREE slot to (x, y). Does NOT count `self` as free. */
function findNearestFree(x: number, y: number): SlotId | null {
  let best: SlotId | null = null;
  let bestDist = Infinity;
  for (const slot of ALL_SLOTS) {
    if (occupancy.has(slot)) continue;
    const d = dist2(x, y, slot);
    if (d < bestDist) { bestDist = d; best = slot; }
  }
  return best;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Place a widget on a slot. Handles collisions (bumps occupant).
 * Set `silent` to true during init to suppress events.
 */
export function claimSlot(widgetId: string, targetSlot: SlotId, silent = false): SlotId {
  release(widgetId);

  const occupant = occupancy.get(targetSlot);
  if (occupant) {
    occupancy.delete(targetSlot);
    const bumpTo = findNearestFree(slotPosition(targetSlot).x, slotPosition(targetSlot).y);
    if (bumpTo) {
      occupancy.set(bumpTo, occupant);
      if (!silent) {
        window.dispatchEvent(new CustomEvent('widget-bumped', {
          detail: { widgetId: occupant, slot: bumpTo },
        }));
      }
    }
  }

  occupancy.set(targetSlot, widgetId);
  save();
  return targetSlot;
}

/**
 * Snap a dragged widget to the nearest corner slot.
 */
export function snapToSlot(widgetId: string, x: number, y: number): SlotId {
  let best: SlotId = 'tr';
  let bestDist = Infinity;
  for (const slot of ALL_SLOTS) {
    const d = dist2(x, y, slot);
    if (d < bestDist) { bestDist = d; best = slot; }
  }
  return claimSlot(widgetId, best);
}

/**
 * Initialize a widget with a default slot. If already placed (from localStorage),
 * reuses the persisted slot. Silent — no bump events during init.
 */
export function initWidget(widgetId: string, defaultSlot: SlotId): SlotId {
  const existing = getWidgetSlot(widgetId);
  if (existing) return existing;
  return claimSlot(widgetId, defaultSlot, true);
}

export const WIDGET_WIDTH = W;
