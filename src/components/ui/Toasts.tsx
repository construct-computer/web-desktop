import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, Copy, Check, X } from 'lucide-react';
import { useNotificationStore, type Notification } from '@/stores/notificationStore';
import { useSound } from '@/hooks/useSound';
import { Z_INDEX, MENUBAR_HEIGHT } from '@/lib/constants';

const BODY_CLAMP_LENGTH = 120;

const SLIDE_OUT_MS = 300;

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function ToastBanner({
  n,
  leaving,
  onDismiss,
}: {
  n: Notification;
  leaving: boolean;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragStartXRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const Icon =
    n.variant === 'success' ? CheckCircle2
      : n.variant === 'error' ? AlertCircle
        : Info;

  const iconColor =
    n.variant === 'success' ? 'text-green-400'
      : n.variant === 'error' ? 'text-red-400'
        : 'text-[var(--color-accent)]';

  const isLongBody = !!n.body && n.body.length > BODY_CLAMP_LENGTH;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = [n.title, n.body].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragStartXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current == null) return;
    const nextDragX = e.clientX - dragStartXRef.current;
    if (Math.abs(nextDragX) > 4) {
      suppressClickRef.current = true;
    }
    setDragX(nextDragX);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current == null) return;
    dragStartXRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    if (Math.abs(dragX) >= 88) {
      onDismiss();
      return;
    }
    setDragX(0);
    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  return (
    <div
      className={`relative flex items-start gap-3 w-[min(340px,calc(100vw-32px))] px-3.5 py-3 pr-8
                 glass-popover
                 border border-black/8 dark:border-white/10
                 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/30
                 cursor-grab select-none touch-pan-y active:cursor-grabbing
                 ${leaving ? 'animate-[toast-slide-out_0.3s_ease-in_forwards]' : 'animate-[toast-slide-in_0.3s_cubic-bezier(0.16,1,0.3,1)]'}`}
      style={dragX ? {
        transform: `translateX(${dragX}px)`,
        opacity: Math.max(0.45, 1 - Math.abs(dragX) / 180),
      } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (suppressClickRef.current) return;
        if (n.onClick) n.onClick();
        onDismiss();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (n.onClick) n.onClick();
        onDismiss();
      }}
    >
      <button
        type="button"
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-black/30 transition-colors hover:bg-black/5 hover:text-black/55 dark:text-white/32 dark:hover:bg-white/[0.07] dark:hover:text-white/62"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0">
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {n.source && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/35 mb-0.5">
            {n.source}
          </p>
        )}
        <p className="text-[13px] font-medium text-black/85 dark:text-white/90 leading-snug">
          {n.title}
        </p>
        {n.body && (
          <p className={`text-[12px] text-black/50 dark:text-white/50 leading-snug mt-0.5 ${!expanded && isLongBody ? 'line-clamp-2' : ''}`}>
            {n.body}
          </p>
        )}
        {/* Expand / Copy controls for long or error messages */}
        {(isLongBody || n.variant === 'error') && (
          <div className="flex items-center gap-2 mt-1.5">
            {isLongBody && (
              <button
                type="button"
                onClick={handleToggleExpand}
                className="cursor-pointer text-[10px] font-medium text-[var(--color-accent)] hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="flex cursor-pointer items-center gap-1 text-[10px] font-medium text-black/40 transition-colors hover:text-black/60 dark:text-white/40 dark:hover:text-white/60"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        {/* Inline action buttons (e.g. Continue) */}
        {n.actions && n.actions.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {n.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  action.run();
                  onDismiss();
                }}
                className={
                  action.variant === 'primary'
                    ? 'inline-flex h-6 cursor-pointer items-center rounded-md bg-[var(--color-accent)] px-2.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90'
                    : 'inline-flex h-6 cursor-pointer items-center rounded-md border border-black/10 px-2.5 text-[11px] font-medium text-black/60 transition-colors hover:text-black/85 dark:border-white/15 dark:text-white/60 dark:hover:text-white/85'
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-black/30 dark:text-white/30 flex-shrink-0 mt-0.5">
        {timeAgo(n.timestamp)}
      </span>
    </div>
  );
}

export function Toasts() {
  const activeToasts = useNotificationStore((s) => s.activeToasts);
  const notifications = useNotificationStore((s) => s.notifications);
  const dismissToast = useNotificationStore((s) => s.dismissToast);
  const { play } = useSound();
  const prevCountRef = useRef(0);
  const leavingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>> | null>(null);
  const leavingIdsRef = useRef<Set<string> | null>(null);
  if (!leavingTimersRef.current) leavingTimersRef.current = new Map();
  if (!leavingIdsRef.current) leavingIdsRef.current = new Set();

  // Track IDs that are animating out
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  // Keep previous active set to detect removals
  const prevActiveRef = useRef<string[]>([]);

  const scheduleLeavingRemoval = useCallback((id: string, afterStoreDismiss = false) => {
    const timers = leavingTimersRef.current!;
    const ids = leavingIdsRef.current!;
    if (timers.has(id)) return;
    ids.add(id);
    setLeavingIds(new Set(ids));
    const timer = setTimeout(() => {
      if (afterStoreDismiss) dismissToast(id);
      timers.delete(id);
      ids.delete(id);
      setLeavingIds(new Set(ids));
    }, SLIDE_OUT_MS);
    timers.set(id, timer);
  }, [dismissToast]);

  useEffect(() => () => {
    for (const timer of leavingTimersRef.current!.values()) clearTimeout(timer);
    leavingTimersRef.current!.clear();
  }, []);

  // Detect toasts removed from the store and start their exit animation
  useEffect(() => {
    const prev = new Set(prevActiveRef.current);
    const curr = new Set(activeToasts);

    // Newly removed — start slide-out
    const removed = [...prev].filter((id) => !curr.has(id) && !leavingIdsRef.current!.has(id));
    removed.forEach((id) => scheduleLeavingRemoval(id));

    prevActiveRef.current = activeToasts;
  }, [activeToasts, scheduleLeavingRemoval]);

  // Manual dismiss: start exit animation then remove from store
  const handleDismiss = useCallback((id: string) => {
    scheduleLeavingRemoval(id, true);
  }, [scheduleLeavingRemoval]);

  // Visible = active + currently leaving
  const visibleIds = [...new Set([...activeToasts, ...leavingIds])];

  // Resolve visible IDs to notification objects
  const toastNotifications = visibleIds
    .map((id) => notifications.find((n) => n.id === id))
    .filter((n): n is Notification => n != null);

  // Play notification sound when a new toast appears
  useEffect(() => {
    if (activeToasts.length > prevCountRef.current) {
      play('notification');
    }
    prevCountRef.current = activeToasts.length;
  }, [activeToasts.length, play]);

  if (toastNotifications.length === 0) return null;

  return (
    <div
      className="fixed right-3 flex flex-col gap-2.5 pointer-events-auto"
      style={{ top: MENUBAR_HEIGHT + 8, zIndex: Z_INDEX.notification }}
    >
      {toastNotifications.map((n) => (
        <ToastBanner
          key={n.id}
          n={n}
          leaving={leavingIds.has(n.id)}
          onDismiss={() => handleDismiss(n.id)}
        />
      ))}
    </div>
  );
}
