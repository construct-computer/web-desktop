import { useState, useRef, useCallback, useEffect, memo, useMemo } from 'react';
import {
  RefreshCw, Globe, X,
  Monitor, Lock, AlertTriangle,
  ChevronUp, ChevronDown, Square,
} from 'lucide-react';
import { useComputerStore, registerFrameRenderer, registerCanvasClear, getCachedFrameBlob } from '@/stores/agentStore';
import { browserWS } from '@/services/websocket';
import type { WindowConfig } from '@/types';

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */

const SPECIAL_KEYS = new Set([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Space',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

// (Tab stack removed — each tab is now its own window)

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */


/** Extract just the domain for unfocused address bar display */
function displayDomain(url: string): string {
  if (!url || url.startsWith('data:') || url === 'about:blank') return '';
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

/** Determine security indicator for the address bar */
function getSecurityInfo(url: string): { type: 'secure' | 'insecure' | 'internal' | 'none'; label?: string } {
  if (!url || url.startsWith('data:') || url === 'about:blank') return { type: 'internal' };
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return { type: 'secure' };
    if (u.protocol === 'http:') return { type: 'insecure', label: 'Not secure' };
    return { type: 'internal' };
  } catch {
    return { type: 'none' };
  }
}

// Tab component removed — each browser tab is now its own independent window.

/* ═══════════════════════════════════════════════════════════════════════════
   Progress Bar — simulated loading progress
   ═══════════════════════════════════════════════════════════════════════════ */

const ProgressBar = memo(function ProgressBar({ isLoading }: { isLoading: boolean }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      setVisible(true);
      setProgress(0);
      // Simulated progress curve
      const steps = [
        { delay: 100, value: 15 },    // DNS/connect — fast jump
        { delay: 500, value: 30 },     // downloading
        { delay: 1500, value: 50 },    // rendering
        { delay: 3000, value: 70 },    // slow crawl
        { delay: 5000, value: 85 },    // almost there...
        { delay: 8000, value: 92 },    // stalls
      ];
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (const step of steps) {
        timers.push(setTimeout(() => setProgress(step.value), step.delay));
      }
      return () => { timers.forEach(clearTimeout); };
    } else if (visible) {
      // Snap to 100%, then fade out
      setProgress(100);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <div className="absolute top-0 left-0 right-0 h-[2px] z-30 bg-transparent overflow-hidden">
      <div
        className="h-full bg-[var(--color-accent)] transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   FindBar — Ctrl+F in-page search
   ═══════════════════════════════════════════════════════════════════════════ */

const FindBar = memo(function FindBar({
  onClose,
  sendAction,
}: {
  onClose: () => void;
  sendAction: (action: Record<string, unknown>) => void;
}) {
  const [query, setQuery] = useState('');
  const [matchCount] = useState(0);
  const [activeMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') {
      // Next match — send to backend (best-effort)
      if (query) {
        sendAction({ action: 'keypress', key: e.shiftKey ? 'Shift+F3' : 'F3' });
      }
    }
  }, [onClose, query]);

  // Send Ctrl+F to the backend browser with the search text
  useEffect(() => {
    if (query.length > 0) {
      const debounce = setTimeout(() => {
        // Use Ctrl+F in the headless browser, then type the query
        sendAction({ action: 'keypress', key: 'Control+f' });
        // Small delay then type the query
        setTimeout(() => {
          sendAction({ action: 'type', text: query });
        }, 100);
      }, 300);
      return () => clearTimeout(debounce);
    }
  }, [query, sendAction]);

  return (
    <div className="absolute top-0 right-4 z-40 flex items-center gap-1.5 px-2 py-1.5
                    bg-[var(--color-toolbar)] backdrop-blur-md border border-[var(--color-border)]
                    rounded-b-md shadow-md"
         onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        className="w-full max-w-[200px] min-w-0 h-[24px] px-2 text-[12px] bg-[var(--color-surface)] border border-[var(--color-border)]
                   rounded-[var(--radius-input)] outline-none text-[var(--color-text)]
                   placeholder:text-[var(--color-text-subtle)]
                   focus:border-[var(--color-accent)]/60"
        placeholder="Find in page..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      <span className="text-[10px] text-[var(--color-text-muted)] w-[50px] text-center tabular-nums">
        {query ? `${activeMatch}/${matchCount}` : ''}
      </span>
      <button
        className="p-0.5 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)]"
        onClick={() => sendAction({ action: 'keypress', key: 'Shift+F3' })}
        title="Previous match"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button
        className="p-0.5 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)]"
        onClick={() => sendAction({ action: 'keypress', key: 'F3' })}
        title="Next match"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <button
        className="p-0.5 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)]"
        onClick={onClose}
        title="Close (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   Context Menu — viewport right-click
   ═══════════════════════════════════════════════════════════════════════════ */

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onNewTab: () => void;
  currentUrl: string;
}

const ContextMenu = memo(function ContextMenu({
  x, y, onClose, onBack, onForward, onRefresh, onNewTab, currentUrl,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const menuItems = [
    { label: 'Back', action: onBack, shortcut: 'Alt+\u2190' },
    { label: 'Forward', action: onForward, shortcut: 'Alt+\u2192' },
    { label: 'Reload', action: onRefresh, shortcut: 'Ctrl+R' },
    null, // separator
    { label: 'Open in new tab', action: onNewTab },
    {
      label: 'Copy page URL', action: () => {
        if (currentUrl) navigator.clipboard.writeText(currentUrl);
      }
    },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute z-50 min-w-[180px] py-1 bg-[var(--color-surface-raised)] border border-[var(--color-border)]
                 rounded-md shadow-lg backdrop-blur-sm"
      style={{ left: x, top: y }}
    >
      {menuItems.map((item, i) =>
        item === null ? (
          <div key={i} className="h-px my-1 mx-2 bg-[var(--color-border)]" />
        ) : (
          <button
            key={i}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-[var(--color-text)]
                       hover:bg-[var(--color-accent-muted)] transition-colors text-left"
            onClick={() => { item.action(); onClose(); }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-[var(--color-text-subtle)] ml-4">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   Error Page — rendered locally for known error conditions
   ═══════════════════════════════════════════════════════════════════════════ */

const ErrorPage = memo(function ErrorPage({
  error, url, onReload,
}: {
  error: { code: string; description: string };
  url: string;
  onReload: () => void;
}) {
  let domain = '';
  try { domain = new URL(url).hostname; } catch { domain = url; }

  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)]">
      <div className="text-center max-w-[400px] px-6">
        <div className="text-4xl mb-4 opacity-30">
          {error.code.includes('SSL') ? (
            <AlertTriangle className="w-16 h-16 mx-auto text-[var(--color-error)]" />
          ) : (
            <Globe className="w-16 h-16 mx-auto text-[var(--color-text-subtle)]" />
          )}
        </div>
        <h2 className="text-[15px] font-semibold text-[var(--color-text)] mb-2">
          {error.code.includes('SSL') ? 'Your connection is not private' : "This site can't be reached"}
        </h2>
        <p className="text-[12px] text-[var(--color-text-muted)] mb-1">
          {error.description || `${domain} took too long to respond.`}
        </p>
        <p className="text-[11px] text-[var(--color-text-subtle)] font-mono mb-4">
          {error.code}
        </p>
        <button
          className="px-4 py-1.5 text-[12px] rounded-[var(--radius-button)]
                     bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]
                     transition-colors"
          onClick={onReload}
        >
          Reload
        </button>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   Main BrowserWindow
   ═══════════════════════════════════════════════════════════════════════════ */

interface BrowserWindowProps { config: WindowConfig; }

export function BrowserWindow({ config }: BrowserWindowProps) {
  const windowId = config.id;

  /* ── Window metadata ────────────────────────────────────────────────────── */
  const daemonTabId = config.metadata?.daemonTabId as string | null;
  const subagentId = config.metadata?.subagentId as string | null;
  const browserSubagentId = config.metadata?.browserSubagentId as string | null;
  const isAgentBrowserWindow = !!browserSubagentId;

  /** Send a browser action targeted at THIS window's daemon tab. */
  const sendTabAction = useCallback((action: Record<string, unknown>) => {
    browserWS.sendAction(daemonTabId ? { ...action, tabId: daemonTabId } : action);
  }, [daemonTabId]);

  /* ── Store selectors ────────────────────────────────────────────────────── */
  const computer      = useComputerStore((s) => s.computer);
  const connected     = useComputerStore((s) => s.browserState.connected);
  // isLoading is global but we scope it: only show loading for THIS window's tab
  // (or when this window is the daemon's active tab, since loading is triggered
  // by navigating the active tab).
  const isLoading     = useComputerStore((s) => {
    if (!s.browserState.isLoading) return false;
    if (!daemonTabId) return false;
    // Show loading only when this tab is the active one being navigated
    return s.browserState.daemonActiveTabId === daemonTabId;
  });
  // Per-window screenshot flag: check if THIS window's daemon tab has received
  // at least one frame, rather than the global flag (which would make new windows
  // skip the placeholder and show a blank canvas).
  const hasScreenshot = useComputerStore((s) => {
    if (daemonTabId && s.browserState.tabsWithFrames[daemonTabId]) return true;
    // Subagent frames may be cached under subagentId (agent screenshots arrive
    // before daemon tab broadcast, so tabsWithFrames uses subagentId as key).
    if (subagentId && s.browserState.tabsWithFrames[subagentId]) return true;
    // Web Agent subagent windows
    if (browserSubagentId && s.browserState.tabsWithFrames[browserSubagentId]) return true;
    // Fallback to global flag for unassigned windows
    return !!s.browserState.screenshot;
  });
  const browserStreams = useComputerStore((s) => s.browserState.browserStreams);
  const closeBrowserWindow = useComputerStore((s) => s.closeBrowserWindow);
  const isRunning     = computer?.status === 'running';

  const browserRunPhase = (config.metadata?.browserRunPhase as 'live' | 'complete' | 'error' | undefined) ?? 'live';
  const browserRunErrorDetail = (config.metadata?.browserRunErrorDetail as string) || '';

  // Get URL/title from daemon tabs for this window's tab.
  const url = useComputerStore((s) => {
    if (!daemonTabId) return '';
    return s.browserState.tabs.find(t => t.id === daemonTabId)?.url || '';
  });
  const pageTitle = useComputerStore((s) => {
    if (!daemonTabId) return '';
    return s.browserState.tabs.find(t => t.id === daemonTabId)?.title || '';
  });

  /* ── Stream detection ─────────────────────────────────────────────────── */
  const activeBrowserUrl: string | null = isAgentBrowserWindow
    ? (browserStreams[browserSubagentId!] || (config.metadata?.browserStreamUrl as string) || null)
    : null;
  const showingBrowser = !!activeBrowserUrl;
  const anyAgentBrowserActive = isAgentBrowserWindow;


  /* ── FindBar state ──────────────────────────────────────────────────────── */
  const [findBarOpen, setFindBarOpen] = useState(false);

  /* ── Context menu state ─────────────────────────────────────────────────── */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  /* ── Error state ────────────────────────────────────────────────────────── */
  const [pageError, setPageError] = useState<{ code: string; description: string } | null>(null);

  // Clear error when URL changes
  useEffect(() => { setPageError(null); }, [url]);

  /* ── FPS counter ────────────────────────────────────────────────────────── */
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => { setFps(frameCountRef.current); frameCountRef.current = 0; }, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Loading phase text ─────────────────────────────────────────────────── */
  const loadingPhase = useMemo(() => {
    if (!isLoading) return '';
    return 'Loading...';
  }, [isLoading]);

  /* ── Live iframe health & auto-reconnect ────────────────────────────── */
  // Reconnect strategy: on iframe error, wait with exponential backoff and
  // force-remount the iframe by bumping `reloadKey`. After MAX_ATTEMPTS failed
  // retries, surface the dead state so the user sees the "results will appear
  // in chat" fallback AND a manual "Reconnect" button. Resets whenever a new
  // streaming URL arrives (agent moved to a new Browser run).
  const MAX_RECONNECT_ATTEMPTS = 6;
  const RECONNECT_BACKOFF_MS = [1500, 3000, 6000, 12000, 20000, 30000];
  const [iframeDead, setIframeDead] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadAttempts = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // New streaming URL (new Browser run) — reset everything.
    reloadAttempts.current = 0;
    setIframeDead(false);
    setReloadKey(0);
    if (reloadTimerRef.current !== null) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, [activeBrowserUrl]);

  useEffect(() => () => {
    // Unmount: clear any pending reconnect timer.
    if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reloadAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      setIframeDead(true);
      return;
    }
    const delay = RECONNECT_BACKOFF_MS[reloadAttempts.current] ?? RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1];
    reloadAttempts.current += 1;
    if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      setReloadKey((k) => k + 1);
    }, delay);
  }, []);

  const onIframeLoad = useCallback(() => {
    // Successful load after retries → reset the counter so subsequent errors
    // get a fresh backoff sequence rather than jumping straight to "dead".
    if (reloadAttempts.current > 0) reloadAttempts.current = 0;
  }, []);

  const onIframeError = useCallback(() => {
    scheduleReconnect();
  }, [scheduleReconnect]);

  const onManualReconnect = useCallback(() => {
    reloadAttempts.current = 0;
    setIframeDead(false);
    if (reloadTimerRef.current !== null) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    setReloadKey((k) => k + 1);
  }, []);

  /* ── Canvas + viewport refs ─────────────────────────────────────────────── */
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollAccum = useRef(0);
  const scrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Per-window canvas frame renderer (bypasses React) ───────────────────── */
  useEffect(() => {
    const renderer = async (blob: Blob) => {
      frameCountRef.current++;
      try {
        const bitmap = await createImageBitmap(blob);
        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(bitmap, 0, 0);
        }
        bitmap.close();
      } catch { /* invalid blob */ }
    };
    registerFrameRenderer(windowId, renderer);
    registerCanvasClear(windowId, () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // On mount, render cached blob for instant display (if we have one).
    // Check both daemonTabId and subagentId because agent screenshots arrive
    // before the daemon tab broadcast — they're cached under subagentId.
    const cached = (daemonTabId && getCachedFrameBlob(daemonTabId))
      || (subagentId && getCachedFrameBlob(subagentId));
    if (cached) renderer(cached);

    return () => {
      registerFrameRenderer(windowId, null);
      registerCanvasClear(windowId, null);
    };
  }, [windowId, daemonTabId, subagentId]);

  /* ── Focus handler: switch daemon to this window's tab ───────────────────── */
  const focusingRef = useRef(false);
  const onWindowFocus = useCallback(() => {
    if (daemonTabId && !focusingRef.current) {
      focusingRef.current = true;
      useComputerStore.getState().focusBrowserWindow(windowId);
      // Reset guard after a short timeout to allow future focus events.
      // Using setTimeout (not queueMicrotask) ensures the guard survives
      // through any synchronous React re-render cascade.
      setTimeout(() => { focusingRef.current = false; }, 100);
    }
  }, [daemonTabId, windowId]);

  /* ── Map screen coordinates to viewport pixel coordinates ───────────────── */
  const mapCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return null;
    const rect = canvas.getBoundingClientRect();
    const displayAspect = rect.width / rect.height;
    const imageAspect = canvas.width / canvas.height;
    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (displayAspect > imageAspect) {
      renderH = rect.height;
      renderW = renderH * imageAspect;
      offsetX = (rect.width - renderW) / 2;
      offsetY = 0;
    } else {
      renderW = rect.width;
      renderH = renderW / imageAspect;
      offsetX = 0;
      offsetY = (rect.height - renderH) / 2;
    }
    const relX = clientX - rect.left - offsetX;
    const relY = clientY - rect.top - offsetY;
    if (relX < 0 || relY < 0 || relX > renderW || relY > renderH) return null;
    return {
      x: Math.round((relX / renderW) * canvas.width),
      y: Math.round((relY / renderH) * canvas.height),
    };
  }, []);

  /* ── Click ripple visual feedback ───────────────────────────────────────── */
  const showRipple = useCallback((clientX: number, clientY: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ripple = document.createElement('div');
    ripple.className = 'viewport-click-ripple';
    ripple.style.left = `${clientX - r.left}px`;
    ripple.style.top = `${clientY - r.top}px`;
    el.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }, []);

  /* ── Viewport event handlers (with click + drag support) ────────────────── */

  // Track drag state: when the user presses down we send mousedown immediately,
  // and on mouseup we send mouseup.  If the mouse barely moved (<5px) we also
  // fire a ripple effect so it still *feels* like a click.
  const dragState = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const DRAG_THRESHOLD = 5; // px — below this, treat as a plain click

  const onViewportMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left button
    if (contextMenu) { setContextMenu(null); return; }
    const c = mapCoords(e.clientX, e.clientY);
    if (!c) return;
    dragState.current = { x: e.clientX, y: e.clientY, dragging: false };
    sendTabAction({ action: 'mousedown', x: c.x, y: c.y });
    viewportRef.current?.focus();
  }, [mapCoords, contextMenu]);

  const onViewportMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const c = mapCoords(e.clientX, e.clientY);
    if (!c) return;
    const ds = dragState.current;
    sendTabAction({ action: 'mouseup', x: c.x, y: c.y });
    // Show ripple only for click-like interactions (no significant drag)
    if (ds && !ds.dragging) {
      showRipple(e.clientX, e.clientY);
    }
    dragState.current = null;
  }, [mapCoords, showRipple]);

  const onViewportDblClick = useCallback((e: React.MouseEvent) => {
    const c = mapCoords(e.clientX, e.clientY);
    if (c) sendTabAction({ action: 'doubleclick', x: c.x, y: c.y });
  }, [mapCoords]);

  // Mousemove: throttled so we don't flood the WS — container debounces further
  const lastMouseMove = useRef(0);
  const onViewportMouseMove = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastMouseMove.current < 50) return; // ~20fps max
    lastMouseMove.current = now;
    const c = mapCoords(e.clientX, e.clientY);
    if (!c) return;
    // Detect drag threshold
    const ds = dragState.current;
    if (ds && !ds.dragging) {
      const dx = e.clientX - ds.x;
      const dy = e.clientY - ds.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        ds.dragging = true;
      }
    }
    sendTabAction({ action: 'mousemove', x: c.x, y: c.y });
  }, [mapCoords]);

  const onViewportContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setContextMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  // Global mouseup: if the user drags outside the viewport and releases,
  // we still need to send mouseup so the remote browser doesn't stay stuck.
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 || !dragState.current) return;
      const c = mapCoords(e.clientX, e.clientY);
      if (!c) {
        // Manually clamp coordinates if `mapCoords` returns null for out-of-bounds
        const el = canvasRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const cx = Math.max(rect.left, Math.min(e.clientX, rect.right));
          const cy = Math.max(rect.top, Math.min(e.clientY, rect.bottom));
          const edgeC = mapCoords(cx, cy);
          if (edgeC) {
            sendTabAction({ action: 'mouseup', x: edgeC.x, y: edgeC.y });
          }
        }
      } else {
        sendTabAction({ action: 'mouseup', x: c.x, y: c.y });
      }
      dragState.current = null;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [mapCoords, sendTabAction]);

  // Scroll: accumulate wheel deltas, flush every 100ms to avoid flooding
  const viewportVisible = !showingBrowser && hasScreenshot;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const flush = () => {
      const delta = Math.round(scrollAccum.current);
      scrollAccum.current = 0;
      if (delta !== 0) {
        sendTabAction({ action: 'scroll', deltaY: delta });
      } else if (scrollTimer.current) {
        clearInterval(scrollTimer.current);
        scrollTimer.current = null;
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollAccum.current += e.deltaY;
      if (!scrollTimer.current) scrollTimer.current = setInterval(flush, 100);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (scrollTimer.current) { clearInterval(scrollTimer.current); scrollTimer.current = null; }
    };
  }, [viewportVisible, sendTabAction]);

  /* ── Keyboard handler for viewport ──────────────────────────────────────── */
  const onViewportKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Escape blurs viewport
    if (e.key === 'Escape') {
      if (findBarOpen) { setFindBarOpen(false); return; }
      viewportRef.current?.blur();
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    // Modifier combos (Ctrl+C, Cmd+A, etc.)
    if (e.ctrlKey || e.metaKey) {
      let combo = '';
      if (e.ctrlKey) combo += 'Control+';
      if (e.shiftKey) combo += 'Shift+';
      if (e.altKey) combo += 'Alt+';
      combo += e.key.length === 1 ? e.key.toLowerCase() : e.key;
      sendTabAction({ action: 'keypress', key: combo });
      return;
    }

    // Special keys (Enter, Tab, arrows, etc.)
    if (SPECIAL_KEYS.has(e.key)) {
      let key = e.key;
      if (e.shiftKey) key = `Shift+${key}`;
      if (e.altKey) key = `Alt+${key}`;
      sendTabAction({ action: 'keypress', key });
    }
    // Printable character
    else if (e.key.length === 1) {
      sendTabAction({ action: 'type', text: e.key });
    }
  }, [findBarOpen, sendTabAction]);

  /* ── Chrome bar actions ─────────────────────────────────────────────────── */
  const goBack    = useCallback(() => sendTabAction({ action: 'back' }), [sendTabAction]);
  const goForward = useCallback(() => sendTabAction({ action: 'forward' }), [sendTabAction]);
  const refresh   = useCallback(() => {
    if (isLoading) {
      // Stop loading — send Escape to the headless browser
      sendTabAction({ action: 'keypress', key: 'Escape' });
    } else {
      sendTabAction({ action: 'refresh' });
    }
  }, [isLoading, sendTabAction]);

  /* ── Close this browser window ─────────────────────────────────────────── */
  const handleClose = useCallback(() => {
    closeBrowserWindow(windowId);
  }, [windowId, closeBrowserWindow]);

  /* ── Browser-level keyboard shortcuts (on the whole window container) ──── */
  const onBrowserKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl+W — close this browser window
    if (ctrl && e.key === 'w') {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
      return;
    }

    // Escape — close find bar, stop loading
    if (e.key === 'Escape') {
      if (findBarOpen) { setFindBarOpen(false); e.preventDefault(); return; }
      if (isLoading) {
        sendTabAction({ action: 'keypress', key: 'Escape' });
        e.preventDefault();
        return;
      }
    }
  }, [handleClose, findBarOpen, isLoading, sendTabAction]);

  /* ── Security info for address bar ──────────────────────────────────────── */
  const security = useMemo(() => getSecurityInfo(url), [url]);
  const unfocusedDisplay = useMemo(() => displayDomain(url), [url]);

  // This window is "active" if it has a daemon tab, is a Browser window,
  // or is a shell browser window (user-opened, daemon tab pending assignment).
  // Shell windows should still allow URL bar editing so the user isn't stuck
  // staring at a disabled input while waiting for the daemon to connect.
  const isShellWindow = !daemonTabId && !isAgentBrowserWindow && config.type === 'browser';
  const hasContent = !!daemonTabId || isAgentBrowserWindow || isShellWindow;

  /* ═══════════════════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════════════════ */

  // Default state — no local browser; the agent uses a remote browser (Web Agent)
  if ((!isRunning || !connected) && !isAgentBrowserWindow) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-surface)] overflow-hidden">
        <ChromeBar />
        <div className="flex-1 flex items-center justify-center bg-black/90">
          <div className="text-center px-8 max-w-md">
            <Globe className="w-10 h-10 mx-auto mb-3 text-[var(--color-text-subtle)] opacity-40" />
            <p className="text-sm text-[var(--color-text-subtle)] mb-1">
              Remote browser
            </p>
            <p className="text-xs text-[var(--color-text-subtle)] opacity-60">
              Your agent will use this browser to search the web and visit pages. Ask it to look something up!
            </p>
          </div>
        </div>
        <StatusBar connected={false} fps={0} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-[var(--color-surface)] overflow-hidden outline-none"
      tabIndex={-1}
      onKeyDown={onBrowserKeyDown}
      onFocus={onWindowFocus}
    >
      {/* ── Address bar (read-only, agent-controlled) — hidden for Browser windows ── */}
      {!isAgentBrowserWindow && (
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-[var(--color-toolbar)] backdrop-blur-md border-b border-[var(--color-border)]">
        <div
          className="flex-1 min-w-0 flex items-center gap-1.5 h-[28px] px-2 text-[12px] font-mono
                     rounded-md shadow-inner cursor-default
                     bg-[var(--color-surface)] border border-[var(--color-border)]"
        >
          {hasContent && url ? (
            <>
              {security.type === 'secure' ? (
                <Lock className="w-3 h-3 text-[var(--color-text-subtle)] shrink-0" />
              ) : security.type === 'insecure' ? (
                <AlertTriangle className="w-3 h-3 text-[var(--color-warning)] shrink-0" />
              ) : (
                <Globe className="w-3 h-3 text-[var(--color-text-subtle)] shrink-0" />
              )}
              <span className="truncate text-[var(--color-text-muted)] flex-1">
                {unfocusedDisplay || url}
              </span>
            </>
          ) : (
            <>
              <Globe className="w-3 h-3 text-[var(--color-text-subtle)] shrink-0" />
              <span className="truncate text-[var(--color-text-subtle)] flex-1">
                Agent-controlled browser
              </span>
            </>
          )}
        </div>
      </div>
      )}

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden relative flex items-center justify-center"
           style={{ background: '#0a0a0a' }}>

        {/* Progress bar */}
        <ProgressBar isLoading={isLoading} />

        {/* Find bar */}
        {findBarOpen && (
          <FindBar onClose={() => setFindBarOpen(false)} sendAction={sendTabAction} />
        )}

        {showingBrowser && (
          <BrowserOverlay
            streamUrl={activeBrowserUrl!}
            runPhase={browserRunPhase}
            runErrorDetail={browserRunErrorDetail}
            isDead={iframeDead}
            reloadKey={reloadKey}
            onLoad={onIframeLoad}
            onError={onIframeError}
            onManualReconnect={onManualReconnect}
          />
        )}

        {/* Error page */}
        {pageError && !hasScreenshot && !showingBrowser ? (
          <ErrorPage error={pageError} url={url} onReload={refresh} />
        ) : null}

        {!showingBrowser && hasScreenshot && !pageError && hasContent ? (
          <div
            ref={viewportRef}
            className="w-full h-full relative outline-none"
            style={{ cursor: 'default' }}
            tabIndex={0}
            onMouseDown={onViewportMouseDown}
            onMouseUp={onViewportMouseUp}
            onDoubleClick={onViewportDblClick}
            onMouseMove={onViewportMouseMove}
            onContextMenu={onViewportContextMenu}
            onKeyDown={onViewportKeyDown}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain pointer-events-none select-none"
            />
            {/* Context menu overlay */}
            {contextMenu && (
              <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
                onBack={goBack}
                onForward={goForward}
                onRefresh={refresh}
                onNewTab={() => {
                  useComputerStore.getState().openBrowserWindow(url);
                }}
                currentUrl={url}
              />
            )}
          </div>
        ) : !showingBrowser && !pageError ? (
          <div className="flex flex-col items-center gap-2 text-[var(--color-text-subtle)] max-w-sm text-center px-4">
            <Globe className="w-10 h-10 opacity-20" />
            <p className="text-xs">
              {isLoading
                ? loadingPhase
                : isAgentBrowserWindow
                  ? 'Waiting for live preview from Browser Use…'
                  : 'Your agent will browse here when needed'}
            </p>
            {isAgentBrowserWindow && !isLoading && (
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-80 leading-relaxed">
                If this stays blank, the session URL was missing or blocked. Check that Browser Use is configured and
                watch the activity log for errors.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Status bar (hidden for Browser windows) ──── */}
      {!isAgentBrowserWindow && (
      <StatusBar
        connected={connected}
        fps={fps}
        pageTitle={pageTitle}
        isLoading={isLoading}
        agentBrowserActive={anyAgentBrowserActive}
        loadingPhase={loadingPhase}
      />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Chrome bar (disabled state for disconnected)
   ═══════════════════════════════════════════════════════════════════════════ */

function ChromeBar() {
  return (
    <div className="shrink-0 pointer-events-none opacity-50">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-toolbar)] backdrop-blur-md border-b border-[var(--color-border)]">
        <div className="flex-1 h-[28px] px-2.5 flex items-center text-[12px] font-mono rounded-md shadow-inner
                        bg-[var(--color-surface)] border border-[var(--color-border)]">
          <Globe className="w-3 h-3 text-[var(--color-text-subtle)] mr-2" />
          <span className="text-[var(--color-text-subtle)]">Agent-controlled browser</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Browser overlay
   ═══════════════════════════════════════════════════════════════════════════ */

const BrowserOverlay = memo(function BrowserOverlay({
  streamUrl, runPhase, runErrorDetail, isDead, reloadKey, onLoad, onError, onManualReconnect,
}: {
  streamUrl: string;
  runPhase: 'live' | 'complete' | 'error';
  runErrorDetail: string;
  isDead: boolean;
  reloadKey: number;
  onLoad: () => void;
  onError: () => void;
  onManualReconnect: () => void;
}) {
  const isLive = runPhase === 'live';
  const isComplete = runPhase === 'complete';
  const isErr = runPhase === 'error';

  const headerLabel = isErr
    ? `Run failed${runErrorDetail ? `: ${runErrorDetail.slice(0, 140)}${runErrorDetail.length > 140 ? '…' : ''}` : ''}`
    : isComplete
      ? 'Run finished — preview may freeze when the host ends the session. Close this window when you are done.'
      : reloadKey > 0 && !isDead
        ? `Live preview (reconnecting, attempt ${reloadKey})`
        : 'Live preview — agent is controlling the browser';

  const barClass = isErr
    ? 'bg-[var(--color-error)]/10 text-[var(--color-error)] border-[var(--color-error)]/25'
    : isComplete
      ? 'bg-[var(--color-success-muted)] text-[var(--color-success)] border-[var(--color-success)]/20'
      : 'bg-[var(--color-warning-muted)] text-[var(--color-warning)] border-[var(--color-border)]';

  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <div className={`shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs border-b ${barClass}`}>
        {isLive && !isDead ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-warning)]" />
          </span>
        ) : (
          <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
        )}
        <span className="min-w-0 leading-snug">{headerLabel}</span>
      </div>
      {isDead ? (
        <div className="flex-1 flex items-center justify-center bg-[var(--color-surface)]">
          <div className="text-center text-[var(--color-text-muted)]">
            <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Agent browser is working in the background</p>
            <p className="text-xs mt-1 text-[var(--color-text-subtle)]">
              Live preview disconnected — results will appear in chat
            </p>
            <button
              type="button"
              onClick={onManualReconnect}
              className="mt-4 px-3 py-1.5 text-xs rounded border border-[var(--color-border)]
                         bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface)]
                         text-[var(--color-text)] transition-colors"
            >
              Reconnect live preview
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative">
          <iframe
            // reloadKey bump forces iframe re-mount to re-establish the stream.
            key={reloadKey}
            src={streamUrl}
            className="absolute inset-0 w-full h-full border-none bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="clipboard-read; clipboard-write"
            title="Agent Live Browser Stream"
            onLoad={onLoad}
            onError={onError}
          />
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   Status bar
   ═══════════════════════════════════════════════════════════════════════════ */

const StatusBar = memo(function StatusBar({
  connected, fps, pageTitle, isLoading, agentBrowserActive, loadingPhase,
}: {
  connected: boolean; fps: number;
  pageTitle?: string; isLoading?: boolean; agentBrowserActive?: boolean;
  loadingPhase?: string;
}) {
  return (
    <div className="shrink-0 flex items-center justify-between h-[22px] px-2 text-[10px]
                    border-t border-[var(--color-border)] bg-[var(--color-surface-raised)]
                    text-[var(--color-text-muted)]">
      <span className="truncate mr-4">
        {isLoading ? (loadingPhase || 'Loading...') : pageTitle || ''}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {agentBrowserActive && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium
                           bg-[var(--color-warning-muted)] text-[var(--color-warning)]
                           border border-[var(--color-warning)]/25">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--color-warning)]" />
            </span>
            Web Agent
          </span>
        )}
        <span
          className={`w-[5px] h-[5px] rounded-full ${connected ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
        <span className="tabular-nums text-[var(--color-text-subtle)] w-[18px] text-right">{fps}</span>
      </div>
    </div>
  );
});
