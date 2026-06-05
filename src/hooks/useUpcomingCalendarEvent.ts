import { useCallback, useEffect, useState } from 'react';
import type { AgentCalendarEvent } from '@/services/api';
import { AGENT_CALENDAR_REFRESH_EVENT } from '@/lib/agentUiEvents';
import { fetchNextUpcomingCalendarEvent } from '@/lib/upcomingCalendarEvent';

const POLL_MS = 60_000;

export function useUpcomingCalendarEvent(): AgentCalendarEvent | null {
  const [nextEvent, setNextEvent] = useState<AgentCalendarEvent | null>(null);

  const refresh = useCallback(async (isCancelled?: () => boolean) => {
    const event = await fetchNextUpcomingCalendarEvent();
    if (isCancelled?.()) return;
    setNextEvent(event);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh(() => cancelled);

    const interval = setInterval(() => void refresh(() => cancelled), POLL_MS);
    const onRefresh = () => { void refresh(() => cancelled); };
    const refreshWhenVisible = () => {
      if (!document.hidden) void refresh(() => cancelled);
    };

    window.addEventListener(AGENT_CALENDAR_REFRESH_EVENT, onRefresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener(AGENT_CALENDAR_REFRESH_EVENT, onRefresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [refresh]);

  return nextEvent;
}
