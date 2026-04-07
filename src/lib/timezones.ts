/**
 * Timezone list for the timezone selector dropdown.
 * Uses Intl.supportedValuesOf where available, with a curated fallback.
 */

interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
}

function getOffsetLabel(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    return offsetPart?.value || '';
  } catch {
    return '';
  }
}

function formatTzLabel(tz: string): string {
  const offset = getOffsetLabel(tz);
  const city = tz.split('/').pop()?.replace(/_/g, ' ') || tz;
  return offset ? `${offset} — ${city}` : city;
}

const FALLBACK_TIMEZONES = [
  'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
  'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Helsinki', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai',
  'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

let _cached: TimezoneOption[] | null = null;

export function getTimezoneOptions(): TimezoneOption[] {
  if (_cached) return _cached;

  let zones: string[];
  try {
    zones = (Intl as any).supportedValuesOf('timeZone');
  } catch {
    zones = FALLBACK_TIMEZONES;
  }

  _cached = zones.map(tz => ({
    value: tz,
    label: formatTzLabel(tz),
    offset: getOffsetLabel(tz),
  })).sort((a, b) => {
    // Sort by UTC offset numerically, then alphabetically
    const parseOffset = (o: string) => {
      const m = o.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (!m) return 0;
      const sign = m[1] === '+' ? 1 : -1;
      return sign * (parseInt(m[2]) * 60 + parseInt(m[3] || '0'));
    };
    const diff = parseOffset(a.offset) - parseOffset(b.offset);
    if (diff !== 0) return diff;
    return a.value.localeCompare(b.value);
  });

  return _cached;
}

export function getDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}
