/**
 * Error store — captures all errors across the app for debugging.
 *
 * Sources:
 *   - WS 'error' events from the backend
 *   - API response errors
 *   - React error boundary catches
 *   - Uncaught exceptions / unhandled rejections
 *
 * All errors are stored with full detail and accessible from the debug panel.
 */

import { create } from 'zustand';

export interface CapturedError {
  id: string;
  timestamp: Date;
  source: string;        // 'ws', 'api', 'react', 'uncaught', 'manual'
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  /** Error ID from the backend (for correlation with server logs). */
  errorId?: string;
}

interface ErrorStore {
  /** Recent errors, newest first. */
  errors: CapturedError[];
  /** Whether the debug panel is open. */
  panelOpen: boolean;
  /** Unread error count (since panel was last opened). */
  unreadCount: number;

  /** Capture an error. */
  capture: (entry: Omit<CapturedError, 'id' | 'timestamp'>) => void;
  /** Toggle the debug panel. */
  togglePanel: () => void;
  /** Clear all errors. */
  clearAll: () => void;
  /** Copy all errors to clipboard as text. */
  copyAll: () => void;
  /** Copy a single error to clipboard. */
  copyError: (id: string) => void;
}

const MAX_ERRORS = 200;

export const useErrorStore = create<ErrorStore>((set, get) => ({
  errors: [],
  panelOpen: false,
  unreadCount: 0,

  capture: (entry) => {
    const error: CapturedError = {
      ...entry,
      id: crypto.randomUUID().slice(0, 8),
      timestamp: new Date(),
    };

    // Also log to console for devtools
    console.error(`[${error.source}] ${error.message}`, error.context || '', error.stack || '');

    set((state) => ({
      errors: [error, ...state.errors].slice(0, MAX_ERRORS),
      unreadCount: state.panelOpen ? 0 : state.unreadCount + 1,
    }));
  },

  togglePanel: () => {
    set((state) => ({
      panelOpen: !state.panelOpen,
      unreadCount: state.panelOpen ? state.unreadCount : 0,
    }));
  },

  clearAll: () => set({ errors: [], unreadCount: 0 }),

  copyAll: () => {
    const text = get().errors.map(formatError).join('\n---\n');
    navigator.clipboard.writeText(text).catch(() => {});
  },

  copyError: (id) => {
    const error = get().errors.find((e) => e.id === id);
    if (error) {
      navigator.clipboard.writeText(formatError(error)).catch(() => {});
    }
  },
}));

function formatError(e: CapturedError): string {
  const lines = [
    `[${e.source}] ${e.timestamp.toISOString()}`,
    `Message: ${e.message}`,
  ];
  if (e.errorId) lines.push(`Server ID: ${e.errorId}`);
  if (e.context) lines.push(`Context: ${JSON.stringify(e.context, null, 2)}`);
  if (e.stack) lines.push(`Stack:\n${e.stack}`);
  return lines.join('\n');
}

// ── Global error capturing ─────────────────────────────────────────────────

/** Call once at app startup to capture unhandled errors. */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    useErrorStore.getState().capture({
      source: 'uncaught',
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason;
    useErrorStore.getState().capture({
      source: 'uncaught',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context: { type: 'unhandledrejection' },
    });
  });
}
