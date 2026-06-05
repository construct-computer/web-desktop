export function normalizeOccurrenceStart(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) throw new Error('Invalid occurrence start');
  return new Date(ms).toISOString();
}

/** Floor an ISO instant to the minute, for tolerant occurrence comparison. */
function minuteKey(iso: string): string | null {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

export function occurrenceArrayIncludes(arr: string[] | null | undefined, occurrenceStart: string): boolean {
  let exact: string | null = null;
  try {
    exact = normalizeOccurrenceStart(occurrenceStart);
  } catch {
    exact = null;
  }
  // Minute-granularity fallback absorbs sub-minute representation differences
  // between the expanded occurrence and the stored instant.
  const minute = minuteKey(occurrenceStart);
  if (!exact && !minute) return false;
  return (arr || []).some((item) => {
    try {
      if (exact && normalizeOccurrenceStart(item) === exact) return true;
    } catch {
      // fall through to minute comparison
    }
    return minute !== null && minuteKey(item) === minute;
  });
}

export function isOccurrenceCancelled(
  cancelledOccurrences: string[] | null | undefined,
  occurrenceStart: string,
): boolean {
  return occurrenceArrayIncludes(cancelledOccurrences, occurrenceStart);
}

export function filterCancelledOccurrences<T extends { id: string; start: string; cancelledOccurrences?: string[] | null }>(
  events: T[],
): T[] {
  return events.filter((event) => !isOccurrenceCancelled(event.cancelledOccurrences, event.start));
}
