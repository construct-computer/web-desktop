import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { agentWS } from '@/services/websocket';

export interface DevAppTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface DevAppInfo {
  name: string;
  description: string;
  has_ui: boolean;
  tools: DevAppTool[];
  iconUrl: string | null;
}

type DevAppStatus = 'disconnected' | 'validating' | 'connected' | 'error';

interface DevAppState {
  devUrl: string | null;
  status: DevAppStatus;
  error: string | null;
  appInfo: DevAppInfo | null;

  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  refreshTools: () => Promise<void>;
  /** Called when AgentDO sends dev_app_tool_call via WebSocket — proxies to localhost. */
  handleToolCall: (callId: string, appId: string, toolName: string, args: Record<string, unknown>) => void;
  /** Direct tool call from UI bridge (no WebSocket round-trip). */
  callToolDirect: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Re-register with AgentDO after WebSocket reconnect. */
  reregister: () => void;
}

const DEV_APP_ID = 'dev-app';

async function mcpRequest(url: string, method: string, params?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const useDevAppStore = create<DevAppState>()(
  persist(
    (set, get) => ({
      devUrl: null,
      status: 'disconnected',
      error: null,
      appInfo: null,

      connect: async (url: string) => {
        // Normalize URL (strip trailing slash)
        const normalizedUrl = url.replace(/\/+$/, '');
        set({ status: 'validating', error: null, devUrl: normalizedUrl });

        try {
          // 1. Health check
          const healthRes = await fetch(`${normalizedUrl}/health`).catch(() => null);
          if (!healthRes || !healthRes.ok) {
            throw new Error(`Cannot reach ${normalizedUrl}/health. Is wrangler dev running?`);
          }

          // 2. MCP initialize
          const initResult = await mcpRequest(normalizedUrl, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'construct-dev', version: '1.0.0' },
          });
          if (initResult.error) {
            throw new Error(`MCP initialize failed: ${initResult.error.message || JSON.stringify(initResult.error)}`);
          }

          const serverInfo = initResult.result?.serverInfo || {};

          // 3. Get tools
          const toolsResult = await mcpRequest(normalizedUrl, 'tools/list');
          if (toolsResult.error) {
            throw new Error(`MCP tools/list failed: ${toolsResult.error.message}`);
          }
          const tools: DevAppTool[] = toolsResult.result?.tools || [];

          // 4. Try to detect UI — check common entry points
          let has_ui = false;
          for (const uiPath of ['/', '/ui/index.html', '/index.html']) {
            try {
              const uiCheck = await fetch(`${normalizedUrl}${uiPath}`, { method: 'HEAD' });
              if (uiCheck.ok && uiCheck.headers.get('content-type')?.includes('html')) { has_ui = true; break; }
            } catch { /* try next */ }
          }

          // 5. Try to fetch app icon
          let iconUrl: string | null = null;
          for (const iconPath of ['/icon.png', '/icon.svg', '/favicon.ico']) {
            try {
              const iconRes = await fetch(`${normalizedUrl}${iconPath}`);
              if (iconRes.ok && iconRes.headers.get('content-type')?.startsWith('image')) {
                const blob = await iconRes.blob();
                iconUrl = URL.createObjectURL(blob);
                break;
              }
            } catch { /* try next */ }
          }

          const appInfo: DevAppInfo = {
            name: serverInfo.name || 'Dev App',
            description: serverInfo.description || `Dev server at ${normalizedUrl}`,
            has_ui,
            tools,
            iconUrl,
          };

          set({ status: 'connected', appInfo, error: null });

          // 5. Register with AgentDO via WebSocket
          agentWS.send({
            type: 'dev_app_register',
            appId: DEV_APP_ID,
            name: appInfo.name,
            description: appInfo.description,
            tools: appInfo.tools,
            has_ui: appInfo.has_ui,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          set({ status: 'error', error: message, appInfo: null });
        }
      },

      disconnect: () => {
        agentWS.send({ type: 'dev_app_unregister', appId: DEV_APP_ID });
        set({ status: 'disconnected', error: null, appInfo: null, devUrl: null });
      },

      refreshTools: async () => {
        const { devUrl } = get();
        if (!devUrl) return;

        try {
          const toolsResult = await mcpRequest(devUrl, 'tools/list');
          const tools: DevAppTool[] = toolsResult.result?.tools || [];

          set((s) => ({
            appInfo: s.appInfo ? { ...s.appInfo, tools } : s.appInfo,
          }));

          // Re-register with updated tools
          const { appInfo } = get();
          if (appInfo) {
            agentWS.send({
              type: 'dev_app_register',
              appId: DEV_APP_ID,
              name: appInfo.name,
              description: appInfo.description,
              tools: appInfo.tools,
              has_ui: appInfo.has_ui,
            });
          }
        } catch (err) {
          set({ error: `Failed to refresh tools: ${err instanceof Error ? err.message : err}` });
        }
      },

      handleToolCall: (callId, _appId, toolName, args) => {
        const { devUrl } = get();
        if (!devUrl) {
          agentWS.send({ type: 'dev_app_tool_result', callId, error: 'Dev app not connected' });
          return;
        }

        // Proxy the tool call to localhost (fire and forget — result sent via WS)
        mcpRequest(devUrl, 'tools/call', { name: toolName, arguments: args })
          .then((rpcData) => {
            if (rpcData.error) {
              agentWS.send({ type: 'dev_app_tool_result', callId, error: rpcData.error.message || 'MCP error' });
            } else {
              agentWS.send({ type: 'dev_app_tool_result', callId, result: rpcData.result });
            }
          })
          .catch((err) => {
            agentWS.send({ type: 'dev_app_tool_result', callId, error: err.message || 'Fetch failed' });
          });
      },

      callToolDirect: async (toolName, args) => {
        const { devUrl } = get();
        if (!devUrl) throw new Error('Dev app not connected');

        const rpcData = await mcpRequest(devUrl, 'tools/call', { name: toolName, arguments: args });
        if (rpcData.error) throw new Error(rpcData.error.message || 'MCP error');
        return rpcData.result;
      },

      reregister: () => {
        const { status, appInfo, devUrl } = get();
        if (status === 'connected' && appInfo && devUrl) {
          agentWS.send({
            type: 'dev_app_register',
            appId: DEV_APP_ID,
            name: appInfo.name,
            description: appInfo.description,
            tools: appInfo.tools,
            has_ui: appInfo.has_ui,
          });
        }
      },
    }),
    {
      name: 'construct:dev-app',
      partialize: (state) => ({ devUrl: state.devUrl }),
    },
  ),
);
