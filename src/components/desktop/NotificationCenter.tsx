import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Info, Trash2 } from 'lucide-react';
import { useNotificationStore, type Notification } from '@/stores/notificationStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import {
  MENUBAR_HEIGHT,
  MOBILE_MENUBAR_HEIGHT,
  MOBILE_APP_BAR_HEIGHT,
  NOTIFICATION_DRAWER_WIDTH,
  NOTIFICATION_DRAWER_TRANSITION_MS,
  NOTIFICATION_DRAWER_EASING,
  Z_INDEX,
} from '@/lib/constants';

// ─── Time helpers ──────────────────────────────────────────────────────────

function formatTimeShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

type GroupKey = 'today' | 'yesterday' | 'earlier';

function getGroupKey(ts: number): GroupKey {
  const now = new Date();
  const date = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  if (date >= today) return 'today';
  if (date >= yesterday) return 'yesterday';
  return 'earlier';
}

const GROUP_LABELS: Record<GroupKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

function groupNotifications(notifications: Notification[]): [GroupKey, Notification[]][] {
  const groups = new Map<GroupKey, Notification[]>();
  for (const n of notifications) {
    const key = getGroupKey(n.timestamp);
    const list = groups.get(key) || [];
    list.push(n);
    groups.set(key, list);
  }
  // Return in fixed order
  const result: [GroupKey, Notification[]][] = [];
  for (const key of ['today', 'yesterday', 'earlier'] as GroupKey[]) {
    const list = groups.get(key);
    if (list && list.length > 0) result.push([key, list]);
  }
  return result;
}

// ─── Notification card ─────────────────────────────────────────────────────

function NotificationCard({ n, onRemove }: { n: Notification; onRemove: () => void }) {
  const Icon =
    n.variant === 'success' ? CheckCircle2
      : n.variant === 'error' ? AlertCircle
        : Info;

  const iconColor =
    n.variant === 'success' ? 'text-green-400'
      : n.variant === 'error' ? 'text-red-400'
        : 'text-[var(--color-accent)]';

  return (
    <div
      className={`group relative surface-card border border-black/5 dark:border-white/8 rounded-xl px-3.5 py-3 transition-colors hover:bg-white/70 dark:hover:bg-white/8 ${n.onClick ? 'cursor-pointer' : ''}`}
      onClick={() => { if (n.onClick) n.onClick(); }}
    >
      {/* Remove button (shows on hover) */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
      >
        <X className="w-3 h-3 text-black/40 dark:text-white/40" />
      </button>

      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className="mt-0.5 flex-shrink-0">
          <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2">
            {n.source && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/35">
                {n.source}
              </span>
            )}
            <span className="text-[10px] text-black/25 dark:text-white/25 ml-auto flex-shrink-0">
              {formatTimeShort(n.timestamp)}
            </span>
          </div>
          <p className="text-[13px] font-medium text-black/80 dark:text-white/85 leading-snug mt-0.5">
            {n.title}
          </p>
          {n.body && (
            <p className="text-[12px] text-black/45 dark:text-white/45 leading-snug mt-0.5">
              {n.body}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notification Center drawer ────────────────────────────────────────────

export function NotificationCenter() {
  const drawerOpen = useNotificationStore((s) => s.drawerOpen);
  const setDrawerOpen = useNotificationStore((s) => s.setDrawerOpen);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount)();
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const drawerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const drawerTransitionMs = prefersReducedMotion ? 0 : NOTIFICATION_DRAWER_TRANSITION_MS;
  const drawerTransition = prefersReducedMotion
    ? 'none'
    : `${drawerTransitionMs}ms ${NOTIFICATION_DRAWER_EASING}`;

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen, setDrawerOpen]);

  // Close on outside click
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        // Don't close if clicking the menu bar toggle button
        const toggle = document.getElementById('notification-center-toggle');
        if (toggle && toggle.contains(e.target as Node)) return;
        setDrawerOpen(false);
      }
    };
    // Delay to avoid the opening click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [drawerOpen, setDrawerOpen]);

  const grouped = groupNotifications(notifications);
  const drawerWidth = isMobile ? '100dvw' : `${NOTIFICATION_DRAWER_WIDTH}px`;
  const topOffset = isMobile ? MOBILE_MENUBAR_HEIGHT : MENUBAR_HEIGHT;
  const bottomOffset = isMobile ? MOBILE_APP_BAR_HEIGHT : 0;
  const translateHidden = isMobile ? 'translateX(100dvw)' : `translateX(${NOTIFICATION_DRAWER_WIDTH}px)`;

  return createPortal(
    <>
      {/* Backdrop overlay */}
      <div
        className={cn(
          'fixed inset-0 soft-scrim notification-drawer-scrim',
          drawerOpen && 'is-open',
        )}
        style={{
          top: topOffset,
          bottom: bottomOffset,
          zIndex: Z_INDEX.notification - 1,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          ['--notification-drawer-transition' as string]: drawerTransition,
        }}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer panel */}
      <div
        id="notification-center-drawer"
        ref={drawerRef}
        className="fixed flex flex-col
                   glass-window notification-glass-window
                   border-l border-black/8 dark:border-white/8
                   shadow-2xl shadow-black/12 dark:shadow-black/30"
        style={{
          top: topOffset,
          bottom: bottomOffset,
          right: 0,
          width: drawerWidth,
          zIndex: Z_INDEX.notification,
          transition: prefersReducedMotion
            ? 'none'
            : `transform ${drawerTransitionMs}ms ${NOTIFICATION_DRAWER_EASING}`,
          transform: drawerOpen ? 'translateX(0)' : translateHidden,
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-black/80 dark:text-white/90">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white font-semibold px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/8 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-3">
                <Info className="w-5 h-5 text-black/20 dark:text-white/20" />
              </div>
              <p className="text-sm text-black/35 dark:text-white/35">
                No notifications
              </p>
            </div>
          ) : (
            grouped.map(([key, items]) => (
              <div key={key} className="mt-3 first:mt-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-black/35 dark:text-white/30 px-1 mb-2">
                  {GROUP_LABELS[key]}
                </h3>
                <div className="space-y-2">
                  {items.map((n) => (
                    <NotificationCard
                      key={n.id}
                      n={n}
                      onRemove={() => removeNotification(n.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
