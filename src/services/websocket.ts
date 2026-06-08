import { STORAGE_KEYS } from '@/lib/constants';
import {
  API_BASE_URL,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  WS_RECONNECT_JITTER_MS,
  WS_KEEPALIVE_TIMEOUT_MS,
  WS_KEEPALIVE_PING_INTERVAL_MS,
} from '@/lib/config';
import { log } from '@/lib/logger';
import { reportWsDisconnect, reportWsReconnect } from '@/lib/observability';

const browserLog = log('BrowserWS');
const terminalLog = log('TerminalWS');
const agentLog = log('AgentWS');

type WsClientKind = 'agent' | 'browser' | 'terminal';

function logWsDisconnect(client: WsClientKind, code?: number, reason?: string): void {
  reportWsDisconnect({ client, code, reason });
}

function scheduleWsReconnect(
  client: WsClientKind,
  reconnectAttempts: number,
  onFire: () => void,
): { delayMs: number; attempt: number; timeout: ReturnType<typeof setTimeout> } {
  const delayMs = Math.min(
    WS_RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
    WS_RECONNECT_MAX_MS,
  ) + Math.random() * WS_RECONNECT_JITTER_MS;
  const attempt = reconnectAttempts + 1;
  const logFn = client === 'agent' ? agentLog : client === 'terminal' ? terminalLog : browserLog;
  logFn.warn(`Reconnecting in ${Math.round(delayMs)}ms (attempt ${attempt})`);
  reportWsReconnect({ client, attempt, delayMs: Math.round(delayMs) });
  const timeout = setTimeout(onFire, delayMs);
  return { delayMs, attempt, timeout };
}

export interface AgentFileAttachment {
  type: string;
  url: string;
  path?: string;
  mime?: string;
  kind?: 'workspace_file' | 'image';
  name?: string;
}

// Get WebSocket base URL
// Supports VITE_WS_BASE_URL override for Cloudflare Workers deployment
// where frontend (Pages) and backend (Worker) may be on different origins.
function getWsBaseUrl(): string {
  const override = import.meta.env.VITE_WS_BASE_URL;
  if (override) return override;

  if (/^https?:\/\//i.test(API_BASE_URL)) {
    const apiUrl = new URL(API_BASE_URL);
    return `${apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${apiUrl.host}`;
  }

  // Same-origin: Vite dev (5173) proxies /ws → worker (8787); deployed worker serves both.
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
}

/**
 * Browser WebSocket client - receives frame data from container:9222
 */
class BrowserWSClient {
  private ws: WebSocket | null = null;
  private instanceId: string | null = null;
  /** Receives image frames as Blobs, optionally tagged with a daemon tab ID. */
  private frameHandler: ((frame: Blob, tabId?: string) => void) | null = null;
  private messageHandler: ((msg: Record<string, unknown>) => void) | null = null;
  private connectionHandler: ((connected: boolean) => void) | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private pingResolve: ((rtt: number) => void) | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;

  connect(instanceId: string) {
    if (
      this.instanceId === instanceId
      && (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.disconnect();
    this.instanceId = instanceId;

    const token = localStorage.getItem(STORAGE_KEYS.token);
    const url = `${getWsBaseUrl()}/ws/browser/${instanceId}?token=${encodeURIComponent(token || '')}`;
    
    browserLog.info('Connecting to browser websocket', { instanceId });
    
    try {
      this.ws = new WebSocket(url);
      // Receive binary frames as Blob (zero-copy, no base64 conversion)
      this.ws.binaryType = 'blob';

      this.ws.onopen = () => {
        browserLog.info('Connected');
        this.reconnectAttempts = 0;
        this.lastMessageTime = Date.now();
        this.connectionHandler?.(true);
        // Request an initial frame + tabs so the UI isn't stale after reconnect
        this.sendAction({ action: 'getFrame' });
        this.sendAction({ action: 'getTabs' });
        // Start keepalive: ping every 30s, force reconnect if no message in 45s
        this.stopKeepalive();
        this.keepaliveInterval = setInterval(() => {
          if (Date.now() - this.lastMessageTime > WS_KEEPALIVE_TIMEOUT_MS) {
            browserLog.warn('No messages for 45s, forcing reconnect');
            this.ws?.close();
          } else {
            this.sendAction({ action: 'ping' });
          }
        }, WS_KEEPALIVE_PING_INTERVAL_MS);
      };

      this.ws.onmessage = (event) => {
        this.lastMessageTime = Date.now();

        // Binary messages are image frames — may be tagged with a tab ID.
        // Tagged format: [0x00][tabId UTF-8][0x0A newline][image bytes]
        // Untagged (legacy): raw PNG (0x89) or JPEG (0xFF) bytes.
        if (event.data instanceof Blob) {
          this.parseAndDispatchFrame(event.data);
          return;
        }

        // Text messages are JSON control messages (tabs, status, etc.)
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') {
            // Resolve latency ping if pending
            if (this.pingResolve && typeof msg.ts === 'number') {
              const rtt = Date.now() - msg.ts;
              this.pingResolve(rtt);
              this.pingResolve = null;
              if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
            }
            return;
          }
          this.messageHandler?.(msg);
        } catch (e) {
          browserLog.error('Failed to parse message', e);
        }
      };

      this.ws.onclose = (event) => {
        browserLog.info('Disconnected');
        this.connectionHandler?.(false);
        logWsDisconnect('browser', event.code, event.reason);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        browserLog.error('Error', error);
      };
    } catch (error) {
      browserLog.error('Failed to connect', error);
    }
  }

  private stopKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  disconnect() {
    this.stopKeepalive();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.instanceId = null;
  }

  /** Reset backoff and immediately attempt to reconnect. */
  forceReconnect() {
    if (!this.instanceId) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
    this.connect(this.instanceId);
  }

  private scheduleReconnect() {
    if (this.instanceId && !this.reconnectTimeout) {
      const scheduled = scheduleWsReconnect('browser', this.reconnectAttempts, () => {
        this.reconnectTimeout = null;
        if (this.instanceId) this.connect(this.instanceId);
      });
      this.reconnectAttempts = scheduled.attempt;
      this.reconnectTimeout = scheduled.timeout;
    }
  }

  sendAction(action: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(action));
    }
  }

  /** Parse a potentially tagged frame and dispatch to the handler.
   *  Tagged: [0x00][tabId UTF-8][0x0A newline][image bytes]
   *  Untagged: raw image bytes (first byte != 0x00). */
  private async parseAndDispatchFrame(blob: Blob) {
    if (!this.frameHandler) return;
    // Read the first byte to detect tag
    const header = new Uint8Array(await blob.slice(0, 1).arrayBuffer());
    if (header[0] === 0x00 && blob.size > 2) {
      // Tagged frame — find the newline delimiter (0x0A) in the first 64 bytes
      const scanSize = Math.min(blob.size, 64);
      const scanBytes = new Uint8Array(await blob.slice(0, scanSize).arrayBuffer());
      let nlIndex = -1;
      for (let i = 1; i < scanBytes.length; i++) {
        if (scanBytes[i] === 0x0A) { nlIndex = i; break; }
      }
      if (nlIndex > 1) {
        const tabIdBytes = scanBytes.slice(1, nlIndex);
        const tabId = new TextDecoder().decode(tabIdBytes);
        const imageBlob = blob.slice(nlIndex + 1);
        this.frameHandler(imageBlob, tabId);
        return;
      }
    }
    // Untagged (legacy) or parse failed — pass as-is with no tab ID
    this.frameHandler(blob);
  }

  onFrame(handler: (frame: Blob, tabId?: string) => void) {
    this.frameHandler = handler;
  }

  onMessage(handler: (msg: Record<string, unknown>) => void) {
    this.messageHandler = handler;
  }

  onConnection(handler: (connected: boolean) => void) {
    this.connectionHandler = handler;
  }

  /** Measure round-trip latency to the backend via this WS. Returns RTT in ms. */
  ping(timeoutMs = 5000): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }
      // Cancel any pending ping
      if (this.pingResolve) {
        this.pingResolve = null;
        if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
      }
      this.pingResolve = resolve;
      this.pingTimer = setTimeout(() => {
        this.pingResolve = null;
        this.pingTimer = null;
        reject(new Error('ping timeout'));
      }, timeoutMs);
      this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Terminal WebSocket client - bidirectional I/O with container shell.
 *
 * Protocol (JSON frames):
 *   server → client:  { type: "ready" }
 *                      { type: "output", data: "..." }
 *                      { type: "exit",   code: 0 }
 *                      { type: "error",  data: "..." }
 *   client → server:  { type: "input",  data: "..." }
 */
export class TerminalWSClient {
  private ws: WebSocket | null = null;
  private instanceId: string | null = null;
  private terminalId: string | null = null;
  private outputHandler: ((data: string) => void) | null = null;
  private scrollbackHandler: ((data: string) => void) | null = null;
  private connectionHandler: ((connected: boolean) => void) | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  /**
   * @param terminalId - Optional terminal session identifier. 'main' (default)
   *   shares the tmux session with the agent's exec tool. Other values create
   *   independent tmux sessions inside the container.
   */
  connect(instanceId: string, terminalId?: string) {
    const tid = terminalId || 'main';
    // Already connected to this instance+terminal
    if (
      this.instanceId === instanceId
      && this.terminalId === tid
      && (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.disconnect();
    this.instanceId = instanceId;
    this.terminalId = tid;

    const token = localStorage.getItem(STORAGE_KEYS.token);
    const termParam = tid !== 'main' ? `&terminalId=${encodeURIComponent(tid)}` : '';
    const url = `${getWsBaseUrl()}/ws/terminal/${instanceId}?token=${encodeURIComponent(token || '')}${termParam}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        terminalLog.info('Connected');
        this.reconnectAttempts = 0;
        this.connectionHandler?.(true);
      };

      this.ws.onmessage = (event) => {
        const raw = event.data;

        // Handle binary data (raw PTY output from sandbox)
        if (raw instanceof ArrayBuffer || raw instanceof Blob) {
          if (raw instanceof Blob) {
            raw.text().then((text) => this.outputHandler?.(text));
          } else {
            this.outputHandler?.(new TextDecoder().decode(raw));
          }
          return;
        }

        // Try JSON protocol first (legacy or structured messages)
        try {
          const msg = JSON.parse(raw) as Record<string, unknown>;

          switch (msg.type) {
            case 'output':
              if (typeof msg.data === 'string') {
                this.outputHandler?.(msg.data);
              }
              break;
            case 'scrollback':
              if (typeof msg.data === 'string') {
                // tmux capture-pane -p uses \n line endings; xterm with
                // convertEol:false needs \r\n to avoid staircase rendering.
                const normalized = msg.data.replace(/\r?\n/g, '\r\n');
                if (this.scrollbackHandler) {
                  this.scrollbackHandler(normalized);
                } else {
                  this.outputHandler?.(normalized);
                }
              }
              break;
            case 'ready':
              terminalLog.info('Shell ready');
              break;
            case 'exit':
              terminalLog.info('Shell exited', msg.code);
              break;
            case 'error':
              terminalLog.error('Shell error:', msg.data);
              break;
          }
        } catch {
          // Not JSON — treat as raw PTY text output
          if (typeof raw === 'string') {
            this.outputHandler?.(raw);
          }
        }
      };

      this.ws.onclose = (event) => {
        terminalLog.info('Disconnected');
        this.connectionHandler?.(false);
        logWsDisconnect('terminal', event.code, event.reason);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {};
    } catch {
      terminalLog.error('Failed to connect');
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.instanceId = null;
    this.terminalId = null;
  }

  /** Reset backoff and immediately attempt to reconnect. */
  forceReconnect() {
    if (!this.instanceId) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
    this.connect(this.instanceId, this.terminalId || undefined);
  }

  private scheduleReconnect() {
    if (this.instanceId && !this.reconnectTimeout) {
      const scheduled = scheduleWsReconnect('terminal', this.reconnectAttempts, () => {
        this.reconnectTimeout = null;
        if (this.instanceId) this.connect(this.instanceId, this.terminalId || undefined);
      });
      this.reconnectAttempts = scheduled.attempt;
      this.reconnectTimeout = scheduled.timeout;
    }
  }

  sendInput(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send raw text directly to PTY stdin (sandbox SDK expects raw bytes)
      this.ws.send(data);
    }
  }

  resize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Resize is sent as JSON control frame
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  onOutput(handler: (data: string) => void) {
    this.outputHandler = handler;
  }

  onScrollback(handler: (data: string) => void) {
    this.scrollbackHandler = handler;
  }

  onConnection(handler: (connected: boolean) => void) {
    this.connectionHandler = handler;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Agent WebSocket client - receives events and sends chat messages
 */
export interface AgentEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface AgentFrontendContext {
  activeWindow?: {
    id: string;
    type: string;
    title?: string;
    metadata?: Record<string, unknown>;
  } | null;
  openWindows?: Array<{ id: string; type: string; title?: string }>;
  activeApp?: {
    id?: string;
    name?: string;
    source?: string;
    selectedCapability?: string;
    metadata?: Record<string, unknown>;
  } | null;
  selectedIntegrationSlug?: string;
  selectedFiles?: string[];
  componentMentions?: Array<{
    appId: string;
    appName?: string;
    componentId: string;
    componentType: string;
    label?: string;
    path?: string;
    props?: Record<string, unknown>;
    bindings?: Record<string, string>;
    actions?: Record<string, unknown>;
  }>;
  launchedFrom?: string;
}

export interface AgentClientPresence {
  surface: 'web' | 'desktop_app' | 'mobile_app';
  visibility: 'visible' | 'hidden' | 'unknown';
  activeSessionKey?: string;
  timezone?: string;
  lastFocusedAt?: number;
  appVersion?: string;
  deviceLabel?: string;
  openWindows?: Array<{ id: string; type: string; title?: string }>;
  activeWindow?: AgentFrontendContext['activeWindow'];
}

class AgentWSClient {
  private ws: WebSocket | null = null;
  private instanceId: string | null = null;
  private eventHandler: ((event: AgentEvent) => void) | null = null;
  private connectionHandler: ((connected: boolean) => void) | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private pendingMessages: string[] = [];
  private pingResolve: ((rtt: number) => void) | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceInterval: ReturnType<typeof setInterval> | null = null;
  private presenceProvider: (() => Partial<AgentClientPresence>) | null = null;
  private lastFocusedAt = Date.now();
  private handlePresenceVisibility = () => this.sendPresence('visibility');
  private handlePresenceFocus = () => {
    this.lastFocusedAt = Date.now();
    this.sendPresence('focus');
  };

  connect(instanceId: string) {
    if (
      this.instanceId === instanceId
      && (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.disconnect();
    this.instanceId = instanceId;

    const token = localStorage.getItem(STORAGE_KEYS.token);
    const url = `${getWsBaseUrl()}/ws/agent/${instanceId}?token=${encodeURIComponent(token || '')}`;
    
    agentLog.info('Connecting to agent websocket', { instanceId });
    
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        agentLog.info('Connected');
        this.reconnectAttempts = 0;
        this.connectionHandler?.(true);

        // Send the user's timezone so the agent knows what timezone to use
        try {
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          this.ws?.send(JSON.stringify({ type: 'set_timezone', timezone }));
        } catch {
          // timeZone not available in some runtimes
          void 0;
        }
        this.startPresenceHeartbeat();

        // Re-register dev app if connected (survives page refresh / WS reconnect)
        import('@/stores/devAppStore').then(({ useDevAppStore }) => {
          useDevAppStore.getState().reregister();
        }).catch(() => {
          void 0; // reregister is best-effort
        });

        // Flush any messages that were queued while the WS was connecting
        for (const msg of this.pendingMessages) {
          this.ws?.send(msg);
        }
        this.pendingMessages = [];
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Resolve latency ping if pending
          if (msg.type === 'pong' && typeof msg.ts === 'number') {
            if (this.pingResolve) {
              const rtt = Date.now() - msg.ts;
              this.pingResolve(rtt);
              this.pingResolve = null;
              if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
            }
            return;
          }
          if (msg.type === 'auth:revoked') {
            window.dispatchEvent(new CustomEvent('construct:auth-revoked', { detail: msg.data || {} }));
            return;
          }
          this.eventHandler?.(msg as AgentEvent);
        } catch (e) {
          agentLog.error('Failed to parse message', e);
        }
      };

      this.ws.onclose = (event) => {
        agentLog.info('Disconnected');
        this.connectionHandler?.(false);
        this.stopPresenceHeartbeat();
        logWsDisconnect('agent', event.code, event.reason);
        if (event.code === 4001) {
          window.dispatchEvent(new CustomEvent('construct:auth-revoked', {
            detail: { reason: event.reason || 'session_revoked' },
          }));
          return;
        }
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        agentLog.error('Error', error);
      };
    } catch (error) {
      agentLog.error('Failed to connect', error);
    }
  }

  disconnect() {
    this.stopPresenceHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.instanceId = null;
    this.pendingMessages = [];
  }

  setPresenceProvider(provider: (() => Partial<AgentClientPresence>) | null) {
    this.presenceProvider = provider;
  }

  private detectSurface(): AgentClientPresence['surface'] {
    const ua = navigator.userAgent || '';
    if (/ConstructDesktop/i.test(ua)) return 'desktop_app';
    if (/ConstructMobile|iPhone|iPad|Android/i.test(ua)) return 'mobile_app';
    return 'web';
  }

  private buildPresence(reason: string): AgentClientPresence & { type: 'client_presence'; reason: string } {
    let timezone = 'UTC';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
    } catch {
      void 0;
    }
    const provided = this.presenceProvider?.() || {};
    return {
      type: 'client_presence',
      reason,
      surface: this.detectSurface(),
      visibility: typeof document !== 'undefined'
        ? (document.visibilityState === 'visible' ? 'visible' : 'hidden')
        : 'unknown',
      timezone,
      lastFocusedAt: this.lastFocusedAt,
      appVersion: import.meta.env.VITE_APP_VERSION || undefined,
      deviceLabel: navigator.platform || navigator.userAgent.slice(0, 80),
      ...provided,
    };
  }

  private sendPresence(reason: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(this.buildPresence(reason)));
  }

  private startPresenceHeartbeat() {
    this.stopPresenceHeartbeat();
    this.lastFocusedAt = Date.now();
    this.sendPresence('open');
    this.presenceInterval = setInterval(() => this.sendPresence('heartbeat'), 30_000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handlePresenceVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.handlePresenceFocus);
    }
  }

  private stopPresenceHeartbeat() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handlePresenceVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handlePresenceFocus);
    }
  }

  /** Reset backoff and immediately attempt to reconnect. */
  forceReconnect() {
    if (!this.instanceId) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
    this.connect(this.instanceId);
  }

  private scheduleReconnect() {
    if (this.instanceId && !this.reconnectTimeout) {
      const scheduled = scheduleWsReconnect('agent', this.reconnectAttempts, () => {
        this.reconnectTimeout = null;
        if (this.instanceId) this.connect(this.instanceId);
      });
      this.reconnectAttempts = scheduled.attempt;
      this.reconnectTimeout = scheduled.timeout;
    }
  }

  /**
   * Send a chat message. Returns true if the message was sent or queued for
   * delivery, false if it was dropped (no connection and not connecting).
   */
  sendChat(
    message: string,
    sessionKey: string = 'ws_default',
    images?: string[],
    frontendContext?: AgentFrontendContext,
    clientId?: string,
    attachments?: AgentFileAttachment[],
  ): boolean {
    const payload = JSON.stringify({
      type: 'chat',
      message,
      session_key: sessionKey,
      ...(images && images.length > 0 ? { images } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(frontendContext ? { frontendContext } : {}),
      ...(clientId ? { clientId } : {}),
    });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      return true;
    } else if (this.ws?.readyState === WebSocket.CONNECTING) {
      // Queue the message — it will be flushed when the connection opens
      agentLog.info('WS still connecting, queuing message');
      this.pendingMessages.push(payload);
      return true;
    }
    // WS is null, CLOSING, or CLOSED — message would be lost
    agentLog.warn('Cannot send chat: WebSocket not connected');
    return false;
  }

  sendAuthResume(params: { sessionKey: string; toolkit: string; name: string; kind?: 'composio' | 'app'; appId?: string }): boolean {
    const payload = JSON.stringify({
      type: 'auth_resume',
      session_key: params.sessionKey,
      toolkit: params.toolkit,
      name: params.name,
      kind: params.kind,
      appId: params.appId,
    });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      return true;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.pendingMessages.push(payload);
      return true;
    }
    agentLog.warn('Cannot resume after auth: WebSocket not connected');
    return false;
  }

  /**
   * Abort running agent lanes. Hard-stops the session loop with no restart.
   * - No options: abort ALL running lanes
   * - sessionKey: abort a specific session lane
   * - platform: (client metadata; server abort handler keys on sessionKey only)
   * Returns true if the payload was sent or queued for the opening connection.
   */
  sendAbort(options?: { sessionKey?: string; platform?: string }): boolean {
    const payload = JSON.stringify({ type: 'abort', ...options });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      return true;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.pendingMessages.push(payload);
      return true;
    }
    agentLog.warn('Cannot send abort: WebSocket not connected');
    return false;
  }

  /**
   * Interrupt a running session loop and optionally restart it with a new
   * message. Unlike `sendAbort`, the session re-enters the run queue after
   * the current turn is cooperatively cancelled. Used by the Spotlight
   * "Interrupt" button.
   */
  sendInterrupt(options: { sessionKey: string; message?: string; clientId?: string; frontendContext?: AgentFrontendContext }): boolean {
    const payload = JSON.stringify({
      type: 'interrupt',
      sessionKey: options.sessionKey,
      ...(options.message ? { message: options.message } : {}),
      ...(options.clientId ? { clientId: options.clientId } : {}),
      ...(options.frontendContext ? { frontendContext: options.frontendContext } : {}),
    });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      return true;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.pendingMessages.push(payload);
      return true;
    }
    agentLog.warn('Cannot send interrupt: WebSocket not connected');
    return false;
  }

  /** Cancel a specific child agent by ID. */
  sendCancelChild(childId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'cancel_child', childId }));
    }
  }

  /** Generic send for any message type. */
  send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // sendWorkspaceSync removed — workspaces are client-side only

  /** Notify the backend that the user opened a window so it can be restored on refresh. */
  sendWindowOpen(windowType: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'window_open', windowType }));
    }
  }

  /** Notify the backend that the user closed a window so it stops being restored on refresh. */
  sendWindowClose(windowType: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'window_close', windowType }));
    }
  }

  onEvent(handler: (event: AgentEvent) => void) {
    this.eventHandler = handler;
  }

  onConnection(handler: (connected: boolean) => void) {
    this.connectionHandler = handler;
  }

  /** Measure round-trip latency to the backend via this WS. Returns RTT in ms. */
  ping(timeoutMs = 5000): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }
      if (this.pingResolve) {
        this.pingResolve = null;
        if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
      }
      this.pingResolve = resolve;
      this.pingTimer = setTimeout(() => {
        this.pingResolve = null;
        this.pingTimer = null;
        reject(new Error('ping timeout'));
      }, timeoutMs);
      this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  isConnecting(): boolean {
    return this.ws?.readyState === WebSocket.CONNECTING;
  }
}

// Export singleton instances
export const browserWS = new BrowserWSClient();
export const agentWS = new AgentWSClient();
