import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';
import type { ApiResult, User, AgentWithConfig } from '@/types';
import { Capacitor } from '@capacitor/core';

type ApiRequestOptions = RequestInit & {
  /** Disable error-store capture for background polling where transient failures are expected. */
  captureErrors?: boolean;
  /** Retry network-level fetch failures once. HTTP failures still return immediately. */
  retryNetwork?: boolean;
  retryDelayMs?: number;
};

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
  options: ApiRequestOptions = {},
  _isRetry = false,
): Promise<ApiResult<T>> {
  const {
    captureErrors = true,
    retryNetwork = false,
    retryDelayMs = 350,
    ...fetchOptions
  } = options;
  const token = getToken();
  const requestId = crypto.randomUUID();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-request-id': requestId,
    ...fetchOptions.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    const respTraceId = response.headers.get('x-trace-id');
    if (respTraceId) {
      void import('@/lib/client-log-ship').then(({ setClientTraceContext }) => {
        setClientTraceContext({ requestId, traceId: respTraceId });
      });
    }

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
        return { success: false, error: text || `Request failed (${response.status})`, status: response.status };
      }
      // If somehow OK but not JSON, treat as empty
      data = {};
    }

    if (!response.ok) {
      const errorMsg = (data.error as string) || `Request failed (${response.status})`;
      // Capture API errors in the debug store
      if (captureErrors) {
        try {
          const { useErrorStore } = await import('@/stores/errorStore');
          useErrorStore.getState().capture({
            source: 'api',
            message: errorMsg,
            context: {
              endpoint,
              status: response.status,
              response: data,
              requestId,
              kind: 'http',
            },
          });
        } catch { /* errorStore not loaded yet during startup */ }
      }
      return { success: false, error: errorMsg, status: response.status, data };
    }

    return { success: true, data: data as T };
  } catch (error) {
    if (retryNetwork && !_isRetry) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return request<T>(endpoint, options, true);
    }

    const errorMsg = error instanceof Error ? error.message : 'Network error';
    if (captureErrors) {
      try {
        const { useErrorStore } = await import('@/stores/errorStore');
        useErrorStore.getState().capture({
          source: 'api',
          message: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
          context: {
            endpoint,
            requestId,
            kind: 'network',
            online: navigator.onLine,
          },
        });
      } catch { /* errorStore not loaded yet during startup */ }
    }
    return { success: false, error: errorMsg };
  }
}

export function isAuthRevokedResult(result: ApiResult<unknown>): boolean {
  return !result.success && result.status === 401;
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
  const redirectOrigin = Capacitor.isNativePlatform()
    ? 'construct://auth'
    : window.location.origin;
  const redirect = encodeURIComponent(redirectOrigin);
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

export async function getMe(): Promise<ApiResult<{ user: User; token?: string }>> {
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

export interface OnboardingState {
  onboardingCompleted: boolean;
  profile: import('@/lib/onboarding').OnboardingProfile;
  progress: import('@/lib/onboarding').OnboardingProgress;
}

export async function getOnboarding(): Promise<ApiResult<OnboardingState>> {
  return request('/auth/onboarding');
}

export async function patchOnboarding(body: {
  profile?: Partial<import('@/lib/onboarding').OnboardingProfile>;
  progress?: Partial<import('@/lib/onboarding').OnboardingProgress>;
}): Promise<ApiResult<OnboardingState>> {
  return request('/auth/onboarding', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function completeOnboarding(body: {
  profile: import('@/lib/onboarding').OnboardingProfile;
  progress: import('@/lib/onboarding').OnboardingProgress;
}): Promise<ApiResult<{
  user: User;
  profile: import('@/lib/onboarding').OnboardingProfile;
  progress: import('@/lib/onboarding').OnboardingProgress;
}>> {
  return request('/auth/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function trackOnboardingEvent(body: {
  event: string;
  step?: number;
  demoId?: string;
  integration?: string;
}): Promise<ApiResult<{ ok: boolean }>> {
  return request('/auth/onboarding/event', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function recommendOnboardingIntegrations(
  profile: import('@/lib/onboarding').OnboardingProfile,
): Promise<ApiResult<{
  candidates: Array<{
    slug: string;
    label: string;
    tagline: string;
    logo: string;
    auth_schemes?: string[];
  }>;
  rankedPool: string[];
  cached?: boolean;
  catalog_size?: number;
}>> {
  return request('/auth/onboarding/integration-recommendations', {
    method: 'POST',
    body: JSON.stringify({ profile }),
  });
}

export interface NativePushTokenRecord {
  id: string;
  platform: 'ios' | 'android' | 'web';
  deviceId: string | null;
  deviceLabel: string | null;
  appVersion: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
}

export interface AuthSessionRecord {
  id: string;
  current: boolean;
  surface: 'web' | 'mobile_app' | 'desktop_app' | 'telegram_mini' | string;
  deviceType: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  location: string | null;
  timezone: string | null;
  online: boolean;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
}

export async function listAuthSessions(): Promise<ApiResult<{
  onlineWindowMs: number;
  currentSessionId: string | null;
  sessions: AuthSessionRecord[];
}>> {
  return request('/devices/sessions', {
    captureErrors: false,
    retryNetwork: true,
  });
}

export async function heartbeatAuthSession(input: {
  surface?: 'web' | 'mobile_app' | 'desktop_app' | 'telegram_mini';
  deviceId?: string;
  deviceLabel?: string;
  userAgent?: string;
}): Promise<ApiResult<{ ok: boolean; legacy?: boolean }>> {
  return request('/devices/sessions/heartbeat', {
    method: 'POST',
    body: JSON.stringify(input),
    captureErrors: false,
    retryNetwork: true,
  });
}

export async function revokeAuthSession(id: string): Promise<ApiResult<{ ok: boolean; revoked: number }>> {
  return request(`/devices/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    captureErrors: false,
    retryNetwork: true,
  });
}

export async function removeLoggedOutAuthSession(id: string): Promise<ApiResult<{ ok: boolean; deleted: number }>> {
  return request(`/devices/sessions/${encodeURIComponent(id)}/record`, {
    method: 'DELETE',
    captureErrors: false,
    retryNetwork: true,
  });
}

export async function revokeOtherAuthSessions(): Promise<ApiResult<{ ok: boolean; revoked: number }>> {
  return request('/devices/sessions/others', {
    method: 'DELETE',
    captureErrors: false,
    retryNetwork: true,
  });
}

export interface RegisterNativePushTokenInput {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  deviceLabel?: string;
  appVersion?: string;
}

export async function registerNativePushToken(
  input: RegisterNativePushTokenInput,
): Promise<ApiResult<{ ok: boolean; token: NativePushTokenRecord }>> {
  return request('/devices/push-tokens', {
    method: 'POST',
    body: JSON.stringify(input),
    captureErrors: false,
    retryNetwork: true,
  });
}

export async function unregisterNativePushToken(token: string): Promise<ApiResult<{ ok: boolean }>> {
  return request('/devices/push-tokens', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
    captureErrors: false,
    retryNetwork: true,
  });
}

export async function checkAgentEmailAvailability(_instanceId: string, username: string): Promise<ApiResult<{ available: boolean; username?: string; reason?: string; suggestion?: string }>> {
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
  browser_use_api_key: string;
  agentmail_api_key: string;
  agentmail_inbox_username: string;
  model: string;
  owner_name: string;
  agent_name: string;
  timezone: string;
  has_api_key: boolean;
  has_telegram_token: boolean;
  has_browser_use_key: boolean;
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
  browser_use_api_key?: string;
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
  hasComposioBrowser: boolean;
  hasAgentmailKey: boolean;
  /** Whether the platform provides shared API keys (zero-config fallback). */
  platformKeys?: {
    hasOpenrouter: boolean;
    hasComposioBrowser: boolean;
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

export interface SessionEventRow {
  id: number;
  session_key: string;
  event_type: string;
  /** Raw JSON of the original broadcast message (includes sessionKey,
   *  subagentId, and the event-specific payload). */
  payload_json: string;
  subagent_id?: string | null;
  created_at: number;
}

export interface TerminalRunRow {
  tool_call_id: string;
  session_key?: string | null;
  terminal_id?: string | null;
  sandbox_instance_id?: string | null;
  subagent_id?: string | null;
  correlation_id?: string | null;
  command: string;
  status: 'running' | 'completed' | 'failed';
  started_at: number;
  ended_at?: number | null;
  exit_code?: number | null;
  duration_ms?: number | null;
  stdout_bytes?: number | null;
  stderr_bytes?: number | null;
  output_bytes?: number | null;
  output_ref?: string | null;
  preview?: string | null;
  created_at?: number;
  updated_at?: number;
}

export async function getAgentHistory(_instanceId: string, sessionKey = 'ws_default'): Promise<ApiResult<{
  session_key: string;
  messages: Array<{
    role: string;
    content: string | null;
    created_at: number;
    tool_name?: string | null;
    tool_call_id?: string | null;
    /** Legacy OpenAI-style parsed tool_calls (client-side reconstruction). */
    tool_calls?: Array<{
      type: string;
      function: { name: string; arguments: string };
    }>;
    /** Raw JSON string as stored by the DO for role='tool_call' rows. */
    tool_calls_json?: string | null;
    metadata?: string | Record<string, unknown>;
  }>;
  /** Durable event log for reconstructing ephemeral UI cards (child
   *  spawn/complete, orchestration, research checkpoints, etc.). */
  events?: SessionEventRow[];
  terminal_runs?: TerminalRunRow[];
  incidents?: Array<{
    incident_id: string;
    severity: 'info' | 'warn' | 'error';
    kind: string;
    scope: string;
    recoverability: string;
    message: string;
    technical_detail?: string | null;
    action_taken?: string | null;
    next_step?: string | null;
    user_visible?: number | boolean | null;
    correlation_id?: string | null;
    tool_call_id?: string | null;
    tool_name?: string | null;
    resolved_at?: number | null;
    created_at: number;
  }>;
  operation_metadata?: OperationMeta[];
}>> {
  return request(`/agent/history?session_key=${encodeURIComponent(sessionKey)}`);
}

export async function getTerminalRuns(sessionKey: string, opts?: {
  terminalId?: string;
  status?: 'running' | 'completed' | 'failed';
  limit?: number;
}): Promise<ApiResult<{ runs: TerminalRunRow[] }>> {
  const params = new URLSearchParams({ session_key: sessionKey });
  if (opts?.terminalId) params.set('terminal_id', opts.terminalId);
  if (opts?.status) params.set('status', opts.status);
  if (opts?.limit) params.set('limit', String(opts.limit));
  return request(`/agent/terminal/runs?${params.toString()}`);
}

export async function getTerminalRunOutput(toolCallId: string): Promise<ApiResult<{
  tool_call_id: string;
  output: string;
  output_ref?: string | null;
  truncated?: boolean;
}>> {
  return request(`/agent/terminal/runs/${encodeURIComponent(toolCallId)}/output`);
}

export async function getToolResultOutput(toolCallId: string): Promise<ApiResult<{
  tool_call_id: string;
  output: string;
  truncated?: boolean;
  total_chars?: number;
}>> {
  return request(`/agent/tool-results/${encodeURIComponent(toolCallId)}/output`);
}

export async function confirmWorkSideEffect(
  sideEffectId: number,
  input: { sessionKey: string; summary?: string },
): Promise<ApiResult<{ ok: boolean }>> {
  return request(`/agent/autopilot/work-side-effects/${sideEffectId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

/** Shape of one entry in the DO's live session snapshot (mirrors
 *  `SessionLiveStatus` in worker). Used by the frontend to hydrate
 *  `activeSessions` on mount so sidebar dots reflect running state
 *  even after a page reload. */
export interface ActiveSessionSnapshot {
  sessionKey: string;
  startedAt: number;
  lastHeartbeatAt: number;
  lastProgressAt?: number;
  progressReason?: string | null;
  activeToolName?: string | null;
  lastIteration: number;
  lastToolName: string | null;
  interruptRequested: boolean;
  pendingInjectionCount: number;
  elapsedMs: number;
  idleMs: number;
}

/**
 * Fetch the live in-memory session state from the DO. Unlike
 * `getAgentSessions` (which returns the persisted sessions table), this
 * returns the transient execution snapshot — only sessions with a loop
 * currently running will appear.
 */
export async function getActiveAgentSessions(): Promise<ApiResult<{
  sessions: ActiveSessionSnapshot[];
}>> {
  return request(`/agent/active-sessions`);
}

export type AutopilotMode = 'idle' | 'running' | 'blocked' | 'recovering' | 'degraded';
export type AutopilotVerificationStatus = 'not_required' | 'pending' | 'verified' | 'blocked';

export interface AutopilotRunSnapshot {
  runId: string;
  sessionKey: string;
  status: string;
  reason: string | null;
  startedAt: number;
  lastHeartbeatAt: number;
  completedAt: number | null;
  lastIteration: number;
  lastToolName: string | null;
  activeToolName: string | null;
  progressReason: string | null;
  elapsedMs: number;
  idleMs: number;
}

export interface AutopilotTaskSnapshot {
  id: number;
  title: string;
  status: string;
  parentTaskId: number | null;
  updatedAt: number | null;
  createdAt: number | null;
}

export interface AutopilotBackgroundAgentSnapshot {
  childId: string;
  agentType: string;
  task: string;
  status: string;
  lastHeartbeatAt: number | null;
  createdAt: number;
  completedAt: number | null;
}

export interface AutopilotIncidentSnapshot {
  incidentId: string;
  severity: string;
  kind: string;
  recoverability: string;
  message: string;
  toolName: string | null;
  sessionKey: string | null;
  createdAt: number;
}

export interface AutopilotControlEventSnapshot {
  sessionKey: string;
  action: string;
  actor: string;
  message: string | null;
  createdAt: number;
}

export interface AutopilotAutonomyGateSnapshot {
  sessionKey: string;
  tool: string;
  toolCallId: string | null;
  decision: string;
  reason: string | null;
  risk: string;
  riskLevel: string;
  mode: string;
  budget: Record<string, unknown> | null;
  createdAt: number;
}

export interface AutopilotWorkSideEffectSnapshot {
  id: number;
  sessionKey: string;
  toolCallId: string | null;
  toolName: string;
  riskKind: string;
  riskLevel: string;
  status: string;
  summary: string;
  confirmation: string | null;
  createdAt: number;
  updatedAt: number | null;
}

export interface AutopilotWorkVerificationSnapshot {
  id: number;
  sessionKey: string;
  toolCallId: string | null;
  toolName: string | null;
  status: string;
  summary: string;
  evidence: string | null;
  createdAt: number;
}

export interface AutopilotWorkOrderSnapshot {
  id: string;
  sessionKey: string;
  sourceType: string;
  sourceId: string | null;
  requesterRole: string;
  objective: string;
  riskLevel: string;
  status: string;
  blockerReason: string | null;
  stepCount: number;
  artifactCount: number;
  deliveryCount: number;
  verificationCount: number;
  latestStepTitle: string | null;
  latestStepStatus: string | null;
  latestArtifactPath: string | null;
  latestDeliveryChannel: string | null;
  latestDeliveryStatus: string | null;
  latestVerificationStatus: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  activityHint?: string;
  stalled?: boolean;
}

export interface WorkOrderStepDetail {
  id: number;
  title: string;
  status: string;
  toolName: string | null;
  toolCallId: string | null;
  evidence: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkOrderDeliveryDetail {
  id: number;
  channel: string;
  recipient: string | null;
  status: string;
  confirmation: string | null;
  sentAt: number | null;
  createdAt: number;
}

export interface WorkOrderArtifactDetail {
  id: number;
  path: string;
  artifactType: string | null;
  description: string | null;
  createdAt: number;
}

export interface WorkOrderVerificationDetail {
  id: number;
  verificationType: string;
  status: string;
  evidence: string | null;
  createdAt: number;
}

export interface WorkOrderLinkedRunDetail {
  runId: string | null;
  status: string | null;
  progressReason: string | null;
  lastToolName: string | null;
  activeToolName: string | null;
  lastIteration: number;
  elapsedMs: number;
  idleMs: number;
  lastHeartbeatAt: number | null;
}

export interface WorkOrderBackgroundAgentDetail {
  childId: string;
  agentType: string;
  task: string;
  status: string;
  lastHeartbeatAt: number | null;
  createdAt: number;
  completedAt: number | null;
  error: string | null;
}

export interface WorkOrderDetail {
  workOrder: AutopilotWorkOrderSnapshot & { activityHint: string; stalled: boolean };
  steps: WorkOrderStepDetail[];
  deliveries: WorkOrderDeliveryDetail[];
  artifacts: WorkOrderArtifactDetail[];
  verifications: WorkOrderVerificationDetail[];
  linkedRun: WorkOrderLinkedRunDetail | null;
  backgroundAgents: WorkOrderBackgroundAgentDetail[];
  generatedAt: number;
}

export interface WorkOrderActivityUpdate {
  id: string;
  sessionKey: string;
  objective: string;
  status: string;
  blockerReason: string | null;
  activityHint: string;
  stalled: boolean;
  updatedAt: number;
  completedAt: number | null;
}

export async function listAgentTasks(
  status: 'active' | 'all' = 'all',
): Promise<ApiResult<{ tasks: Array<AutopilotWorkOrderSnapshot & { activityHint: string; stalled: boolean }>; generatedAt: number }>> {
  return request(`/agent/tasks?status=${encodeURIComponent(status)}`, { captureErrors: false, retryNetwork: true });
}

export async function getAgentTaskDetail(
  workOrderId: string,
): Promise<ApiResult<WorkOrderDetail>> {
  return request(`/agent/tasks/${encodeURIComponent(workOrderId)}`, { captureErrors: false, retryNetwork: true });
}

export interface AutopilotToolReliabilitySnapshot {
  sessionKey: string;
  providerKey: string;
  toolName: string;
  operationKey: string | null;
  status: 'blocked' | 'degraded';
  problemCount: number;
  errorClasses: string[];
  summary: string;
  recoveryHint: string | null;
  createdAt: number;
}

export interface AutopilotDecisionSnapshot {
  id: number;
  sessionKey: string;
  decisionKey: string;
  category: string;
  source: string;
  confidence: number;
  summary: string;
  chosenValue: string | null;
  reusable: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AutopilotLearnedPolicySnapshot {
  id: number;
  sessionKey: string | null;
  policyKey: string;
  scope: string;
  scopeValue: string | null;
  confidence: number;
  summary: string;
  policyValue: string | null;
  provenance: Record<string, unknown> | null;
  updatedAt: number;
  expiresAt: number | null;
  displayTitle: string;
  displayDescription: string;
  displayScopeLabel: string;
  strength: 'strong' | 'likely' | 'tentative';
  strengthLabel: string;
  agentInstruction: string;
}

export interface LearnedPoliciesListResponse {
  policies: AutopilotLearnedPolicySnapshot[];
  count: number;
  generatedAt: number;
}

export interface AutopilotScheduledWorkSnapshot {
  id: string;
  title: string;
  status: string;
  sessionKey: string | null;
  timezone: string | null;
  recurrenceRule: string | null;
  startTime: string;
  nextFireTime: string | null;
  lastFireTime: string | null;
  objective: string;
  deliveryChannel: string | null;
  deliveryRecipient: string | null;
  artifactRoot: string | null;
  overlapPolicy: string | null;
  misfirePolicy: string | null;
  requiredCapabilities: string[];
  preauthorizedActions: string[];
  verificationPolicy: Record<string, unknown> | null;
  failurePolicy: Record<string, unknown> | null;
  lastOccurrenceId: string | null;
  lastOccurrenceStatus: string | null;
  lastOccurrenceAt: string | null;
  lastOccurrenceSummary: string | null;
  lastOccurrenceError: string | null;
  updatedAt: number;
}

export type AutonomyPolicyDecision = 'allow' | 'ask' | 'deny';
export type AutonomyRiskKind =
  | '*'
  | 'read'
  | 'compute'
  | 'workspace_write'
  | 'automation'
  | 'external_write'
  | 'communication'
  | 'destructive'
  | 'credential'
  | 'financial'
  | 'browser';
export type AutonomyRiskLevel = '*' | 'low' | 'medium' | 'high' | 'critical';

export interface AutonomyPolicyRule {
  id: number;
  tool_pattern: string;
  risk_kind: AutonomyRiskKind;
  risk_level: AutonomyRiskLevel;
  decision: AutonomyPolicyDecision;
  reason?: string | null;
  created_at: number;
}

export interface AutopilotGoalSnapshot {
  goalId: string;
  runId: string | null;
  sessionKey: string;
  title: string;
  status: string;
  successCriteria: string | null;
  currentActionId: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  lastError: string | null;
  verificationStatus: AutopilotVerificationStatus;
  verificationSummary: string | null;
  verifiedAt: number | null;
}

export interface AutopilotActionSnapshot {
  actionId: string;
  goalId: string;
  runId: string | null;
  sessionKey: string;
  title: string;
  status: string;
  toolName: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt: number | null;
  retryReady: boolean;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface AutopilotBlockerSnapshot {
  blockerId: string;
  goalId: string;
  actionId: string | null;
  sessionKey: string;
  kind: string;
  status: string;
  summary: string;
  requiredFrom: string | null;
  sourceId?: string | null;
  sourceKind?: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface AutopilotStatus {
  mode: AutopilotMode;
  summary: string;
  activeRunCount: number;
  activeGoalCount: number;
  openBlockerCount: number;
  pendingActionCount: number;
  retryingActionCount: number;
  deadLetterCount: number;
  verificationPendingCount: number;
  unresolvedSideEffectCount: number;
  latestUnresolvedSideEffect?: AutopilotWorkSideEffectSnapshot | null;
  blockedToolProviderCount: number;
  degradedToolProviderCount: number;
  activeDecisionCount: number;
  activeWorkOrderCount?: number;
  blockedWorkOrderCount?: number;
  learnedPolicyCount?: number;
  activeScheduledWorkCount?: number;
  activeTaskCount: number;
  blockedTaskCount: number;
  activeBackgroundAgentCount: number;
  pendingApprovalCount: number;
  runs: AutopilotRunSnapshot[];
  goals: AutopilotGoalSnapshot[];
  actions: AutopilotActionSnapshot[];
  blockers: AutopilotBlockerSnapshot[];
  tasks: AutopilotTaskSnapshot[];
  backgroundAgents: AutopilotBackgroundAgentSnapshot[];
  incidents: AutopilotIncidentSnapshot[];
  controlEvents: AutopilotControlEventSnapshot[];
  autonomyGates: AutopilotAutonomyGateSnapshot[];
  workSideEffects: AutopilotWorkSideEffectSnapshot[];
  workVerifications: AutopilotWorkVerificationSnapshot[];
  workOrders?: AutopilotWorkOrderSnapshot[];
  scheduledWork?: AutopilotScheduledWorkSnapshot[];
  toolReliability: AutopilotToolReliabilitySnapshot[];
  decisions: AutopilotDecisionSnapshot[];
  learnedPolicies?: AutopilotLearnedPolicySnapshot[];
  latestMessageAt: number | null;
  pausedSessionCount: number;
  highAutonomyEnabled: boolean;
  generatedAt: number;
}

export async function getAutopilotStatus(): Promise<ApiResult<AutopilotStatus>> {
  return request(`/agent/autopilot`, { captureErrors: false, retryNetwork: true });
}

export interface AutopilotPolicy {
  autonomyMode?: 'standard';
  highAutonomyEnabled?: boolean;
  rules: AutonomyPolicyRule[];
}

export async function getAutopilotPolicy(): Promise<ApiResult<AutopilotPolicy>> {
  return request(`/agent/autopilot/policy`, { captureErrors: false, retryNetwork: true });
}

export async function updateAutopilotPolicy(
  update: { highAutonomyEnabled: boolean },
): Promise<ApiResult<AutopilotPolicy & { ok: boolean }>> {
  return request(`/agent/autopilot/policy`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

export async function addAutopilotPolicyRule(rule: {
  toolPattern?: string;
  riskKind?: AutonomyRiskKind;
  riskLevel?: AutonomyRiskLevel;
  decision: AutonomyPolicyDecision;
  reason?: string;
}): Promise<ApiResult<{ ok: boolean; rule: AutonomyPolicyRule; rules: AutonomyPolicyRule[] }>> {
  return request(`/agent/autopilot/policy/rules`, {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function deleteAutopilotPolicyRule(
  id: number,
): Promise<ApiResult<{ ok: boolean; rules: AutonomyPolicyRule[] }>> {
  return request(`/agent/autopilot/policy/rules/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
}

export async function getLearnedPolicies(): Promise<ApiResult<LearnedPoliciesListResponse>> {
  return request(`/agent/autopilot/learned-policies`, { captureErrors: false, retryNetwork: true });
}

export async function expireLearnedPolicy(
  id: number,
): Promise<ApiResult<{ ok: boolean; policy: AutopilotLearnedPolicySnapshot }>> {
  return request(`/agent/autopilot/learned-policies/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
}

export type AutopilotWorkOrderControlSnapshot = Pick<
  AutopilotWorkOrderSnapshot,
  'id' | 'sessionKey' | 'objective' | 'riskLevel' | 'status' | 'blockerReason' | 'updatedAt' | 'completedAt'
>;

export async function resolveWorkOrderBlocker(
  id: string,
): Promise<ApiResult<{ ok: boolean; workOrder: AutopilotWorkOrderControlSnapshot }>> {
  return request(`/agent/autopilot/work-orders/${encodeURIComponent(id)}/resolve-blocker`, {
    method: 'POST',
  });
}

export async function cancelWorkOrder(
  id: string,
): Promise<ApiResult<{ ok: boolean; workOrder: AutopilotWorkOrderControlSnapshot }>> {
  return request(`/agent/autopilot/work-orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function dismissChecklistTask(
  id: number,
): Promise<ApiResult<{ ok: boolean; task: { id: number; title: string; status: string; updatedAt: number } }>> {
  return request(`/agent/autopilot/checklist-tasks/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
}

export async function clearBlockedChecklistTasks(): Promise<ApiResult<{ ok: boolean; clearedCount: number }>> {
  return request('/agent/autopilot/checklist-tasks/blocked', {
    method: 'DELETE',
  });
}

export async function retryAutopilotAction(actionId: string): Promise<ApiResult<{
  ok: boolean;
  actionId: string;
  goalId: string;
  sessionKey: string;
  nextRunAt: number;
  maxAttempts: number;
}>> {
  return request(`/agent/autopilot/actions/${encodeURIComponent(actionId)}/retry`, {
    method: 'POST',
  });
}

export type PendingUserActionKind = 'approval' | 'auth' | 'question';
export type PendingUserActionStatus = 'pending' | 'resolved' | 'expired';

export interface PendingUserAction {
  id: string;
  userId: string;
  kind: PendingUserActionKind;
  sourceId: string;
  sessionKey: string;
  title: string;
  body: string;
  actionUrl: string;
  status: PendingUserActionStatus;
  metadata: Record<string, unknown>;
  notifyCount: number;
  maxNotifyCount: number;
  lastNotifiedAt: number | null;
  nextNotifyAt: number | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export async function getPendingUserActions(
  status: PendingUserActionStatus | 'all' = 'pending',
  limit = 25,
): Promise<ApiResult<{ actions: PendingUserAction[]; generatedAt: number }>> {
  const params = new URLSearchParams({ status, limit: String(limit) });
  return request(`/agent/pending-actions?${params.toString()}`, { captureErrors: false, retryNetwork: true });
}

export async function resendPendingUserAction(
  id: string,
): Promise<ApiResult<{ ok: boolean; action: PendingUserAction }>> {
  return request(`/agent/pending-actions/${encodeURIComponent(id)}/resend`, {
    method: 'POST',
  });
}

export async function resolvePendingUserAction(
  id: string,
  status: PendingUserActionStatus = 'resolved',
): Promise<ApiResult<{ ok: boolean; id: string; status: PendingUserActionStatus }>> {
  return request(`/agent/pending-actions/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export async function resolvePendingUserActionBySource(
  input: {
    kind: PendingUserActionKind;
    sourceId: string;
    status?: PendingUserActionStatus;
    sessionKey?: string;
    name?: string;
  },
): Promise<ApiResult<{ ok: boolean; kind: PendingUserActionKind; sourceId: string; status: PendingUserActionStatus }>> {
  return request('/agent/pending-actions/resolve-source', {
    method: 'POST',
    body: JSON.stringify({
      kind: input.kind,
      sourceId: input.sourceId,
      status: input.status ?? 'resolved',
      sessionKey: input.sessionKey,
      name: input.name,
    }),
  });
}

export async function stopAgentSession(sessionKey: string): Promise<ApiResult<{
  ok: boolean;
  sessionKey: string;
  stopped: boolean;
}>> {
  return request(`/agent/sessions/${encodeURIComponent(sessionKey)}/stop`, { method: 'POST' });
}

export async function interruptAgentSession(
  sessionKey: string,
  message?: string,
  clientId?: string,
): Promise<ApiResult<{
  ok: boolean;
  sessionKey: string;
  interrupted: boolean;
  queued: boolean;
}>> {
  return request(`/agent/sessions/${encodeURIComponent(sessionKey)}/interrupt`, {
    method: 'POST',
    body: JSON.stringify({ message, clientId }),
  });
}

export async function continueAgentSession(sessionKey: string): Promise<ApiResult<{
  ok: boolean;
  sessionKey: string;
  queued?: boolean;
  reason?: string;
}>> {
  return request(`/agent/sessions/${encodeURIComponent(sessionKey)}/continue`, { method: 'POST' });
}

/**
 * Create a new chat session.
 */
export async function createAgentSession(_instanceId: string, title?: string, key?: string): Promise<ApiResult<SessionInfo>> {
  return request(`/agent/sessions`, {
    method: 'POST',
    body: JSON.stringify({ title, key }),
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

export async function listFiles(_instanceId: string, path = '/'): Promise<ApiResult<FileListResponse>> {
  return request(`/files?path=${encodeURIComponent(path)}`);
}

export interface FileContentResponse {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  binary?: boolean;
  truncated?: boolean;
  size?: number;
  modified?: string;
  revision?: string;
  mimeType?: string;
}

export interface FileMetaResponse {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  revision: string;
  mimeType: string;
}

export async function readFile(_instanceId: string, path: string): Promise<ApiResult<FileContentResponse>> {
  return request(`/files/content?path=${encodeURIComponent(path)}&encoding=utf8`);
}

export async function readFileBase64(_instanceId: string, path: string): Promise<ApiResult<FileContentResponse>> {
  return request(`/files/content?path=${encodeURIComponent(path)}&encoding=base64`);
}

export async function getFileMeta(_instanceId: string, path: string): Promise<ApiResult<FileMetaResponse>> {
  return request(`/files/meta?path=${encodeURIComponent(path)}`);
}

/**
 * Download a binary file from the durable R2 workspace. The legacy function
 * name is kept because file-browser callers still use it.
 * Returns the raw Response
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
 * Fetch a generated preview object inline. Falls back to the same auth refresh
 * handling as downloads, but uses the preview route for hidden frame assets.
 */
export async function previewContainerFile(_instanceId: string, path: string): Promise<Response> {
  const url = `${API_BASE_URL}/files/preview?path=${encodeURIComponent(path)}`;
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

export async function blobContainerFile(
  _instanceId: string,
  path: string,
  disposition: 'inline' | 'attachment' = 'inline',
): Promise<Response> {
  const url = `${API_BASE_URL}/files/blob?path=${encodeURIComponent(path)}&disposition=${disposition}`;
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

export interface ConvertedPreviewFrame {
  previewPath: string;
  contentType?: string;
  pageIndex?: number;
  label?: string;
  size?: number;
}

export async function convertContainerFilePreview(
  _instanceId: string,
  path: string,
  maxPages = 12,
): Promise<ApiResult<{ path: string; frames: ConvertedPreviewFrame[] }>> {
  return request('/files/convert-preview', {
    method: 'POST',
    body: JSON.stringify({ path, maxPages }),
  });
}

/**
 * Upload a binary file (e.g. from drag-and-drop) into the durable R2 workspace.
 * The legacy function name is kept because file-browser callers still use it.
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

export async function writeFile(
  _instanceId: string,
  path: string,
  content: string,
  expectedRevision?: string,
): Promise<ApiResult<{ status: string; path: string; revision?: string }>> {
  return request(`/files/content`, {
    method: 'PUT',
    body: JSON.stringify({ path, content, encoding: 'utf8', expectedRevision }),
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

export async function copyToLocal(instanceId: string, driveFileId: string, workspacePath: string): Promise<ApiResult<{ status: string; path?: string }>> {
  return request('/drive/copy-to-local', {
    method: 'POST',
    body: JSON.stringify({ driveFileId, instanceId, destPath: workspacePath }),
  });
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

export async function getComposioAuthUrl(toolkit: string, sessionKey?: string): Promise<ApiResult<{
  url?: string;
  connected_account_id?: string;
  expiresAt?: number;
  error?: string;
  code?: 'OAUTH_UNAVAILABLE' | 'OAUTH_NOT_MANAGED' | 'PLAN_UPGRADE_REQUIRED' | string;
  availableSchemes?: string[];
  managedSchemes?: string[];
}>> {
  const params = sessionKey ? `?session_key=${encodeURIComponent(sessionKey)}` : '';
  return request(`/composio/${encodeURIComponent(toolkit)}/auth-url${params}`);
}

/** Initiate a connection for any auth scheme. For OAUTH2 returns a redirect URL;
 *  for API_KEY/BEARER_TOKEN/BASIC/NO_AUTH creates the connected account directly. */
export async function composioConnect(
  toolkit: string,
  authScheme: string,
  fields: Record<string, string> = {},
): Promise<ApiResult<{ requiresOAuth: boolean; url?: string; connected_account_id?: string; expiresAt?: number; ok?: boolean; error?: string }>> {
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

export interface ComposioToolkitSummary {
  slug: string;
  name: string;
  description: string;
  logo?: string;
  auth_schemes?: string[];
  no_auth?: boolean;
  tools_count?: number;
  categories?: Array<{ name: string; slug: string }>;
  requiresUpgrade?: boolean;
  available?: boolean;
  connectable?: boolean;
}

export interface ComposioCategorySummary {
  id: string;
  name: string;
}

export async function listComposioCategories(opts?: { refresh?: boolean }): Promise<ApiResult<{
  categories: ComposioCategorySummary[];
  total_items: number;
  cached?: boolean;
  degraded?: boolean;
}>> {
  const params = opts?.refresh ? '?refresh=1' : '';
  return request(`/composio/categories${params}`);
}

export async function listComposioCatalog(opts?: { refresh?: boolean }): Promise<ApiResult<{
  toolkits: ComposioToolkitSummary[];
  total_items: number;
  catalog_complete?: boolean;
  pages_fetched?: number;
  cached?: boolean;
  degraded?: boolean;
}>> {
  const params = opts?.refresh ? '?refresh=1' : '';
  return request(`/composio/catalog${params}`);
}

export async function searchComposioToolkits(query: string): Promise<ApiResult<{ 
  toolkits: ComposioToolkitSummary[];
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

export type ComposioToolkitAuthMeta = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  auth_schemes: string[];
  auth_config?: Array<{
    mode: string;
    fields: Array<{ name: string; displayName: string; description?: string; required: boolean }>;
  }>;
  composio_managed_schemes?: string[];
};

export async function getComposioToolkitAuthMeta(toolkit: string): Promise<ApiResult<ComposioToolkitAuthMeta>> {
  return request(`/composio/${encodeURIComponent(toolkit)}/auth-meta`);
}

export async function batchGetComposioToolkitAuthMeta(slugs: string[]): Promise<ApiResult<{
  toolkits: ComposioToolkitAuthMeta[];
}>> {
  return request('/composio/toolkits/auth-meta', {
    method: 'POST',
    body: JSON.stringify({ slugs }),
  });
}

export async function getComposioToolkitDetail(toolkit: string): Promise<ApiResult<{
  slug: string;
  name: string;
  description: string;
  logo: string;
  documentation?: string;
  categories: Array<{ name: string; slug: string }>;
  tools_count: number;
  no_auth?: boolean;
  auth_schemes: string[];
  auth_config?: Array<{
    mode: string;
    fields: Array<{ name: string; displayName: string; description?: string; required: boolean }>;
  }>;
  composio_managed?: boolean;
  composio_managed_schemes?: string[];
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
  connectedAt?: number;
  schemes: AppConnectionScheme[];
  error?: string;
}

export interface AppConnectResult {
  connected: boolean;
  activeScheme: AppAuthScheme;
  authorizationUrl?: string;
  connectionId?: string;
  connectedAt?: number;
}

export interface AppConnection {
  id: string;
  appId: string;
  appName: string;
  source?: 'registry_app' | 'custom_mcp' | 'composio' | 'byok';
  authType?: string;
  authLabel?: string;
  activeScheme: string;
  status: string;
  configuredAt?: number;
  connectedAt: number;
  updatedAt: number;
  endpoint?: string;
}

export type UrlAppAuthScheme = 'bearer' | 'api_key' | 'basic';

export interface UrlAppConnectionStatus {
  connected: boolean;
  connectionId?: string;
  activeScheme?: string;
  authLabel?: string;
  connectedAt?: number;
  updatedAt?: number;
  schemes: Array<{ type: string; label: string; available: boolean }>;
}

export interface ConnectUrlAppResult {
  connected: boolean;
  connectionId?: string;
  activeScheme?: string;
  appId?: string;
  connectedAt?: number;
  probeOk?: boolean;
  error?: string;
  auth_required?: boolean;
}

/**
 * Get available auth schemes for an app + current connection status.
 */
export async function getAppConnection(appId: string): Promise<ApiResult<AppConnectionStatus>> {
  return request<AppConnectionStatus>(`/apps/connect/${encodeURIComponent(appId)}`);
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
  /** User-authored agent instructions for schedule-backed events. */
  prompt?: string | null;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string;
  completedOccurrences: string[] | null;
  cancelledOccurrences: string[] | null;
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
  prompt: string;
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
  prompt?: string;
  description?: string;
  location?: string;
  start_datetime?: string;
  end_datetime?: string;
  start_date?: string;
  end_date?: string;
  time_zone?: string;
  all_day?: boolean;
  recurrence?: string[] | null;
  completedOccurrences?: string[] | null;
  cancelledOccurrences?: string[] | null;
  status?: string;
}): Promise<ApiResult<{ event: AgentCalendarEvent }>> {
  return request(`/calendar/agent/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export interface AgentSchedule {
  id: string;
  user_id: string;
  kind: 'event' | 'reminder' | 'task';
  title: string;
  description: string | null;
  prompt: string | null;
  timezone: string | null;
  start_time: string;
  end_time: string | null;
  recurrence_rule: string | null;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  session_key: string | null;
  source_context: string | null;
  overlap_policy: 'queue' | 'skip_if_running' | null;
  misfire_policy: 'coalesce' | 'run_all' | null;
  last_fire_time: string | null;
  next_fire_time: string | null;
  created_at: number;
  updated_at: number;
}

export async function listAgentSchedules(status = 'active'): Promise<ApiResult<{ schedules: AgentSchedule[] }>> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  return request(`/calendar/schedules?${params.toString()}`);
}

export async function completeAgentCalendarOccurrence(
  eventId: string,
  occurrenceStart: string,
): Promise<ApiResult<{ event: AgentCalendarEvent }>> {
  return request(`/calendar/agent/events/${encodeURIComponent(eventId)}/occurrences/complete`, {
    method: 'POST',
    body: JSON.stringify({ occurrenceStart }),
  });
}

export async function uncompleteAgentCalendarOccurrence(
  eventId: string,
  occurrenceStart: string,
): Promise<ApiResult<{ event: AgentCalendarEvent }>> {
  return request(`/calendar/agent/events/${encodeURIComponent(eventId)}/occurrences/uncomplete`, {
    method: 'POST',
    body: JSON.stringify({ occurrenceStart }),
  });
}

export async function deleteAgentCalendarEvent(
  eventId: string,
  options?: { scope?: 'series' | 'occurrence'; occurrenceStart?: string },
): Promise<ApiResult<{ status: string; event?: AgentCalendarEvent }>> {
  const params = new URLSearchParams();
  if (options?.scope === 'occurrence') {
    params.set('scope', 'occurrence');
    if (options.occurrenceStart) params.set('occurrence_start', options.occurrenceStart);
  }
  const qs = params.toString();
  return request(`/calendar/agent/events/${encodeURIComponent(eventId)}${qs ? `?${qs}` : ''}`, {
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

/**
 * Link the authenticated user's account to a Telegram user via Mini App initData.
 * Called after a user signs in (Google/email) from inside the Telegram Mini App.
 */
export async function linkTelegramMiniApp(initData: string): Promise<ApiResult<{ status: string }>> {
  return request('/telegram/mini-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
}

// Legacy stubs — kept so any old frontend code that references these doesn't break at import time.
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
// Memory API
// ============================================================================

export interface MemoryRecord {
  id: string;
  memory: string;
  hash?: string;
  created_at?: string;
  updated_at?: string;
  categories?: string[];
}

export interface MemoryRelation {
  source: string;
  source_type: string;
  relationship: string;
  target: string;
  target_type: string;
  score?: number;
}

export async function getMemories(): Promise<ApiResult<{ memories: MemoryRecord[]; relations: MemoryRelation[] }>> {
  return request('/memory/memories');
}

export async function deleteMemory(memoryId: string): Promise<ApiResult<{ success: boolean; message: string }>> {
  return request(`/memory/memories/${encodeURIComponent(memoryId)}`, { method: 'DELETE' });
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
  byokSettings?: ByokSettings;
  platformModelChoice?: {
    enabled: boolean;
    selectedModel: string | null;
  };
  planLimits?: {
    weeklyCapUsd?: number;
    sessionCapUsd?: number;
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
    sessionCapUsd: number;
    weeklyCapUsd: number;
  };
}

export type BillingPlanId = 'free' | 'starter' | 'pro';

export interface BillingPlanInfo {
  id: BillingPlanId;
  name: string;
  priceUsd: number;
  priceLabel: string;
  period: string;
  limits: {
    weeklyUsageRelativeToFree: number;
    sessionUsageRelativeToFree: number;
    mainTaskSteps: number;
    commandRuntimeSeconds: number;
    parallelWork: number;
    scheduledTasks: number;
    storageBytes: number;
    emailAddress: boolean;
    backgroundTasks: boolean;
  };
}

export interface CurrentUsage {
  plan?: string;
  allowed: boolean;
  reason?: string;
  weeklyPercentUsed: number;
  monthlyPercentUsed: number;
  sessionPercentUsed: number;
  sessionResetsAt: string;
  weeklyResetsAt: string;
  monthlyResetsAt: string;
  usingBonus?: boolean;
  hasBonusCredits?: boolean;
  /** True when the user's BYOK key is currently serving their traffic. */
  byokActive?: boolean;
  /** True when platform caps are exhausted and BYOK auto-fallback is active. */
  byokFallback?: boolean;
  environment?: string;
  weeklyUsedUsd?: number;
  /** Staging only */
  weeklyCapUsd?: number;
  /** Staging only */
  monthlyUsedUsd?: number;
  /** Staging only */
  monthlyCapUsd?: number;
  /** Staging only */
  sessionUsedUsd?: number;
  /** Staging only */
  sessionCapUsd?: number;
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

export async function getBillingPlans(): Promise<ApiResult<{ plans: BillingPlanInfo[]; environment?: string }>> {
  return request('/billing/plans');
}

export async function getCurrentUsage(): Promise<ApiResult<CurrentUsage>> {
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
    body: JSON.stringify({ plan, ...(coupon ? { discount_code: coupon } : {}) }),
  });
}

export async function validateDiscountCode(
  code: string,
): Promise<ApiResult<{ valid: boolean; reason?: string; unverified?: boolean }>> {
  return request(`/billing/discount/validate?code=${encodeURIComponent(code)}`);
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

// ── BYOK (Bring Your Own Key) Management ──

/**
 * BYOK modes mirror the backend:
 *   off        — stored key is ignored
 *   auto       — platform first, fall back to BYOK when platform caps hit
 *   exclusive  — always use BYOK; platform caps are skipped
 */
export type ByokMode = 'off' | 'auto' | 'exclusive';

export interface ByokSettings {
  hasKey: boolean;
  mode: ByokMode;
  model: string | null;
  weeklyLimitUsd: number | null;
  keyPreview: string | null;
  credits?: {
    usage?: number;
    limit?: number | null;
    is_free_tier?: boolean;
  } | null;
}

export interface ByokModel {
  id: string;
  label: string;
  pricing?: {
    input: number | null;
    output: number | null;
    cache: number | null;
  };
}

export interface PlatformModelOption {
  id: string;
  label: string;
  provider: string;
  contextWindow: number;
  reasoning: boolean;
  vision: boolean;
  pricing: {
    input: number;
    output: number;
    cache: number | null;
  };
}

export interface PlatformModelSettings {
  enabled: boolean;
  selectedModel: string | null;
  effectiveModel: string;
  defaultModel: string;
  options: PlatformModelOption[];
}

/** Fetch current BYOK settings + OpenRouter credits (if key is saved). */
export async function getByokSettings(): Promise<ApiResult<ByokSettings>> {
  return request('/billing/byok');
}

/**
 * Save a new OpenRouter API key. The backend validates it against
 * `https://openrouter.ai/api/v1/auth/key` before storing (encrypted).
 */
export async function saveByokKey(apiKey: string): Promise<ApiResult<ByokSettings>> {
  return request('/billing/byok/key', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
}

/** Remove the stored BYOK key and reset mode to 'off'. */
export async function deleteByokKey(): Promise<ApiResult<{ ok: boolean }>> {
  return request('/billing/byok/key', { method: 'DELETE' });
}

/** Patch BYOK settings (mode/model/weekly limit). */
export async function updateByokSettings(patch: {
  mode?: ByokMode;
  model?: string | null;
  weeklyLimitUsd?: number | null;
}): Promise<ApiResult<ByokSettings>> {
  return request('/billing/byok/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

/**
 * List OpenRouter models. Returns a `recommended` curated subset + the full
 * catalogue from https://openrouter.ai/api/v1/models (CF-cached for 1h).
 */
export async function listByokModels(): Promise<ApiResult<{ recommended: ByokModel[]; models: ByokModel[] }>> {
  return request('/billing/byok/models');
}

export async function getPlatformModelSettings(): Promise<ApiResult<PlatformModelSettings>> {
  return request('/billing/platform-model');
}

export async function updatePlatformModel(model: string | null): Promise<ApiResult<PlatformModelSettings & { ok: boolean }>> {
  return request('/billing/platform-model', {
    method: 'PUT',
    body: JSON.stringify({ model }),
  });
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
  /** false = installed from custom URL (not Construct registry); omit/true = registry-linked */
  registry_linked?: boolean;
  mcp_path?: string;
  connection_id?: string | null;
  /** false = app is installed but disabled (hidden from agent). Default true. */
  enabled?: boolean;
}

/** Enable or disable an installed app without uninstalling it. */
export async function toggleAppEnabled(
  appId: string,
  enabled: boolean,
): Promise<ApiResult<{ ok: boolean; enabled: boolean }>> {
  return request(`/apps/${encodeURIComponent(appId)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function listInstalledApps(): Promise<ApiResult<{ apps: InstalledApp[] }>> {
  return request('/apps');
}

/** Server-side MCP tools/list preview (SSRF-checked). */
export async function probeMcpFromUrl(
  url: string,
  mcp_path?: string,
  opts?: { use_stored_auth?: boolean },
): Promise<
  ApiResult<{
    ok: boolean;
    origin?: string;
    mcp_path?: string;
    app_id?: string;
    auth_required?: boolean;
    status?: number;
    connected?: boolean;
    tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
    tool_count?: number;
    transport?: 'json' | 'sse';
    content_type?: string;
    has_ui_guess?: boolean;
    error?: string;
  }>
> {
  return request('/apps/mcp-probe', {
    method: 'POST',
    body: JSON.stringify({
      url,
      mcp_path: mcp_path || undefined,
      use_stored_auth: opts?.use_stored_auth || undefined,
    }),
  });
}

/** Connect / rotate credentials for a custom URL MCP app. */
export async function connectUrlApp(opts: {
  url: string;
  mcp_path?: string;
  scheme: UrlAppAuthScheme;
  fields: Record<string, string>;
  app_id?: string;
}): Promise<ApiResult<ConnectUrlAppResult>> {
  return request('/apps/connect-url', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

/** Get connection status for a custom URL MCP app (metadata only). */
export async function getUrlAppConnection(appId: string): Promise<ApiResult<UrlAppConnectionStatus>> {
  return request(`/apps/connect-url/${encodeURIComponent(appId)}`);
}

/** Disconnect credentials for a custom URL MCP app. */
export async function disconnectUrlApp(appId: string): Promise<ApiResult<{ success: boolean }>> {
  return request(`/apps/connect-url/${encodeURIComponent(appId)}/disconnect`, {
    method: 'POST',
  });
}

/** Install an MCP server or hosted app from an HTTPS URL (no registry entry required). */
export async function installAppFromUrl(opts: {
  url: string;
  mcp_path?: string;
  name?: string;
  description?: string;
  has_ui?: boolean;
  icon_url?: string;
}): Promise<ApiResult<{ ok: boolean; app: InstalledApp }>> {
  return request('/apps/install-from-url', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
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
  return request('/files/usage', { captureErrors: false, retryNetwork: true });
}

/** Refresh cached tool definitions for an app. */
export async function refreshAppTools(appId: string): Promise<ApiResult<{ ok: boolean; tools: Array<{ name: string; description?: string }> }>> {
  return request(`/apps/${encodeURIComponent(appId)}/refresh-tools`, { method: 'POST' });
}

/** Check whether an installed app's UI blocks direct iframe embedding. */
export async function checkAppUiFrame(appId: string): Promise<ApiResult<{
  blocked: boolean;
  reason?: string | null;
  status?: number;
  content_type?: string;
  proxy_available?: boolean;
}>> {
  return request(`/apps/${encodeURIComponent(appId)}/ui-frame-check`);
}

// ── Browser Run History ──

export interface BrowserRunSummary {
  run_id: string;
  session_key: string | null;
  subagent_id: string | null;
  task: string | null;
  started_at: number;
  ended_at: number | null;
  status: 'running' | 'success' | 'error' | 'cancelled';
  cost_usd: number | null;
  step_count: number | null;
  /** browser-use live preview URL (live.browser-use.com iframe). Persisted so
   * past runs can be reopened for inspection even after the BrowserWindow
   * auto-closes. May be null for very old runs created before persistence. */
  live_url?: string | null;
}

export interface BrowserRunDetail {
  run: BrowserRunSummary & { final_text: string | null };
}

export async function listBrowserRuns(limit = 30): Promise<ApiResult<{ runs: BrowserRunSummary[] }>> {
  return request(`/browser/runs?limit=${limit}`);
}

export async function getBrowserRun(runId: string): Promise<ApiResult<BrowserRunDetail>> {
  return request(`/browser/runs/${encodeURIComponent(runId)}`);
}

export interface BrowserActiveSessionSummary {
  id: string;
  subagentId: string;
  streamUrl?: string;
  runId?: string;
  task?: string;
  status: 'starting' | 'running' | 'idle' | 'complete' | 'error' | 'expired';
  startedAt: number;
  expiresAt?: number;
  stepCount?: number;
  error?: string;
  files?: Array<{ name?: string; workspacePath: string; size?: number; contentType?: string }>;
  sessionKey?: string | null;
  kind?: string;
}

export async function listBrowserActiveSessions(): Promise<ApiResult<{ sessions: BrowserActiveSessionSummary[] }>> {
  return request('/browser/sessions');
}

export async function stopBrowserRun(runId: string): Promise<ApiResult<{ status: string; already?: string }>> {
  return request(`/browser/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' });
}

export async function stopBrowserSession(sessionId: string): Promise<ApiResult<{ status: string; stopped?: number; attempted?: number }>> {
  return request(`/browser/sessions/${encodeURIComponent(sessionId)}/stop`, { method: 'POST' });
}

export async function stopAllBrowserForSession(sessionKey: string): Promise<ApiResult<{ status: string; stopped: number; attempted: number }>> {
  return request(`/browser/stop-all-for-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionKey }),
  });
}

export async function stopAllBrowserForUser(): Promise<ApiResult<{ status: string; stopped: number; attempted: number }>> {
  return request('/browser/stop-all-for-user', { method: 'POST' });
}

// ── Local Apps ──

export interface LocalAppManifest {
  version: 2;
  name: string;
  description: string;
  icon?: string;
  iconBackground?: 'white' | 'green' | 'blue' | 'black';
  window: { width: number; height: number; minWidth?: number; minHeight?: number };
  ui: { renderer: 'construct-hosted'; spec: string; kit: 'construct-v2' };
  permissions?: {
    network?: string[];
    uses?: {
      tools?: string[];
      apps?: Array<{ app_id: string; tools: string[] }>;
      inference?: boolean;
    };
  };
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
}

export interface ConstructComponentAction {
  type: 'state.patch' | 'tool.call';
  patch?: Record<string, unknown>;
  tool?: string;
  args?: Record<string, unknown>;
}

export interface ConstructComponentNode {
  componentId: string;
  type: string;
  label?: string;
  props?: Record<string, unknown>;
  bindings?: Record<string, string>;
  actions?: Record<string, ConstructComponentAction>;
  children?: ConstructComponentNode[];
}

export interface ConstructAppSpec {
  schemaVersion: 1;
  appId: string;
  name: string;
  description?: string;
  theme?: { density?: 'compact' | 'comfortable' };
  layout: ConstructComponentNode[];
  data?: Record<string, unknown>;
}

export interface LocalApp {
  id: string;
  manifest: LocalAppManifest;
  icon_url?: string;
}

export async function listLocalApps(): Promise<ApiResult<{ apps: LocalApp[] }>> {
  return request('/apps/local-list');
}

export async function mintLocalAppToken(appId: string): Promise<ApiResult<{ token: string; appId: string; expiresIn: number }>> {
  return request(`/apps/local-token/${encodeURIComponent(appId)}`, { method: 'POST' });
}

export async function deleteLocalApp(appId: string): Promise<ApiResult<{ ok: boolean; appId: string; name?: string }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}`, { method: 'DELETE' });
}

export async function acceptLocalAppPreview(appId: string): Promise<ApiResult<{ ok: boolean }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/accept-preview`, { method: 'POST' });
}

export async function discardLocalAppPreview(appId: string): Promise<ApiResult<{ ok: boolean }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/discard-preview`, { method: 'POST' });
}

export async function getLocalAppPreviewStatus(appId: string): Promise<ApiResult<{ hasPreview: boolean; fileCount?: number; updatedAt?: string }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/preview-status`);
}

export async function getLocalAppSpec(appId: string, opts: { preview?: boolean } = {}): Promise<ApiResult<{ spec: ConstructAppSpec }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/spec${opts.preview ? '?preview=1' : ''}`);
}

export async function putLocalAppSpec(appId: string, spec: ConstructAppSpec, opts: { preview?: boolean } = {}): Promise<ApiResult<{ ok: boolean; spec: ConstructAppSpec }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/spec${opts.preview ? '?preview=1' : ''}`, {
    method: 'PUT',
    body: JSON.stringify({ spec }),
  });
}

export async function patchLocalAppComponent(
  appId: string,
  componentId: string,
  patch: Record<string, unknown>,
  opts: { preview?: boolean } = {},
): Promise<ApiResult<{ ok: boolean; spec: ConstructAppSpec }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/components/${encodeURIComponent(componentId)}${opts.preview ? '?preview=1' : ''}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getLocalAppState(appId: string): Promise<ApiResult<Record<string, unknown>>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/_state`);
}

export async function setLocalAppState(appId: string, state: Record<string, unknown>): Promise<ApiResult<{ ok: boolean; state?: Record<string, unknown> }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/_state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

export async function patchLocalAppState(appId: string, patch: Record<string, unknown>): Promise<ApiResult<{ ok: boolean; state: Record<string, unknown> }>> {
  return request(`/apps/local/${encodeURIComponent(appId)}/_state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
