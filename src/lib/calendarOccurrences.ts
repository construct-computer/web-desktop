export function normalizeOccurrenceStart(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) throw new Error('Invalid occurrence start');
  return new Date(ms).toISOString();
}

export function occurrenceArrayIncludes(arr: string[] | null | undefined, occurrenceStart: string): boolean {
  const key = normalizeOccurrenceStart(occurrenceStart);
  return (arr || []).some((item) => {
    try {
      return normalizeOccurrenceStart(item) === key;
    } catch {
      return false;
    }
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
