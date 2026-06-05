import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useComputerStore } from '@/stores/agentStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUpcomingCalendarEvent } from '@/hooks/useUpcomingCalendarEvent';

const CARD =
  'flex flex-col rounded-2xl p-4 text-left min-h-[110px] min-w-0 flex-1 max-w-[240px] transition-colors active:scale-[0.98] ' +
  'glass-window ' +
  'border border-black/10 dark:border-white/10 ' +
  'shadow-[var(--shadow-window)] ' +
  'hover:bg-white/80 dark:hover:bg-black/75';

interface CalendarEmailQuickWidgetsProps {
  onCalendarClick: () => void;
  onEmailClick: () => void;
}

export function CalendarEmailQuickWidgets({ onCalendarClick, onEmailClick }: CalendarEmailQuickWidgetsProps) {
  const emailUnreadCount = useComputerStore((s) => s.emailUnreadCount);
  const notifUnread = useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);
  const nextEvent = useUpcomingCalendarEvent();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pointer-events-auto flex gap-3 w-full max-w-[520px] justify-center">
      <button type="button" onClick={onCalendarClick} className={cn(CARD, 'justify-between')}>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
            {now.toLocaleString('default', { weekday: 'long' })}
          </span>
          <div className="text-3xl font-semibold leading-none mt-1 text-[var(--color-text)]">
            {now.getDate()}
          </div>
        </div>
        <div className="text-[12px] text-[var(--color-text-muted)] mt-2 line-clamp-2">
          {nextEvent ? nextEvent.summary : 'No upcoming events'}
        </div>
      </button>

      <button type="button" onClick={onEmailClick} className={cn(CARD)}>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          Inbox
        </span>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          <span className="text-[14px] font-medium text-[var(--color-text)]">
            {emailUnreadCount} new emails
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
          <span className="text-[14px] font-medium text-[var(--color-text)]">
            {notifUnread} notifications
          </span>
        </div>
      </button>
    </div>
  );
}
