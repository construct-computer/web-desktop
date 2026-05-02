import { create } from 'zustand';

// ── Types ────────────────────────────────────────────────────────────

export type SubAgentStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
export type OperationType = 'delegation' | 'consultation' | 'background' | 'orchestration';
export type OperationStatus = 'running' | 'aggregating' | 'complete' | 'failed';

export interface SubAgentActivity {
  text: string;
  activityType: string;
  timestamp: number;
}

export interface TrackedSubAgent {
  id: string;
  type: 'subagent';
  label: string;
  goal: string;
  status: SubAgentStatus;
  currentActivity?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  iterations?: number;
  maxIterations?: number;
  error?: string;
  result?: string;
  /** Tool call activities performed by this subagent */
  activities: SubAgentActivity[];
  /** Terminal session name assigned by the agent (for terminal window reuse) */
  terminalSession?: string;
}

export interface TrackedOperation {
  id: string;
  type: OperationType;
  status: OperationStatus;
  goal: string;
  subAgents: TrackedSubAgent[];
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  totalExpected?: number;
  /** Which platform spawned this operation (desktop, telegram, slack, email). */
  platform?: string;
  /**
   * Top-level user session (Spotlight / Slack / …) that owns this operation.
   * Older persisted rows may omit this — they only flush on global or legacy paths.
   */
  sessionKey?: string;
}

// ── Store ────────────────────────────────────────────────────────────

interface AgentTrackerStore {
  operations: Record<string, TrackedOperation>;
  /** Reverse index: subagentId → operationId for O(1) lookups. */
  subagentIndex: Record<string, string>;
  /** Goals that the user dismissed via clearHistory. Prevents chat history
   *  reload from resurrecting them after a page refresh. */
  dismissedGoals: Set<string>;

  // Operation lifecycle
  startOperation: (id: string, type: OperationType, goal: string, totalExpected?: number, platform?: string, sessionKey?: string) => void;
  updateOperationStatus: (id: string, status: OperationStatus, durationMs?: number) => void;
  /**
   * When a session’s agent loop goes idle, complete in-flight ops for that
   * session. Legacy rows without `sessionKey` complete only when no other
   * session is still running (`anyOtherSessionRunning` is false).
   */
  completeOperationsForSessionIdle: (sessionKey: string, anyOtherSessionRunning: boolean) => void;
  /**
   * Mark running/aggregating ops failed for a session. `includeLegacy`
   * also fails ops with no `sessionKey` (for “stop this chat” while ambiguous).
   */
  failOperationsForSession: (sessionKey: string, includeLegacy: boolean) => void;
  failAllRunningOperations: () => void;

  // SubAgent lifecycle
  addSubAgent: (operationId: string, agent: TrackedSubAgent) => void;
  updateSubAgent: (operationId: string, agentId: string, update: Partial<TrackedSubAgent>) => void;
  addSubAgentActivity: (subagentId: string, activity: SubAgentActivity) => void;
  /** Accumulate streaming text into a single activity (avoids one entry per token). */
  appendSubAgentText: (subagentId: string, text: string) => void;
  /** Look up the terminal session name assigned to a subagent. */
  getSubAgentTerminalSession: (subagentId: string) => string | undefined;

  // Maintenance
  clearHistory: () => void;
  /** Full reset — clears everything including running operations (for restart/shutdown) */
  resetAll: () => void;
}

// ── Persistence helpers for dismissed goals ─────────────────────────
const DISMISSED_KEY = 'construct:tracker:dismissedGoals';
const OPS_KEY = 'construct:tracker:operations';

function loadDismissedGoals(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveDismissedGoals(goals: Set<string>): void {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...goals])); } catch { /* */ }
}

// ── Persistence helpers for operations ──────────────────────────────

function loadPersistedOperations(): Record<string, TrackedOperation> {
  try {
    const raw = localStorage.getItem(OPS_KEY);
    return raw ? JSON.parse(raw) as Record<string, TrackedOperation> : {};
  } catch { return {}; }
}

function buildSubagentIndex(operations: Record<string, TrackedOperation>): Record<string, string> {
  const index: Record<string, string> = {};
  for (const [opId, op] of Object.entries(operations)) {
    for (const agent of op.subAgents) {
      index[agent.id] = opId;
    }
  }
  return index;
}

function persistOperations(operations: Record<string, TrackedOperation>): void {
  try {
    // Persist all operations so they survive page refresh.
    // Strip activities to keep storage reasonable.
    const toSave: Record<string, TrackedOperation> = {};
    for (const [id, op] of Object.entries(operations)) {
      toSave[id] = {
        ...op,
        subAgents: op.subAgents.map(a => ({
          ...a,
          activities: a.activities.slice(-20),
          currentActivity: undefined,
        })),
      };
    }
    localStorage.setItem(OPS_KEY, JSON.stringify(toSave));
  } catch { /* */ }
}

const persistedOps = loadPersistedOperations();
const persistedIndex = buildSubagentIndex(persistedOps);

export const useAgentTrackerStore = create<AgentTrackerStore>()((set, get) => ({
  operations: persistedOps,
  subagentIndex: persistedIndex,
  dismissedGoals: loadDismissedGoals(),

  startOperation: (id, type, goal, totalExpected, platform, sessionKey) =>
    set((state) => {
      // Don't resurrect operations the user previously dismissed
      if (state.dismissedGoals.has(goal)) return state;
      return {
        operations: {
          ...state.operations,
          [id]: {
            id,
            type,
            status: 'running' as const,
            goal,
            subAgents: [],
            startedAt: Date.now(),
            totalExpected,
            platform,
            ...(sessionKey ? { sessionKey } : {}),
          },
        },
      };
    }),

  completeOperationsForSessionIdle: (sessionKey, anyOtherSessionRunning) =>
    set((state) => {
      let changed = false;
      const operations = { ...state.operations };
      for (const [id, op] of Object.entries(operations)) {
        if (op.status !== 'running' && op.status !== 'aggregating') continue;
        const legacy = !op.sessionKey;
        const match = op.sessionKey === sessionKey;
        if (!match && !(legacy && !anyOtherSessionRunning)) continue;
        changed = true;
        const subAgents = op.subAgents.map((s) =>
          s.status === 'running' || s.status === 'pending'
            ? { ...s, status: 'cancelled' as const, completedAt: Date.now(), error: 'Session went idle before a final sub-agent event arrived.' }
            : s,
        );
        operations[id] = {
          ...op,
          status: 'complete',
          completedAt: Date.now(),
          subAgents,
        };
      }
      if (!changed) return state;
      return { operations };
    }),

  failOperationsForSession: (sessionKey, includeLegacy) =>
    set((state) => {
      let changed = false;
      const operations = { ...state.operations };
      for (const [id, op] of Object.entries(operations)) {
        if (op.status !== 'running' && op.status !== 'aggregating') continue;
        const legacy = !op.sessionKey;
        if (op.sessionKey !== sessionKey && !(legacy && includeLegacy)) continue;
        changed = true;
        const subAgents = op.subAgents.map((s) =>
          s.status === 'running' || s.status === 'pending'
            ? { ...s, status: 'cancelled' as const, completedAt: Date.now() }
            : s,
        );
        operations[id] = {
          ...op,
          status: 'failed',
          completedAt: Date.now(),
          subAgents,
        };
      }
      if (!changed) return state;
      return { operations };
    }),

  failAllRunningOperations: () =>
    set((state) => {
      let changed = false;
      const operations = { ...state.operations };
      for (const [id, op] of Object.entries(operations)) {
        if (op.status !== 'running' && op.status !== 'aggregating') continue;
        changed = true;
        const subAgents = op.subAgents.map((s) =>
          s.status === 'running' || s.status === 'pending'
            ? { ...s, status: 'cancelled' as const, completedAt: Date.now() }
            : s,
        );
        operations[id] = {
          ...op,
          status: 'failed',
          completedAt: Date.now(),
          subAgents,
        };
      }
      if (!changed) return state;
      return { operations };
    }),

  updateOperationStatus: (id, status, durationMs) =>
    set((state) => {
      const op = state.operations[id];
      if (!op) return state;
      const isTerminal = status === 'complete' || status === 'failed';
      return {
        operations: {
          ...state.operations,
          [id]: {
            ...op,
            status,
            ...(isTerminal ? { completedAt: Date.now(), durationMs } : {}),
          },
        },
      };
    }),

  addSubAgent: (operationId, agent) =>
    set((state) => {
      const op = state.operations[operationId];
      if (!op) return state;
      // Don't add duplicates
      if (op.subAgents.some((a) => a.id === agent.id)) return state;
      return {
        operations: {
          ...state.operations,
          [operationId]: {
            ...op,
            subAgents: [...op.subAgents, agent],
          },
        },
        subagentIndex: { ...state.subagentIndex, [agent.id]: operationId },
      };
    }),

  updateSubAgent: (operationId, agentId, update) =>
    set((state) => {
      const op = state.operations[operationId];
      if (!op) return state;
      return {
        operations: {
          ...state.operations,
          [operationId]: {
            ...op,
            subAgents: op.subAgents.map((a) =>
              a.id === agentId ? { ...a, ...update } : a,
            ),
          },
        },
      };
    }),

  addSubAgentActivity: (subagentId, activity) =>
    set((state) => {
      // O(1) lookup via reverse index
      const opId = state.subagentIndex[subagentId];
      if (!opId) return state;
      const op = state.operations[opId];
      if (!op) return state;
      const idx = op.subAgents.findIndex((a) => a.id === subagentId);
      if (idx === -1) return state;
      const agent = op.subAgents[idx];
      const updatedAgents = [...op.subAgents];
      updatedAgents[idx] = {
        ...agent,
        activities: [...agent.activities, activity],
      };
      return {
        operations: {
          ...state.operations,
          [opId]: { ...op, subAgents: updatedAgents },
        },
      };
    }),

  appendSubAgentText: (subagentId, text) =>
    set((state) => {
      const opId = state.subagentIndex[subagentId];
      if (!opId) return state;
      const op = state.operations[opId];
      if (!op) return state;
      const idx = op.subAgents.findIndex((a) => a.id === subagentId);
      if (idx === -1) return state;
      const agent = op.subAgents[idx];
      const activities = [...agent.activities];
      const last = activities[activities.length - 1];

      // Append to the last activity if it's a streaming text entry
      if (last && last.activityType === 'text') {
        activities[activities.length - 1] = {
          ...last,
          text: (last.text + text).slice(0, 200),
          timestamp: Date.now(),
        };
      } else {
        // Start a new streaming text activity
        activities.push({
          text: text.slice(0, 200),
          activityType: 'text',
          timestamp: Date.now(),
        });
      }

      const updatedAgents = [...op.subAgents];
      updatedAgents[idx] = { ...agent, activities };
      return {
        operations: {
          ...state.operations,
          [opId]: { ...op, subAgents: updatedAgents },
        },
      };
    }),

  getSubAgentTerminalSession: (subagentId) => {
    const { subagentIndex, operations } = get();
    const opId = subagentIndex[subagentId];
    if (!opId) return undefined;
    const op = operations[opId];
    if (!op) return undefined;
    const agent = op.subAgents.find((a: TrackedSubAgent) => a.id === subagentId);
    return agent?.terminalSession;
  },

  clearHistory: () =>
    set((state) => {
      const active: Record<string, TrackedOperation> = {};
      const activeIndex: Record<string, string> = {};
      const dismissed = new Set(state.dismissedGoals);
      for (const [id, op] of Object.entries(state.operations)) {
        if (op.status === 'running' || op.status === 'aggregating') {
          active[id] = op;
          for (const a of op.subAgents) {
            activeIndex[a.id] = id;
          }
        } else {
          // Remember the goal so loadChatHistory won't recreate it
          dismissed.add(op.goal);
        }
      }
      saveDismissedGoals(dismissed);
      return { operations: active, subagentIndex: activeIndex, dismissedGoals: dismissed };
    }),

  resetAll: () => {
    // Clear all persisted state on full reset
    try { localStorage.removeItem(DISMISSED_KEY); } catch { /* */ }
    try { localStorage.removeItem(OPS_KEY); } catch { /* */ }
    return set({ operations: {}, subagentIndex: {}, dismissedGoals: new Set() });
  },
}));

// Auto-persist operations to localStorage (debounced to avoid thrashing)
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
useAgentTrackerStore.subscribe((state) => {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => persistOperations(state.operations), 500);
});
