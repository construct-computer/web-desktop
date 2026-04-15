import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';
import type { ApiResult, User, AgentWithConfig } from '@/types';

/**
 * Get the auth token from storage
 */
function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token);
}

/**
 * Set the auth token in storage
 */
export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.token, token);
}

/**
 * Clear the auth token from storage
 */
export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEYS.token);
}

/**
 * Promise-based refresh queue: when multiple requests get 401 simultaneously,
 * only one refresh is in flight and all waiters share the same result.
 */
let refreshPromise: Promise<boolean> | null = null;

async function ensureTokenRefreshed(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshTokenInternal().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

/**
 * Make an authenticated API request.
 * Automatically retries once with a refreshed token on 401 responses.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<ApiResult<T>> {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    // On 401, attempt a single token refresh (unless this IS the retry).
    // Uses a shared promise so concurrent 401s only trigger one refresh (M17).
    if (response.status === 401 && token && !_isRetry) {
      const refreshed = await ensureTokenRefreshed();
      if (refreshed) {
        // Token refreshed — retry the original request
        return request<T>(endpoint, options, true);
      }
      // Refresh failed — fall through to normal error handling
    }
    
    // Try to parse as JSON, handle non-JSON responses gracefully
    let data: Record<string, unknown>;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      // Non-JSON response - try to get text for error message
      const text = await response.text();
      if (!response.ok) {
        return { success: false, error: text || `Request failed (${response.status})` };
      }
      // If somehow OK but not JSON, treat as empty
      data = {};
    }
    
    if (!response.ok) {
      const errorMsg = (data.error as string) || `Request failed (${response.status})`;
      // Capture API errors in the debug store
      try {
        const { useErrorStore } = await import('@/stores/errorStore');
        useErrorStore.getState().capture({
          source: 'api',
          message: errorMsg,
          context: { endpoint, status: response.status, response: data },
        });
      } catch { /* errorStore not loaded yet during startup */ }
      return { success: false, error: errorMsg, data };
    }

    return { success: true, data: data as T };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Network error';
    try {
      const { useErrorStore } = await import('@/stores/errorStore');
      useErrorStore.getState().capture({
        source: 'api',
        message: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
        context: { endpoint },
      });
    } catch { /* errorStore not loaded yet during startup */ }
    return { success: false, error: errorMsg };
  }
}

/**
 * Internal token refresh — calls the /auth/refresh endpoint directly
 * (not through request() to avoid recursion). Returns true on success.
 */
async function refreshTokenInternal(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return false;

    const data = await response.json() as { token?: string };
    if (data.token) {
      setToken(data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ============================================================================
// Auth API
// ============================================================================

/**
 * Get the Google OAuth URL — navigating here starts the login flow.
 */
export function getGoogleAuthUrl(): string {
  const redirect = encodeURIComponent(window.location.origin);
  return `${API_BASE_URL}/auth/google?redirect_origin=${redirect}`;
}

/**
 * Handle the OAuth callback token from URL query params.
 * Returns true if a token was found and stored.
 */
export function handleOAuthCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const authError = params.get('auth_error');

  // Clean up URL params
  if (token || authError) {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('auth_error');
    url.searchParams.delete('auth_detail');
    window.history.replaceState({}, '', url.pathname);
  }

  if (token) {
    setToken(token);
    return true;
  }

  return false;
}

/**
 * Get the auth error from the OAuth callback, if any.
 */
export function getOAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('auth_error');
}

/**
 * Get the auth error detail (staging only — contains backend error message).
 */
export function getOAuthErrorDetail(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('auth_detail');
}

/**
 * Check if the URL contains a magic_token param (from email link click).
 * If so, redirect to the backend verify endpoint which will validate
 * and redirect back with ?token=JWT.
 * Returns true if a redirect was initiated (caller should stop processing).
 */
export function handleMagicLinkRedirect(): boolean {
  const params = new URLSearchParams(window.location.search);
  const magicToken = params.get('magic_token');
  if (magicToken) {
    window.location.href = `${API_BASE_URL}/auth/magic/verify?token=${encodeURIComponent(magicToken)}`;
    return true;
  }
  return false;
}

/**
 * Send a magic link email. Returns success or an error message.
 */
export async function sendMagicLink(email: string): Promise<ApiResult<{ success: boolean }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/magic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorMsg = `Request failed (${response.status})`;
      try { errorMsg = JSON.parse(text).error || errorMsg; } catch { /* plain text */ }
      return { success: false, error: errorMsg };
    }

    return { success: true, data: { success: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Verify a 6-digit OTP code. Returns JWT token on success.
 */
export async function verifyOtp(email: string, otp: string): Promise<ApiResult<{ token: string; user: User }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/magic/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }

    if (!response.ok) {
      return { success: false, error: data.error || `Request failed (${response.status})` };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function getMe(): Promise<ApiResult<{ user: User }>> {
  return request('/auth/me');
}

export async function updateProfile(data: { displayName: string }): Promise<ApiResult<{ user: User }>> {
  return request('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify({ displayName: data.displayName }),
  });
}

export async function markSetupComplete(): Promise<ApiResult<{ user: User }>> {
  return request('/auth/setup-complete', { method: 'POST' });
}

export async function checkAgentEmailAvailability(_instanceId: string, username: string): Promise<ApiResult<{ available: boolean; reason?: string; suggestion?: string }>> {
  return request(`/agent/email/check?username=${encodeURIComponent(username)}`);
}

export function logout(): void {
  clearToken();
}

// ============================================================================
// Instance API (single computer per user)
// ============================================================================

export interface Instance {
  id: string;
  userId: string;
  status: 'running';
  createdAt: string;
}

export interface AgentConfigResponse {
  openrouter_api_key: string;
  telegram_bot_token: string;
  tinyfish_api_key: string;
  agentmail_api_key: string;
  agentmail_inbox_username: string;
  model: string;
  owner_name: string;
  agent_name: string;
  timezone: string;
  has_api_key: boolean;
  has_telegram_token: boolean;
  has_tinyfish_key: boolean;
  has_agentmail_key: boolean;
}

export async function getAgentInfo(): Promise<ApiResult<{
  id: string;
  status: 'running';
  agentName: string;
}>> {
  return request('/agent/status');
}

/** Get agent instance info. In serverless mode, the agent is always "running". */
export async function getInstance(): Promise<ApiResult<{ instance: Instance }>> {
  const meResult = await getMe();
  if (!meResult.success) return { success: false, error: meResult.error };
  const user = meResult.data.user;
  return {
    success: true,
    data: {
      instance: {
        id: user.id,
        userId: user.id,
        status: 'running' as const,
        createdAt: user.createdAt || new Date().toISOString(),
      },
    },
  };
}

export async function getAgentConfig(_instanceId: string): Promise<ApiResult<AgentConfigResponse>> {
  return request(`/agent/config`);
}

export async function updateAgentConfig(_instanceId: string, config: {
  openrouter_api_key?: string;
  telegram_bot_token?: string;
  tinyfish_api_key?: string;
  agentmail_api_key?: string;
  agentmail_inbox_username?: string;
  model?: string;
  owner_name?: string;
  owner_email?: string;
  agent_name?: string;
  timezone?: string;
}): Promise<ApiResult<{ status: string; message: string }>> {
  return request(`/agent/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function getAgentStatus(_instanceId: string): Promise<ApiResult<{
  running: boolean;
  state: string;
  agent_name: string;
  connections: number;
}>> {
  return request(`/agent/status`);
}

export interface AgentConfigStatus {
  configured: boolean;
  hasApiKey: boolean;
  hasTelegramToken: boolean;
  hasTinyfishKey: boolean;
  hasAgentmailKey: boolean;
  /** Whether the platform provides shared API keys (zero-config fallback). */
  platformKeys?: {
    hasOpenrouter: boolean;
    hasTinyfish: boolean;
    hasAgentmail: boolean;
  };
}

export async function getAgentConfigStatus(_instanceId: string): Promise<ApiResult<AgentConfigStatus>> {
  return request(`/agent/config/status`);
}

/**
 * Load conversation history from the agent (persisted inside the container).
 */
export interface OperationMeta {
  type: 'delegation' | 'consultation' | 'background';
  delegationId?: string;
  consultationId?: string;
  taskId?: string;
  goal?: string;
  question?: string;
  status?: string;
  durationMs?: number;
  subagents?: Array<{ id: string; goal: string; status: string; result?: string; turns: number; durationMs: number }>;
  advisors?: Array<{ role: string; status: string; durationMs: number; response?: string }>;
  maxTurns?: number;
}

export async function getAgentHistory(_instanceId: string, sessionKey = 'ws_default'): Promise<ApiResult<{
  session_key: string;
  messages: Array<{
    role: string;
    content: string | null;
    created_at: number;
    tool_calls?: Array<{
      type: string;
      function: { name: string; arguments: string };
    }>;
    metadata?: string | Record<string, unknown>;
  }>;
  operation_metadata?: OperationMeta[];
}>> {
  return request(`/agent/history?session_key=${encodeURIComponent(sessionKey)}`);
}

export interface SessionInfo {
  key: string;
  title: string;
  created: number;
  lastActivity: number;
}

/**
 * List all chat sessions for the agent.
 */
export async function getAgentSessions(_instanceId: string): Promise<ApiResult<{
  sessions: SessionInfo[];
  active_key: string;
}>> {
  return request(`/agent/sessions`);
}

/**
 * Create a new chat session.
 */
export async function createAgentSession(_instanceId: string, title?: string): Promise<ApiResult<SessionInfo>> {
  return request(`/agent/sessions`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

/**
 * Delete a chat session.
 */
export async function deleteAgentSession(_instanceId: string, sessionKey: string): Promise<ApiResult<{ ok: boolean; active_key: string }>> {
  return request(`/agent/sessions/${encodeURIComponent(sessionKey)}`, {
    method: 'DELETE',
  });
}

/**
 * Rename a chat session.
 */
export async function renameAgentSession(_instanceId: string, sessionKey: string, title: string): Promise<ApiResult<{ ok: boolean }>> {
  return request(`/agent/sessions/${encodeURIComponent(sessionKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
}

/**
 * Switch the active chat session.
 */
export async function activateAgentSession(_instanceId: string, sessionKey: string): Promise<ApiResult<{ ok: boolean; active_key: string }>> {
  return request(`/agent/sessions/${encodeURIComponent(sessionKey)}/activate`, {
    method: 'PUT',
  });
}

/**
 * Validate an OpenRouter API key by calling their auth endpoint.
 * Returns { valid: true } on success, or { valid: false, error } on failure.
 */
export async function validateOpenRouterKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.ok) return { valid: true };
    if (response.status === 401) return { valid: false, error: 'Invalid API key' };
    return { valid: false, error: `Validation failed (${response.status})` };
  } catch {
    return { valid: false, error: 'Could not validate key. Check your connection.' };
  }
}

/**
 * Fetch model info (name + pricing) from OpenRouter.
 * Uses the public /api/v1/models endpoint (no auth required).
 */
export interface OpenRouterModelInfo {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string } | null;
}

const modelInfoCache = new Map<string, OpenRouterModelInfo | null>();

export async function fetchModelInfo(modelId: string): Promise<OpenRouterModelInfo | null> {
  if (modelInfoCache.has(modelId)) return modelInfoCache.get(modelId)!;

  try {
    const res = await fetch(`https://openrouter.ai/api/v1/models`);
    if (!res.ok) return null;

    const data = await res.json() as { data: Array<{ id: string; name: string; pricing?: { prompt?: string; completion?: string } }> };
    // Cache all models from the response for future lookups
    for (const m of data.data) {
      const info: OpenRouterModelInfo = {
        id: m.id,
        name: m.name,
        pricing: m.pricing ? { prompt: m.pricing.prompt || '0', completion: m.pricing.completion || '0' } : null,
      };
      modelInfoCache.set(m.id, info);
    }

    return modelInfoCache.get(modelId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Format per-token pricing to a human-readable $/M tokens string.
 */
export function formatModelPrice(perToken: string): string {
  const n = parseFloat(perToken);
  if (isNaN(n) || n === 0) return 'Free';
  const perMillion = n * 1_000_000;
  if (perMillion < 0.01) return `<$0.01/M`;
  if (perMillion < 1) return `$${perMillion.toFixed(2)}/M`;
  return `$${perMillion.toFixed(perMillion % 1 === 0 ? 0 : 2)}/M`;
}

export interface DesktopState {
  windows: string[];
  browser: {
    tabs?: unknown[];
    url?: string;
    title?: string;
    activeTabId?: string;
  } | null;
}

export async function getDesktopState(_instanceId: string): Promise<ApiResult<DesktopState>> {
  return { success: true, data: { windows: [], browser: null } };
}

// ============================================================================
// Filesystem API
// ============================================================================

export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: string;
}

export interface FileListResponse {
  path: string;
  entries: FileEntry[];
}

export async function listFiles(_instanceId: string, path = '/home/sandbox/workspace'): Promise<ApiResult<FileListResponse>> {
  return request(`/files?path=${encodeURIComponent(path)}`);
}

export interface FileContentResponse {
  path: string;
  content: string;
}

export async function readFile(_instanceId: string, path: string): Promise<ApiResult<FileContentResponse>> {
  return request(`/files/read?path=${encodeURIComponent(path)}`);
}

/**
 * Download a binary file from the container. Returns the raw Response
 * so the caller can create a blob URL for preview.
 * Handles 401 with a single token refresh retry (M19).
 */
export async function downloadContainerFile(_instanceId: string, path: string): Promise<Response> {
  const url = `${API_BASE_URL}/files/download?path=${encodeURIComponent(path)}`;
  const doFetch = () => {
    const token = getToken();
    return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  const res = await doFetch();
  if (res.status === 401) {
    const refreshed = await ensureTokenRefreshed();
    if (refreshed) return doFetch();
  }
  return res;
}

/**
 * Upload a binary file (e.g. from drag-and-drop) into the container.
 * Sends the raw bytes as the request body, file path in the query string.
 * Handles 401 with a single token refresh retry (M19).
 */
export async function uploadContainerFile(
  _instanceId: string,
  path: string,
  file: File | Blob,
): Promise<ApiResult<{ status: string; path: string; size: number }>> {
  const url = `${API_BASE_URL}/files/upload?path=${encodeURIComponent(path)}`;
  const doFetch = () => {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { method: 'POST', headers, body: file });
  };

  try {
    let response = await doFetch();
    // Retry once on 401 after refreshing the token (M19)
    if (response.status === 401) {
      const refreshed = await ensureTokenRefreshed();
      if (refreshed) response = await doFetch();
    }
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

export async function checkFileExists(_instanceId: string, path: string): Promise<ApiResult<{ exists: boolean }>> {
  return request(`/files/exists?path=${encodeURIComponent(path)}`);
}

export async function writeFile(_instanceId: string, path: string, content: string): Promise<ApiResult<{ status: string; path: string }>> {
  return request(`/files/write`, {
    method: 'PUT',
    body: JSON.stringify({ path, content }),
  });
}

export async function createFile(_instanceId: string, path: string): Promise<ApiResult<{ status: string; path: string }>> {
  return request(`/files/create`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function createDirectory(_instanceId: string, path: string): Promise<ApiResult<{ status: string; path: string }>> {
  return request(`/files/mkdir`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function deleteItem(_instanceId: string, path: string): Promise<ApiResult<{ status: string; path: string }>> {
  return request(`/files/delete`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function renameItem(_instanceId: string, oldPath: string, newPath: string): Promise<ApiResult<{ status: string; oldPath: string; newPath: string }>> {
  return request(`/files/rename`, {
    method: 'POST',
    body: JSON.stringify({ oldPath, newPath }),
  });
}

// ============================================================================
// Google Drive API (backed by Composio)
// ============================================================================

export interface DriveStatus {
  connected: boolean;
  configured?: boolean;
}

export async function getDriveConfigured(): Promise<ApiResult<{ configured: boolean }>> {
  return request('/composio/configured');
}

export async function getDriveAuthUrl(): Promise<ApiResult<{ url?: string; connected_account_id?: string; error?: string }>> {
  return request('/composio/googledrive/auth-url');
}

export async function getDriveStatus(): Promise<ApiResult<DriveStatus>> {
  return request('/composio/googledrive/status');
}

export async function disconnectDrive(): Promise<ApiResult<{ status: string }>> {
  return request('/composio/googledrive/disconnect', { method: 'DELETE' });
}

// ── Drive File Operations (via Composio) ──

export interface DriveFileEntry {
  id: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified?: string;
  mimeType: string;
}

export interface DriveSyncReport {
  downloaded: string[];
  uploaded: string[];
  deleted: string[];
  conflicts: string[];
  timestamp: string;
}

export async function listDriveFiles(folderId?: string): Promise<ApiResult<{ files: DriveFileEntry[]; folderId: string }>> {
  const params = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
  return request(`/drive/files${params}`);
}

export async function readDriveFileContent(fileId: string): Promise<ApiResult<{ content: string }>> {
  return request(`/drive/files/${encodeURIComponent(fileId)}/download`);
}

export async function downloadDriveFile(fileId: string): Promise<Response> {
  const token = getToken();
  return fetch(`${API_BASE_URL}/drive/files/${encodeURIComponent(fileId)}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export async function deleteDriveFile(fileId: string): Promise<ApiResult<{ status: string }>> {
  return request(`/drive/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}

export async function renameDriveFile(fileId: string, name: string): Promise<ApiResult<{ status: string }>> {
  return request(`/drive/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function createDriveFolder(name: string, parentFolderId?: string): Promise<ApiResult<{ id: string; name: string }>> {
  return request('/drive/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentFolderId }),
  });
}

export async function searchDriveFiles(query: string): Promise<ApiResult<{ files: DriveFileEntry[] }>> {
  return request(`/drive/files/search?q=${encodeURIComponent(query)}`);
}

export async function copyToDrive(_instanceId: string, filePath: string, driveFolderId?: string): Promise<ApiResult<{ status: string; fileId: string }>> {
  return request('/drive/upload', {
    method: 'POST',
    body: JSON.stringify({ filePath, driveFolderId }),
  });
}

export async function copyToLocal(instanceId: string, driveFileId: string, containerPath: string): Promise<ApiResult<{ status: string }>> {
  return request('/drive/copy-to-local', {
    method: 'POST',
    body: JSON.stringify({ driveFileId, instanceId, destPath: containerPath }),
  });
}

export async function syncDrive(_instanceId: string): Promise<ApiResult<DriveSyncReport>> {
  // Drive files are listed live from Google Drive API — no separate sync needed.
  // Return a no-op success so the UI doesn't show an error.
  return { success: true, data: { downloaded: [], uploaded: [], deleted: [], conflicts: [], timestamp: new Date().toISOString() } };
}

// ============================================================================
// Google Calendar API (backed by Composio)
// ============================================================================

export type CalendarAccessMode = 'readonly' | 'full';

export interface CalendarStatus {
  connected: boolean;
  configured?: boolean;
  accessMode?: CalendarAccessMode;
}

export async function getCalendarConfigured(): Promise<ApiResult<{ configured: boolean }>> {
  return request('/composio/configured');
}

export async function getCalendarAuthUrl(_mode: CalendarAccessMode = 'full'): Promise<ApiResult<{ url?: string; error?: string; mode?: string }>> {
  return request('/composio/googlecalendar/auth-url');
}

export async function getCalendarStatus(): Promise<ApiResult<CalendarStatus>> {
  return request('/composio/googlecalendar/status');
}

export async function disconnectCalendar(): Promise<ApiResult<{ status: string }>> {
  return request('/composio/googlecalendar/disconnect', { method: 'DELETE' });
}

// ============================================================================
// Composio (generic toolkit auth)
// ============================================================================

export async function getComposioConfigured(): Promise<ApiResult<{ configured: boolean }>> {
  return request('/composio/configured');
}

export async function getComposioAuthUrl(toolkit: string): Promise<ApiResult<{ url?: string; connected_account_id?: string; error?: string }>> {
  return request(`/composio/${encodeURIComponent(toolkit)}/auth-url`);
}

/** Initiate a connection for any auth scheme. For OAUTH2 returns a redirect URL;
 *  for API_KEY/BEARER_TOKEN/BASIC/NO_AUTH creates the connected account directly. */
export async function composioConnect(
  toolkit: string,
  authScheme: string,
  fields: Record<string, string> = {},
): Promise<ApiResult<{ requiresOAuth: boolean; url?: string; connected_account_id?: string; ok?: boolean; error?: string }>> {
  return request(`/composio/${encodeURIComponent(toolkit)}/connect`, {
    method: 'POST',
    body: JSON.stringify({ authScheme, fields }),
  });
}

export async function composioFinalize(connectedAccountId?: string): Promise<ApiResult<{ ok: boolean; finalized?: number }>> {
  return request('/composio/finalize', {
    method: 'POST',
    body: JSON.stringify(connectedAccountId ? { connected_account_id: connectedAccountId } : {}),
  });
}

export async function getComposioStatus(toolkit: string): Promise<ApiResult<{ connected: boolean; configured?: boolean }>> {
  return request(`/composio/${encodeURIComponent(toolkit)}/status`);
}

export async function disconnectComposio(toolkit: string): Promise<ApiResult<{ status: string }>> {
  return request(`/composio/${encodeURIComponent(toolkit)}/disconnect`, { method: 'DELETE' });
}

export async function searchComposioToolkits(query: string): Promise<ApiResult<{ 
  toolkits: Array<{ 
    slug: string; 
    name: string; 
    description: string; 
    logo?: string; 
    auth_schemes?: string[]; 
    no_auth?: boolean;
    requiresUpgrade?: boolean;
    available?: boolean;
  }>;
  plan?: string;
}>> {
  return request(`/composio/search?q=${encodeURIComponent(query)}`);
}

export async function getComposioConnected(): Promise<ApiResult<{ connected: Array<{ toolkit: string; accountId: string }> }>> {
  return request('/composio/connected');
}

export interface ComposioAccountDetail {
  connected: boolean;
  accountId?: string;
  composioUserId?: string | null;
  status?: string;
  createdAt?: number;
  authScheme?: string;
  email?: string;
  displayName?: string;
  profilePicture?: string;
}

export async function getComposioAccount(toolkit: string): Promise<ApiResult<ComposioAccountDetail>> {
  return request(`/composio/${encodeURIComponent(toolkit)}/account`);
}

export async function getComposioToolkitDetail(toolkit: string): Promise<ApiResult<{
  slug: string;
  name: string;
  description: string;
  logo: string;
  categories: Array<{ name: string; slug: string }>;
  tools_count: number;
  auth_schemes: string[];
  auth_config?: Array<{
    mode: string;
    fields: Array<{ name: string; displayName: string; description?: string; required: boolean }>;
  }>;
  composio_managed?: boolean;
  tools: Array<{ slug: string; name: string; description: string }>;
}>> {
  return request(`/composio/${encodeURIComponent(toolkit)}/detail`);
}

// ============================================================================
// App Registry Connections (OAuth/API key auth for installed apps)
// ============================================================================

export interface AppConnectionField {
  name: string;
  displayName: string;
  type: 'text' | 'password';
  required: boolean;
  placeholder?: string;
  description?: string;
}

export type AppAuthScheme = 'oauth2' | 'api_key' | 'bearer' | 'basic';

export interface AppConnectionScheme {
  type: AppAuthScheme;
  label: string;
  fields?: AppConnectionField[];
  instructions?: string;
  scopes?: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface AppConnectionStatus {
  connected: boolean;
  connectionId?: string;
  activeScheme?: AppAuthScheme;
  /** Alias for activeScheme — kept for backwards compatibility. */
  authType?: AppAuthScheme;
  connectedAt?: number;
  schemes: AppConnectionScheme[];
  error?: string;
}

export interface AppConnectResult {
  connected: boolean;
  authType: AppAuthScheme;
  authorizationUrl?: string;
  connectionId?: string;
  connectedAt?: number;
}

export interface AppConnection {
  id: string;
  appId: string;
  appName: string;
  authType: string;
  status: string;
  connectedAt: number;
  updatedAt: number;
}

/**
 * Get available auth schemes for an app + current connection status.
 */
export async function getAppConnection(appId: string): Promise<ApiResult<AppConnectionStatus>> {
  const res = await request<AppConnectionStatus>(`/apps/connect/${encodeURIComponent(appId)}`);
  if (res.success && res.data) {
    // Alias activeScheme → authType for older callers.
    res.data.authType = res.data.authType ?? res.data.activeScheme;
  }
  return res;
}

/**
 * Connect to an app with the chosen scheme.
 *   oauth2 → returns { authorizationUrl } for the caller to open in a popup.
 *   api_key/bearer/basic → returns { connected: true } once credentials are stored.
 */
export async function connectApp(
  appId: string,
  scheme: AppAuthScheme,
  fields?: Record<string, string>,
): Promise<ApiResult<AppConnectResult>> {
  return request(`/apps/connect/${encodeURIComponent(appId)}`, {
    method: 'POST',
    body: JSON.stringify({ scheme, fields: fields ?? {} }),
  });
}

/**
 * Disconnect/revoke an app connection
 */
export async function disconnectApp(appId: string): Promise<ApiResult<{ success: boolean }>> {
  return request(`/apps/connect/${encodeURIComponent(appId)}/disconnect`, {
    method: 'POST',
  });
}

/**
 * List all app connections for the user
 */
export async function listAppConnections(): Promise<ApiResult<{ connections: AppConnection[] }>> {
  return request('/apps/connect');
}

// ── Agent Calendar CRUD ──

export interface AgentCalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string;
  completedOccurrences: string[] | null;
  sourceType: string | null;
  sourceMeta: Record<string, unknown> | null;
  htmlLink: string;
  meetLink: string | null;
  organizer: { email: string; displayName?: string } | null;
  attendees: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  recurrence: string[] | null;
  created: string;
  updated: string;
}

export async function listAgentCalendarEvents(options?: {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  query?: string;
}): Promise<ApiResult<{ events: AgentCalendarEvent[] }>> {
  const params = new URLSearchParams();
  if (options?.timeMin) params.set('time_min', options.timeMin);
  if (options?.timeMax) params.set('time_max', options.timeMax);
  if (options?.maxResults) params.set('max_results', String(options.maxResults));
  if (options?.query) params.set('query', options.query);
  const qs = params.toString();
  return request(`/calendar/agent/events${qs ? `?${qs}` : ''}`);
}

export async function createAgentCalendarEvent(event: {
  summary: string;
  description?: string;
  location?: string;
  start_datetime?: string;
  end_datetime?: string;
  start_date?: string;
  end_date?: string;
  all_day?: boolean;
  time_zone?: string;
  recurrence?: string[];
}): Promise<ApiResult<{ event: AgentCalendarEvent }>> {
  return request('/calendar/agent/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export async function updateAgentCalendarEvent(eventId: string, updates: {
  summary?: string;
  description?: string;
  location?: string;
  start_datetime?: string;
  end_datetime?: string;
  start_date?: string;
  end_date?: string;
  time_zone?: string;
}): Promise<ApiResult<{ event: AgentCalendarEvent }>> {
  return request(`/calendar/agent/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteAgentCalendarEvent(eventId: string): Promise<ApiResult<{ status: string }>> {
  return request(`/calendar/agent/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Slack API
// ============================================================================

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName?: string;
  teamId?: string;
  installedAt?: number;
}

export async function getSlackConfigured(): Promise<ApiResult<{ configured: boolean }>> {
  return request('/slack/configured');
}

export async function getSlackInstallUrl(): Promise<ApiResult<{ url?: string; error?: string }>> {
  return request('/slack/install');
}

export async function getSlackStatus(): Promise<ApiResult<SlackStatus>> {
  return request('/slack/status');
}

export async function disconnectSlack(): Promise<ApiResult<{ status: string }>> {
  return request('/slack/disconnect', { method: 'DELETE' });
}

// ============================================================================
// Telegram API (global bot model)
// ============================================================================

export interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  botUsername: string;
  linkedChats: Array<{ chatId: number; username: string | null }>;
}

export async function getTelegramConfigured(): Promise<ApiResult<{ configured: boolean }>> {
  return request('/telegram/configured');
}

export async function getTelegramBotInfo(): Promise<ApiResult<{ configured: boolean; botUsername: string | null }>> {
  return request('/telegram/bot-info');
}

export async function telegramLoginWidget(widgetData: Record<string, string>): Promise<ApiResult<{ status: string; chatId: number; username: string | null }>> {
  return request('/telegram/login-widget', {
    method: 'POST',
    body: JSON.stringify(widgetData),
  });
}

export async function getTelegramStatus(): Promise<ApiResult<TelegramStatus>> {
  return request('/telegram/status');
}

export async function getTelegramLinkUrl(): Promise<ApiResult<{ url: string; code: string; botUsername: string }>> {
  return request('/telegram/link-url');
}

export async function disconnectTelegram(): Promise<ApiResult<{ status: string }>> {
  return request('/telegram/disconnect', { method: 'DELETE' });
}

// Legacy stubs — kept so any old frontend code that references these doesn't break at import time.
export async function connectTelegram(
  _botToken: string,
  _allowedUsernames: string[],
  _notificationUsernames: string[],
): Promise<ApiResult<{ status: string; botUsername: string }>> {
  return { success: false, error: 'Legacy connect removed. Use the deep link flow instead.' };
}

export async function updateTelegramConfig(
  _allowedUsernames: string[],
  _notificationUsernames: string[],
): Promise<ApiResult<TelegramStatus>> {
  return { success: false, error: 'Legacy config update removed.' };
}

// ============================================================================
// Team Access API
// ============================================================================

export interface TeamMember {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  grantedAt: number;
}

export async function getTeamMembers(): Promise<ApiResult<{ members: TeamMember[] }>> {
  return request('/team/members');
}

export async function grantTeamAccess(userId: string, role = 'member'): Promise<ApiResult<{ status: string }>> {
  return request('/team/members', {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });
}

export async function revokeTeamAccess(memberId: string): Promise<ApiResult<{ status: string }>> {
  return request(`/team/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
}

export async function getTeamAgents(): Promise<ApiResult<{ agents: TeamMember[] }>> {
  return request('/team/agents');
}

// ============================================================================
// Audit Log API
// ============================================================================

export interface AuditLogEvent {
  id: string;
  timestamp: string;
  category: string;
  action: string;
  summary: string;
  detail: Record<string, unknown> | null;
  sourceType: string | null;
  sourceMeta: Record<string, unknown> | null;
  result: string;
  resultDetail: string | null;
  durationMs: number | null;
  relatedEventId: string | null;
  sessionKey: string | null;
}

export async function listAuditLogs(options?: {
  timeMin?: string;
  timeMax?: string;
  category?: string;
  action?: string;
  sourceType?: string;
  result?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<{ entries: AuditLogEvent[]; total: number }>> {
  const params = new URLSearchParams();
  if (options?.timeMin) params.set('time_min', options.timeMin);
  if (options?.timeMax) params.set('time_max', options.timeMax);
  if (options?.category) params.set('category', options.category);
  if (options?.action) params.set('action', options.action);
  if (options?.sourceType) params.set('source_type', options.sourceType);
  if (options?.result) params.set('result', options.result);
  if (options?.query) params.set('query', options.query);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString();
  return request(`/audit/logs${qs ? `?${qs}` : ''}`);
}

// ============================================================================
// Mem0 Memory API
// ============================================================================

export interface Mem0Memory {
  id: string;
  memory: string;
  hash?: string;
  created_at?: string;
  updated_at?: string;
  categories?: string[];
}

export interface Mem0Relation {
  source: string;
  source_type: string;
  relationship: string;
  target: string;
  target_type: string;
  score?: number;
}

export async function getMemories(): Promise<ApiResult<{ memories: Mem0Memory[]; relations: Mem0Relation[] }>> {
  return request('/mem0/memories');
}

export async function deleteMemory(memoryId: string): Promise<ApiResult<{ success: boolean; message: string }>> {
  return request(`/mem0/memories/${encodeURIComponent(memoryId)}`, { method: 'DELETE' });
}

// ============================================================================
// Billing & Usage API
// ============================================================================

export interface SubscriptionInfo {
  plan: string;
  planSource: string;
  status: string;
  dodoCustomerId: string | null;
  dodoSubscriptionId: string | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  environment?: string;
  byok?: boolean;
  hasOpenRouterKey?: boolean;
  selectedModel?: string;
  planLimits?: {
    weeklyCapUsd: number;
    windowCapUsd: number;
    email: boolean;
    backgroundAgents: boolean;
    byok: boolean;
    maxIterations: number;
    maxSandboxTimeout: number;
    maxConcurrentSubagents: number;
    maxScheduledTasks: number;
    maxStorageBytes: number;
    maxInstalledApps: number;
  };
  hasBonusCredits?: boolean;
  /** Only present in staging */
  topupCreditsUsd?: number;
  /** Only present in staging */
  limits?: {
    windowCapUsd: number;
    weeklyCapUsd: number;
  };
}

export interface WindowUsage {
  plan?: string;
  allowed: boolean;
  reason?: string;
  windowPercentUsed: number;
  weeklyPercentUsed: number;
  windowResetsAt: string;
  weeklyResetsAt: string;
  shouldDowngrade: boolean;
  usingBonus?: boolean;
  hasBonusCredits?: boolean;
  environment?: string;
  /** Staging only */
  windowUsedUsd?: number;
  /** Staging only */
  windowCapUsd?: number;
  /** Staging only */
  weeklyUsedUsd?: number;
  /** Staging only */
  weeklyCapUsd?: number;
  /** Staging only */
  topupCreditsUsd?: number;
}

export interface UsageHistorySummary {
  days: number;
  environment?: string;
  services: {
    service: string;
    requestCount: number;
    promptTokens?: number;
    completionTokens?: number;
    totalCostUsd?: number;
  }[];
}

export interface UsageRecord {
  id: string;
  userId: string;
  service: string;
  action: string;
  promptTokens: number;
  completionTokens: number;
  model: string | null;
  costUsd: number;
  metadata: string | null;
  createdAt: number;
}

export async function getSubscription(): Promise<ApiResult<SubscriptionInfo>> {
  return request('/billing/subscription');
}

export async function getCurrentUsage(): Promise<ApiResult<WindowUsage>> {
  return request('/billing/usage/current');
}

export async function getUsageHistory(days = 7): Promise<ApiResult<UsageHistorySummary>> {
  return request(`/billing/usage/history?days=${days}`);
}

export async function getUsageRecords(opts?: {
  days?: number;
  limit?: number;
  offset?: number;
  service?: string;
}): Promise<ApiResult<{ records: UsageRecord[] }>> {
  const params = new URLSearchParams();
  if (opts?.days) params.set('days', String(opts.days));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  if (opts?.service) params.set('service', opts.service);
  const qs = params.toString();
  return request(`/billing/usage/records${qs ? `?${qs}` : ''}`);
}

export async function createCheckout(plan = 'pro', coupon?: string): Promise<ApiResult<{ checkoutUrl: string }>> {
  return request('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, ...(coupon ? { coupon } : {}) }),
  });
}

export async function switchPlan(plan: 'free' | 'starter' | 'pro'): Promise<ApiResult<{ 
  ok: boolean; 
  plan: string; 
  message?: string;
  portalUrl?: string;
  redirectToCheckout?: boolean;
  targetPlan?: string;
}>> {
  return request('/billing/switch-plan', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export async function createPortalSession(): Promise<ApiResult<{ portalUrl: string }>> {
  return request('/billing/portal', { method: 'POST' });
}

export async function createTopupCheckout(amount: number): Promise<ApiResult<{ checkoutUrl: string }>> {
  return request('/billing/topup', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

// ── OpenRouter Key & Model Management ──

export async function saveOpenRouterKey(apiKey: string): Promise<ApiResult<{ ok: boolean }>> {
  return request('/billing/openrouter-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
}

export async function removeOpenRouterKey(): Promise<ApiResult<{ ok: boolean }>> {
  return request('/billing/openrouter-key', { method: 'DELETE' });
}

export async function getOpenRouterKeyStatus(): Promise<ApiResult<{ hasKey: boolean }>> {
  return request('/billing/openrouter-key/status');
}


// ── Tweet Credits ──

export interface TweetStatus {
  tweetsRedeemed: number;
  tweetsRemaining: number;
  maxTweets: number;
  hasBonusCredits: boolean;
  /** ISO timestamp (ms) when user is next eligible to redeem. Null if eligible now. */
  nextEligibleAt: number | null;
  shareUrl: string;
  /** Staging only */
  creditPerTweet?: number;
  /** Staging only */
  totalBonusCredits?: number;
}

export async function getTweetStatus(): Promise<ApiResult<TweetStatus>> {
  return request('/billing/tweet-status');
}

export async function redeemTweet(tweetUrl: string): Promise<ApiResult<{ ok: boolean; tweetsRemaining: number; message: string }>> {
  return request('/billing/redeem-tweet', {
    method: 'POST',
    body: JSON.stringify({ tweetUrl }),
  });
}

export async function getTweetShareUrl(): Promise<ApiResult<{ url: string }>> {
  return request('/billing/tweet-share-url');
}

// ── App Store ──

export interface InstalledApp {
  id: string;
  name: string;
  description: string;
  icon_url?: string;
  base_url: string;
  has_ui: boolean;
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  installed_at: number;
}

export async function listInstalledApps(): Promise<ApiResult<{ apps: InstalledApp[] }>> {
  return request('/apps');
}

/** Search the Construct App Registry. */
export async function searchRegistry(q?: string, category?: string): Promise<ApiResult<{
  apps: Array<{
    id: string; name: string; description: string; latest_version: string;
    author: { name: string; url?: string }; category: string; tags: string[];
    repo_url: string; icon_url?: string; has_ui: boolean; tools: Array<{ name: string; description: string }>;
    install_count: number; featured: boolean; verified?: boolean; base_url?: string;
  }>;
  total: number; page: number; pages: number;
}>> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  return request(`/apps/registry?${params}`);
}

export interface RegistryAppDetail {
  id: string;
  name: string;
  description: string;
  long_description?: string;
  author: { name: string; url?: string };
  category: string;
  tags: string[];
  latest_version: string;
  install_count: number;
  avg_rating: number;
  rating_count: number;
  featured: boolean;
  verified: boolean;
  has_ui: boolean;
  base_url: string;
  icon_url?: string;
  repo_url: string;
  tools: Array<{ name: string; description: string }>;
  permissions?: { network?: string[] };
  screenshots?: string[];
  readme_url?: string;
  versions?: Array<{ version: string; commit: string; changelog: string | null; date: string }>;
  reviews?: unknown[];
  auth?: {
    oauth2?: {
      authorization_url: string;
      token_url: string;
      scopes?: string[];
      client_id?: string;
    };
    apiKey?: { header_name?: string };
    bearer?: {};
    basic?: {};
  };
}

/** Get detailed info about a specific app from the registry. */
export async function getRegistryApp(appId: string): Promise<ApiResult<RegistryAppDetail>> {
  return request(`/apps/registry/${encodeURIComponent(appId)}`);
}

/** Get curated integrations from the registry (verified to work with Construct). */
export async function getCuratedApps(): Promise<ApiResult<{
  apps: Array<{
    slug: string; name: string; description: string;
    category: string; source: string; icon_url?: string;
  }>;
}>> {
  return request('/apps/curated');
}

/** Search the Smithery MCP marketplace. */
export async function searchSmithery(q: string): Promise<ApiResult<{
  servers: Array<{
    qualifiedName: string; displayName: string; description: string;
    iconUrl?: string; useCount: number; verified: boolean; remote: boolean;
    isDeployed?: boolean;
  }>;
  pagination: { totalCount: number };
}>> {
  return request(`/apps/smithery?q=${encodeURIComponent(q)}`);
}

/** Fetch full details for a Smithery server (tools, configSchema, connections). */
export async function getSmitheryServerDetail(qualifiedName: string): Promise<ApiResult<{
  qualifiedName: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  remote: boolean;
  deploymentUrl: string | null;
  connections: Array<{
    type: 'stdio' | 'http';
    configSchema?: {
      type: string;
      required?: string[];
      properties?: Record<string, {
        type: string;
        description?: string;
        default?: unknown;
        enum?: unknown[];
      }>;
    };
    deploymentUrl?: string;
    bundleUrl?: string;
  }>;
  tools: Array<{
    name: string;
    description: string | null;
    inputSchema?: Record<string, unknown>;
  }> | null;
  security: { scanPassed: boolean } | null;
}>> {
  return request(`/apps/smithery/detail?name=${encodeURIComponent(qualifiedName)}`);
}

/** Install a Smithery MCP server with user-provided config. */
export async function installSmitheryServer(
  qualifiedName: string,
  config?: Record<string, unknown>,
  displayName?: string,
): Promise<ApiResult<{ ok: boolean; appId: string; manifest: Record<string, unknown>; warning?: string; authRequired?: boolean; authorizationUrl?: string }>> {
  return request('/apps/smithery/install', {
    method: 'POST',
    body: JSON.stringify({ qualifiedName, config, displayName }),
  });
}

/** Search Smithery Skills marketplace (verified only). */
export async function searchSmitherySkills(q: string): Promise<ApiResult<{
  skills: Array<{
    qualifiedName: string;
    displayName: string;
    description: string;
    namespace?: string;
    slug?: string;
    gitUrl?: string;
    categories?: string[];
    totalActivations?: number;
    uniqueUsers?: number;
    externalStars?: number;
    verified?: boolean;
    qualityScore?: number;
  }>;
  pagination?: { totalCount: number; currentPage: number; pageSize: number; totalPages: number };
}>> {
  return request(`/apps/skills/search?q=${encodeURIComponent(q)}`);
}

/** Get full details for a Smithery Skill. */
export async function getSmitherySkillDetail(qualifiedName: string): Promise<ApiResult<{
  qualifiedName: string;
  displayName: string;
  description: string;
  namespace?: string;
  slug?: string;
  prompt?: string;
  gitUrl?: string;
  categories?: string[];
  totalActivations?: number;
  uniqueUsers?: number;
  externalStars?: number;
  externalForks?: number;
  verified?: boolean;
  qualityScore?: number;
  /** Raw SKILL.md content fetched from GitHub. */
  skillContent?: string;
}>> {
  return request(`/apps/skills/detail?name=${encodeURIComponent(qualifiedName)}`);
}

/** Install a Smithery Skill. */
export async function installSmitherySkill(
  qualifiedName: string,
  displayName?: string,
  description?: string,
  gitUrl?: string,
): Promise<ApiResult<{ ok: boolean; appId: string; manifest: Record<string, unknown>; warning?: string }>> {
  return request('/apps/skills/install', {
    method: 'POST',
    body: JSON.stringify({ qualifiedName, displayName, description, gitUrl }),
  });
}

export async function installApp(
  appId: string,
  opts?: { name?: string; description?: string; icon_url?: string; base_url?: string; has_ui?: boolean },
): Promise<ApiResult<{ ok: boolean; app: InstalledApp }>> {
  return request('/apps/install', {
    method: 'POST',
    body: JSON.stringify({ appId, ...opts }),
  });
}

export async function uninstallApp(appId: string): Promise<ApiResult<{ ok: boolean }>> {
  return request(`/apps/${encodeURIComponent(appId)}`, { method: 'DELETE' });
}

export async function callAppTool(appId: string, tool: string, args: Record<string, unknown> = {}): Promise<ApiResult<{ ok: boolean; result: unknown }>> {
  return request(`/apps/${encodeURIComponent(appId)}/tools/call`, {
    method: 'POST',
    body: JSON.stringify({ tool, arguments: args }),
  });
}

/** Get storage usage (R2 workspace). */
export async function getStorageUsage(): Promise<ApiResult<{ bytesUsed: number; fileCount: number; maxBytes: number }>> {
  return request('/files/usage');
}

/** Refresh cached tool definitions for an app. */
export async function refreshAppTools(appId: string): Promise<ApiResult<{ ok: boolean; tools: Array<{ name: string; description?: string }> }>> {
  return request(`/apps/${encodeURIComponent(appId)}/refresh-tools`, { method: 'POST' });
}

// ── Local Apps ──

export interface LocalAppManifest {
  name: string;
  description?: string;
  icon?: string;
  window?: { width?: number; height?: number; minWidth?: number; minHeight?: number };
}

export interface LocalApp {
  id: string;
  manifest: LocalAppManifest;
  icon_url?: string;
}

export async function listLocalApps(): Promise<ApiResult<{ apps: LocalApp[] }>> {
  return request('/apps/local-list');
}

export async function getLocalAppState(appId: string): Promise<ApiResult<Record<string, unknown>>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/_state`);
}

export async function setLocalAppState(appId: string, state: Record<string, unknown>): Promise<ApiResult<{ ok: boolean }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/_state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

