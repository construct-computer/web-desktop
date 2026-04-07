/**
 * Types and interfaces extracted from agentStore.ts.
 *
 * Keeps the main store file focused on state and actions
 * while providing reusable type definitions.
 */

export interface AskUserOption {
  label: string;
  description?: string;
  value: string;
}

export interface AskUserData {
  questionId: string;
  question: string;
  options: AskUserOption[];
  allowCustom: boolean;
  /** Set after the user picks an option */
  selectedValue?: string;
}

export interface ChatMessage {
  role: 'user' | 'agent' | 'activity' | 'system';
  content: string;
  timestamp: Date;
  /** For activity messages: which tool triggered it */
  tool?: string;
  /** For activity messages: icon hint for rendering */
  activityType?: 'browser' | 'tinyfish' | 'terminal' | 'file' | 'desktop' | 'calendar' | 'tool' | 'delegation' | 'background' | 'delegation-group' | 'consultation-group' | 'background-group' | 'orchestration-group';
  /** True for error/stopped/iteration-limit messages — rendered with error styling */
  isError?: boolean;
  /** True specifically for user-initiated stop — rendered with muted styling instead of error red */
  isStopped?: boolean;
  /** For delegation-group/consultation-group/background-group messages: links to tracker operation */
  operationId?: string;
  /** Interactive question data (rendered as clickable option cards) */
  askUser?: AskUserData;
  /** File paths attached to this message (uploaded to workspace/uploads/) */
  attachments?: string[];
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  /** Window ID in the frontend windowStore (if one exists for this daemon tab). */
  windowId?: string;
  /** True if this tab was opened by a subagent's tool call. */
  isSubagent?: boolean;
  /** SubagentId that opened this tab (if any). */
  subagentId?: string;
  /** Workspace key for this tab (if assigned to a delegation workspace). */
  workspace?: string;
  /** Display label for subagent tabs. */
  subagentLabel?: string;
  /** Workspace ID (alias for workspace in some contexts). */
  workspaceId?: string;
  /** Whether this tab is currently active/focused. */
  active?: boolean;
}

export interface SystemStats {
  cpu?: number;
  cpuPercent?: number;
  cpuCount?: number;
  memory?: { used: number; total: number };
  memUsedBytes?: number;
  memTotalBytes?: number;
  disk?: { used: number; total: number };
  diskUsedBytes?: number;
  diskTotalBytes?: number;
  network?: { rx: number; tx: number };
  netInBytes?: number;
  netOutBytes?: number;
  netInSpeed?: number;
  netOutSpeed?: number;
  pids?: number;
  uptime?: number;
  [key: string]: unknown;
}

export interface TodoItem {
  id: string | number;
  title?: string;
  text?: string;
  done?: boolean;
  status?: string;
  category?: string;
}

export interface TodoListState {
  items: TodoItem[];
  title?: string;
  updatedAt?: number;
}

export interface BrowserState {
  url: string;
  title: string;
  screenshot: string | null;
  isLoading: boolean;
  connected: boolean;
  tabs: BrowserTab[];
  activeTabId: string | null;
  /** TinyFish live-stream URLs per subagentId */
  tinyfishStreams: Record<string, string>;
  /** The daemon's own view of which tab is "active" (may differ from frontend focus). */
  daemonActiveTabId: string | null;
  /** Subagent tab mapping: daemon index → { subagentId, workspace } */
  subagentTabMap: Record<number, { subagentId: string; workspace?: string; annotation?: string }>;
  /** Subagent annotation fallback: subagentId → { workspace, tabId } */
  subagentAnnotations: Record<string, { workspace?: string; tabId?: string }>;
  /** Pending workspace assignment for a browser session (set before tab reconciliation). */
  pendingBrowserSessionKey?: string;
  /** Tracks which daemon tabs have received at least one frame (for first-frame detection). */
  tabsWithFrames: Record<string, true>;
}

export interface PlatformAgentState {
  /** Whether the agent is currently running for this platform. */
  running: boolean;
  /** Current task description (if any). */
  currentTask?: string;
  /** Session key for this platform's conversation. */
  sessionKey?: string;
  /** Currently executing tool (if any). */
  currentTool?: string;
  /** Tool call history for activity rendering. */
  toolHistory: Array<{ tool: string; timestamp: Date | number; description?: string }>;
  /** Thinking state for the platform's agent. */
  thinking: string | null;
  /** Step progress for multi-step operations. */
  stepProgress?: { step: number; maxSteps: number } | null;
  /** Accumulated response text for the current turn. */
  responseText: string;
  /** Error message (if the platform agent errored). */
  error: string | null;
  /** Todo items for platform-specific task lists. */
  todoItems?: TodoItem[];
  /** Platform-specific chat messages. */
  chatMessages: ChatMessage[];
  /** Which apps this agent is actively using (for dock indicators). */
  agentActivity?: Record<string, boolean>;
  /** Queue length (for platforms with message queues). */
  queueLength?: number;
  /** Platform identifier. */
  platform?: string;
  /** Start timestamp. */
  startedAt?: number;
  /** Completion timestamp. */
  completedAt?: number;
  /** Goal description for todo tracking. */
  todoGoal?: string;
}
