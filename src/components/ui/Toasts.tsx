import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, Copy, Check } from 'lucide-react';
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

  return (
    <div
      className={`flex items-start gap-3 w-[min(340px,calc(100vw-32px))] px-3.5 py-3
                 glass-popover
                 border border-black/8 dark:border-white/10
                 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/30
                 cursor-pointer select-none
                 ${leaving ? 'animate-[toast-slide-out_0.3s_ease-in_forwards]' : 'animate-[toast-slide-in_0.3s_cubic-bezier(0.16,1,0.3,1)]'}`}
      onClick={() => {
        if (n.onClick) n.onClick();
        onDismiss();
      }}
    >
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
                onClick={handleToggleExpand}
                className="text-[10px] font-medium text-[var(--color-accent)] hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] font-medium text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
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

  // Track IDs that are animating out
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  // Keep previous active set to detect removals
  const prevActiveRef = useRef<string[]>([]);
  // IDs still visible (active + leaving)
  const [visibleIds, setVisibleIds] = useState<string[]>([]);

  // Detect toasts removed from the store and start their exit animation
  useEffect(() => {
    const prev = new Set(prevActiveRef.current);
    const curr = new Set(activeToasts);

    // Newly removed — start slide-out
    const removed = [...prev].filter((id) => !curr.has(id) && !leavingIds.has(id));
    if (removed.length > 0) {
      setLeavingIds((s) => {
        const next = new Set(s);
        removed.forEach((id) => next.add(id));
        return next;
      });
      // After animation, fully remove
      setTimeout(() => {
        setLeavingIds((s) => {
          const next = new Set(s);
          removed.forEach((id) => next.delete(id));
          return next;
        });
      }, SLIDE_OUT_MS);
    }

    prevActiveRef.current = activeToasts;

    // Visible = active + currently leaving
    setVisibleIds([...new Set([...activeToasts, ...leavingIds, ...removed])]);
  }, [activeToasts, leavingIds]);

  // Manual dismiss: start exit animation then remove from store
  const handleDismiss = useCallback((id: string) => {
    setLeavingIds((s) => new Set(s).add(id));
    setTimeout(() => {
      dismissToast(id);
      setLeavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, SLIDE_OUT_MS);
  }, [dismissToast]);

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
