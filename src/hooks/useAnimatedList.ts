import { useEffect, useMemo, useRef, useState } from 'react';

export const LIST_LEAVE_MS = 180;
export const LIST_ENTER_MS = 220;

export type AnimatedListPhase = 'entering' | 'stable' | 'leaving';

export interface AnimatedListEntry<T> {
  key: string;
  item: T;
  phase: AnimatedListPhase;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Tracks list item enter/leave phases by diffing stable keys between renders.
 * Removed items stay in the returned array briefly so exit animations can play.
 */
export function useAnimatedList<T>(
  items: T[],
  getKey: (item: T) => string,
): AnimatedListEntry<T>[] {
  const reducedMotionRef = useRef(prefersReducedMotion());
  const prevKeysRef = useRef<Set<string>>(new Set());
  const prevItemsByKeyRef = useRef<Map<string, T>>(new Map());
  const leavingRef = useRef<Map<string, T>>(new Map());
  const [leaveGeneration, setLeaveGeneration] = useState(0);

  const currentByKey = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) map.set(getKey(item), item);
    return map;
  }, [items, getKey]);

  const currentKeys = useMemo(() => new Set(currentByKey.keys()), [currentByKey]);

  for (const key of prevKeysRef.current) {
    if (!currentKeys.has(key) && !leavingRef.current.has(key)) {
      const prevItem = prevItemsByKeyRef.current.get(key);
      if (prevItem !== undefined) leavingRef.current.set(key, prevItem);
    }
  }

  for (const key of leavingRef.current.keys()) {
    if (currentKeys.has(key)) leavingRef.current.delete(key);
  }

  useEffect(() => {
    if (leavingRef.current.size === 0) return;
    const delay = reducedMotionRef.current ? 0 : LIST_LEAVE_MS;
    const id = window.setTimeout(() => {
      let changed = false;
      for (const key of [...leavingRef.current.keys()]) {
        if (!currentByKey.has(key)) {
          leavingRef.current.delete(key);
          changed = true;
        }
      }
      if (changed) setLeaveGeneration((n) => n + 1);
    }, delay);
    return () => window.clearTimeout(id);
  }, [items, currentByKey]);

  const entries = useMemo(() => {
    void leaveGeneration;
    const reduced = reducedMotionRef.current;
    const priorKeys = prevKeysRef.current;
    const result: AnimatedListEntry<T>[] = [];

    for (const item of items) {
      const key = getKey(item);
      result.push({
        key,
        item,
        phase: reduced ? 'stable' : priorKeys.has(key) ? 'stable' : 'entering',
      });
    }

    for (const [key, item] of leavingRef.current) {
      if (!currentByKey.has(key)) {
        result.push({
          key,
          item,
          phase: reduced ? 'stable' : 'leaving',
        });
      }
    }

    return result;
  }, [items, getKey, currentByKey, leaveGeneration]);

  prevKeysRef.current = currentKeys;
  prevItemsByKeyRef.current = currentByKey;

  return entries;
}

export function classifyListPhases(
  currentKeys: string[],
  priorKeys: Set<string>,
): Map<string, AnimatedListPhase> {
  const phases = new Map<string, AnimatedListPhase>();
  for (const key of currentKeys) {
    phases.set(key, priorKeys.has(key) ? 'stable' : 'entering');
  }
  for (const key of priorKeys) {
    if (!currentKeys.includes(key)) phases.set(key, 'leaving');
  }
  return phases;
}
