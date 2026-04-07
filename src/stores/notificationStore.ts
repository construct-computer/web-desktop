import { create } from 'zustand';
import { NOTIFICATION_DEDUP_WINDOW_MS } from '@/lib/config';

export interface Notification {
  id: string;
  title: string;
  body?: string;
  source?: string;
  variant?: 'info' | 'success' | 'error';
  timestamp: number;
  read: boolean;
  /** Optional callback invoked when the toast banner or notification item is clicked. */
  onClick?: () => void;
}

let nextId = 0;

/**
 * Dedup guard: track recently seen notification fingerprints to prevent
 * duplicate notifications from replayed WebSocket events (e.g., on page
 * refresh or reconnect). The fingerprint is based on title + body + source.
 */
const recentFingerprints = new Set<string>();
const DEDUP_WINDOW_MS = NOTIFICATION_DEDUP_WINDOW_MS;

interface NotificationStore {
  /** All notifications (persisted in notification center). */
  notifications: Notification[];
  /** IDs currently visible as toast banners. */
  activeToasts: string[];
  /** Whether the notification center drawer is open. */
  drawerOpen: boolean;
  /** Active tab in the drawer: 'notifications' or 'agents'. */
  drawerTab: 'notifications' | 'agents';
  /** Open the drawer with a specific tab selected. */
  openDrawerTab: (tab: 'notifications' | 'agents') => void;

  /** Add a notification to history and show a toast banner. */
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>, toastDurationMs?: number) => string;
  /** Dismiss a toast banner (keeps notification in history). */
  dismissToast: (id: string) => void;
  /** Remove a single notification from history entirely. */
  removeNotification: (id: string) => void;
  /** Mark a single notification as read. */
  markRead: (id: string) => void;
  /** Mark all as read. */
  markAllRead: () => void;
  /** Clear all notifications from history. */
  clearAll: () => void;
  /** Toggle the notification center drawer. */
  toggleDrawer: () => void;
  /** Set drawer open state explicitly. */
  setDrawerOpen: (open: boolean) => void;

  /** Derived: unread count. */
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  activeToasts: [],
  drawerOpen: false,
  drawerTab: 'notifications',
  openDrawerTab: (tab) => set({ drawerOpen: true, drawerTab: tab }),

  addNotification: (n, toastDurationMs = 5000) => {
    // Dedup: skip if an identical notification was added in the last 10s.
    // This prevents duplicates from replayed WebSocket events on reconnect.
    const fingerprint = `${n.title}|${n.body || ''}|${n.source || ''}`;
    if (recentFingerprints.has(fingerprint)) {
      return ''; // Already shown recently — skip
    }
    recentFingerprints.add(fingerprint);
    setTimeout(() => recentFingerprints.delete(fingerprint), DEDUP_WINDOW_MS);

    const id = `notif-${nextId++}`;
    const notification: Notification = {
      ...n,
      id,
      timestamp: Date.now(),
      read: false,
    };
    set((s) => ({
      notifications: [notification, ...s.notifications],
      activeToasts: [id, ...s.activeToasts],
    }));
    if (toastDurationMs > 0) {
      setTimeout(() => {
        set((s) => ({ activeToasts: s.activeToasts.filter((t) => t !== id) }));
      }, toastDurationMs);
    }

    // Send a native browser notification when the tab is not active,
    // so the user sees the notification even if they've switched tabs.
    if (
      typeof document !== 'undefined' &&
      document.hidden &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        const browserNotif = new window.Notification(n.title, {
          body: n.body,
          tag: id, // deduplicate
        });
        // Focus the tab when the user clicks the browser notification
        browserNotif.onclick = () => {
          window.focus();
          browserNotif.close();
        };
      } catch {
        // Silently ignore — some environments block Notification constructor
      }
    }

    return id;
  },

  dismissToast: (id) => {
    set((s) => ({ activeToasts: s.activeToasts.filter((t) => t !== id) }));
  },

  removeNotification: (id) => {
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
      activeToasts: s.activeToasts.filter((t) => t !== id),
    }));
  },

  markRead: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    }));
  },

  markAllRead: () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  clearAll: () => {
    set({ notifications: [], activeToasts: [] });
  },

  toggleDrawer: () => {
    const opening = !get().drawerOpen;
    set({ drawerOpen: opening });
    // Mark all as read when opening
    if (opening) {
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
      }));
    }
  },

  setDrawerOpen: (open) => {
    set({ drawerOpen: open });
    if (open) {
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
      }));
    }
  },

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
