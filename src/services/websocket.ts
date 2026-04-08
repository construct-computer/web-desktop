import { STORAGE_KEYS } from '@/lib/constants';
import { WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS, WS_RECONNECT_JITTER_MS, WS_KEEPALIVE_TIMEOUT_MS, WS_KEEPALIVE_PING_INTERVAL_MS, WS_PING_TIMEOUT_MS, IS_DEV } from '@/lib/config';
import { log } from '@/lib/logger';

const browserLog = log('BrowserWS');
const terminalLog = log('TerminalWS');
const agentLog = log('AgentWS');

// Get WebSocket base URL
// Supports VITE_WS_BASE_URL override for Cloudflare Workers deployment
// where frontend (Pages) and backend (Worker) may be on different origins.
function getWsBaseUrl(): string {
  const override = import.meta.env.VITE_WS_BASE_URL;
  if (override) return override;
  const backendHost = IS_DEV ? 'localhost:3000' : window.location.host;
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${backendHost}`;
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
    
    browserLog.info('Connecting to', url);
    
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

      this.ws.onclose = () => {
        browserLog.info('Disconnected');
        this.connectionHandler?.(false);
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
      const delay = Math.min(WS_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts), WS_RECONNECT_MAX_MS) + Math.random() * WS_RECONNECT_JITTER_MS;
      this.reconnectAttempts++;
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        if (this.instanceId) {
          this.connect(this.instanceId);
        }
      }, delay);
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

      this.ws.onclose = () => {
        terminalLog.info('Disconnected');
        this.connectionHandler?.(false);
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
      const delay = Math.min(WS_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts), WS_RECONNECT_MAX_MS) + Math.random() * WS_RECONNECT_JITTER_MS;
      this.reconnectAttempts++;
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        if (this.instanceId) this.connect(this.instanceId, this.terminalId || undefined);
      }, delay);
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
    
    agentLog.info('Connecting to', url);
    
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
        } catch {}

        // Re-register dev app if connected (survives page refresh / WS reconnect)
        import('@/stores/devAppStore').then(({ useDevAppStore }) => {
          useDevAppStore.getState().reregister();
        }).catch(() => {});

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
          this.eventHandler?.(msg as AgentEvent);
        } catch (e) {
          agentLog.error('Failed to parse message', e);
        }
      };

      this.ws.onclose = () => {
        agentLog.info('Disconnected');
        this.connectionHandler?.(false);
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
      const delay = Math.min(WS_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts), WS_RECONNECT_MAX_MS) + Math.random() * WS_RECONNECT_JITTER_MS;
      this.reconnectAttempts++;
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        if (this.instanceId) {
          this.connect(this.instanceId);
        }
      }, delay);
    }
  }

  /**
   * Send a chat message. Returns true if the message was sent or queued for
   * delivery, false if it was dropped (no connection and not connecting).
   */
  sendChat(message: string, sessionKey: string = 'ws_default', images?: string[]): boolean {
    const payload = JSON.stringify({ type: 'chat', message, session_key: sessionKey, ...(images && images.length > 0 ? { images } : {}) });
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

  /**
   * Abort running agent lanes.
   * - No options: abort ALL running lanes
   * - sessionKey: abort a specific session lane
   * - platform: abort all lanes for a platform
   */
  sendAbort(options?: { sessionKey?: string; platform?: string }) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'abort', ...options }));
    }
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
}

// Export singleton instances
export const browserWS = new BrowserWSClient();
export const agentWS = new AgentWSClient();

