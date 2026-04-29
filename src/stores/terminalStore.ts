import { create } from 'zustand';

export type TerminalStream = 'stdout' | 'stderr';
export type TerminalRunStatus = 'running' | 'completed' | 'failed';

export interface TerminalChunk {
  id: string;
  runId: string;
  data: string;
  stream: TerminalStream;
  timestamp: number;
  sequence: number;
}

export interface TerminalRun {
  id: string;
  toolCallId?: string;
  terminalId: string;
  sandboxInstanceId?: string;
  sessionKey?: string;
  subagentId?: string;
  correlationId?: string;
  command: string;
  status: TerminalRunStatus;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  durationMs?: number;
  stdoutBytes: number;
  stderrBytes: number;
  outputBytes: number;
  outputRef?: string | null;
  preview?: string | null;
  chunks: TerminalChunk[];
  outputText: string;
  outputTruncated: boolean;
}

export interface TerminalSession {
  terminalId: string;
  runIds: string[];
  activeRunId?: string;
  selectedRunId?: string;
  hydratedAt?: number;
}

export interface HydratedTerminalRun {
  tool_call_id: string;
  session_key?: string | null;
  terminal_id?: string | null;
  sandbox_instance_id?: string | null;
  subagent_id?: string | null;
  correlation_id?: string | null;
  command: string;
  status: TerminalRunStatus;
  started_at: number;
  ended_at?: number | null;
  exit_code?: number | null;
  duration_ms?: number | null;
  stdout_bytes?: number | null;
  stderr_bytes?: number | null;
  output_bytes?: number | null;
  output_ref?: string | null;
  preview?: string | null;
}

export interface TerminalEventPayload {
  command?: string;
  data?: string;
  stream?: TerminalStream;
  exitCode?: number;
  terminalId?: string;
  sandboxInstanceId?: string;
  toolCallId?: string;
  sessionKey?: string;
  subagentId?: string;
  correlationId?: string;
  timestamp?: number;
}

interface TerminalStore {
  sessions: Record<string, TerminalSession>;
  runs: Record<string, TerminalRun>;
  ingestCommand: (payload: TerminalEventPayload) => string;
  ingestOutput: (payload: TerminalEventPayload) => void;
  ingestExit: (payload: TerminalEventPayload) => void;
  hydrateRuns: (runs: HydratedTerminalRun[]) => void;
  selectRun: (terminalId: string, runId: string | null) => void;
  clearTerminal: (terminalId: string) => void;
}

const MAX_CHUNKS_PER_RUN = 2_000;
const MAX_SEARCH_TEXT_CHARS = 250_000;

function nowFrom(payload: TerminalEventPayload): number {
  return typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp)
    ? payload.timestamp
    : Date.now();
}

function terminalIdFrom(payload: TerminalEventPayload): string {
  return payload.terminalId || 'main';
}

function runIdFrom(payload: TerminalEventPayload, terminalId: string): string {
  return payload.toolCallId || `${terminalId}:${payload.command || 'command'}:${nowFrom(payload)}`;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function appendSearchText(current: string, chunk: string): { text: string; truncated: boolean } {
  const next = current + chunk;
  if (next.length <= MAX_SEARCH_TEXT_CHARS) {
    return { text: next, truncated: false };
  }
  return {
    text: next.slice(next.length - MAX_SEARCH_TEXT_CHARS),
    truncated: true,
  };
}

function ensureSession(
  sessions: Record<string, TerminalSession>,
  terminalId: string,
): TerminalSession {
  return sessions[terminalId] || { terminalId, runIds: [] };
}

function normalizeStatus(value: HydratedTerminalRun['status'], exitCode?: number | null): TerminalRunStatus {
  if (value === 'running' || value === 'completed' || value === 'failed') return value;
  if (typeof exitCode === 'number') return exitCode === 0 ? 'completed' : 'failed';
  return 'completed';
}

export function getRunTranscript(run: TerminalRun): string {
  const output = run.chunks.length > 0
    ? run.chunks.map((chunk) => chunk.data).join('')
    : (run.preview || run.outputText || '');
  const exit = typeof run.exitCode === 'number' ? `\n[exit ${run.exitCode}]\n` : '';
  return `\n$ ${run.command}\n${output}${exit}`;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  sessions: {},
  runs: {},

  ingestCommand: (payload) => {
    const terminalId = terminalIdFrom(payload);
    const id = runIdFrom(payload, terminalId);
    const startedAt = nowFrom(payload);
    const command = payload.command || '';

    set((state) => {
      const session = ensureSession(state.sessions, terminalId);
      const runIds = session.runIds.includes(id) ? session.runIds : [...session.runIds, id];
      return {
        sessions: {
          ...state.sessions,
          [terminalId]: {
            ...session,
            runIds,
            activeRunId: id,
            selectedRunId: id,
          },
        },
        runs: {
          ...state.runs,
          [id]: {
            id,
            toolCallId: payload.toolCallId,
            terminalId,
            sandboxInstanceId: payload.sandboxInstanceId,
            sessionKey: payload.sessionKey,
            subagentId: payload.subagentId,
            correlationId: payload.correlationId,
            command,
            status: 'running',
            startedAt,
            stdoutBytes: 0,
            stderrBytes: 0,
            outputBytes: 0,
            chunks: [],
            outputText: '',
            outputTruncated: false,
          },
        },
      };
    });

    return id;
  },

  ingestOutput: (payload) => {
    const terminalId = terminalIdFrom(payload);
    const data = payload.data || '';
    if (!data) return;

    set((state) => {
      const session = ensureSession(state.sessions, terminalId);
      const runId = payload.toolCallId || session.activeRunId;
      if (!runId) return state;
      const existing = state.runs[runId];
      if (!existing) return state;

      const stream: TerminalStream = payload.stream === 'stderr' ? 'stderr' : 'stdout';
      const bytes = byteLength(data);
      const sequence = existing.chunks.length + 1;
      const chunk: TerminalChunk = {
        id: `${runId}:${sequence}`,
        runId,
        data,
        stream,
        timestamp: nowFrom(payload),
        sequence,
      };
      const searchText = appendSearchText(existing.outputText, data);
      const chunks = [...existing.chunks, chunk].slice(-MAX_CHUNKS_PER_RUN);

      return {
        runs: {
          ...state.runs,
          [runId]: {
            ...existing,
            chunks,
            outputText: searchText.text,
            outputTruncated: existing.outputTruncated || searchText.truncated,
            stdoutBytes: existing.stdoutBytes + (stream === 'stdout' ? bytes : 0),
            stderrBytes: existing.stderrBytes + (stream === 'stderr' ? bytes : 0),
            outputBytes: existing.outputBytes + bytes,
          },
        },
      };
    });
  },

  ingestExit: (payload) => {
    const terminalId = terminalIdFrom(payload);
    set((state) => {
      const session = ensureSession(state.sessions, terminalId);
      const runId = payload.toolCallId || session.activeRunId;
      if (!runId) return state;
      const existing = state.runs[runId];
      if (!existing) return state;
      const endedAt = nowFrom(payload);
      const exitCode = payload.exitCode ?? 0;
      const durationMs = Math.max(0, endedAt - existing.startedAt);
      return {
        sessions: {
          ...state.sessions,
          [terminalId]: {
            ...session,
            activeRunId: session.activeRunId === runId ? undefined : session.activeRunId,
            selectedRunId: session.selectedRunId || runId,
          },
        },
        runs: {
          ...state.runs,
          [runId]: {
            ...existing,
            status: exitCode === 0 ? 'completed' : 'failed',
            endedAt,
            exitCode,
            durationMs,
          },
        },
      };
    });
  },

  hydrateRuns: (hydratedRuns) => {
    if (hydratedRuns.length === 0) return;
    set((state) => {
      const sessions = { ...state.sessions };
      const runs = { ...state.runs };

      for (const row of hydratedRuns) {
        const terminalId = row.terminal_id || 'main';
        const id = row.tool_call_id;
        const session = ensureSession(sessions, terminalId);
        const existing = runs[id];

        runs[id] = {
          id,
          toolCallId: row.tool_call_id,
          terminalId,
          sandboxInstanceId: row.sandbox_instance_id || undefined,
          sessionKey: row.session_key || undefined,
          subagentId: row.subagent_id || undefined,
          correlationId: row.correlation_id || undefined,
          command: row.command,
          status: normalizeStatus(row.status, row.exit_code),
          startedAt: row.started_at,
          endedAt: row.ended_at || undefined,
          exitCode: typeof row.exit_code === 'number' ? row.exit_code : undefined,
          durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : undefined,
          stdoutBytes: row.stdout_bytes || 0,
          stderrBytes: row.stderr_bytes || 0,
          outputBytes: row.output_bytes || 0,
          outputRef: row.output_ref || undefined,
          preview: row.preview || undefined,
          chunks: existing?.chunks || [],
          outputText: existing?.outputText || row.preview || '',
          outputTruncated: existing?.outputTruncated || Boolean(row.output_ref),
        };

        sessions[terminalId] = {
          ...session,
          runIds: session.runIds.includes(id) ? session.runIds : [...session.runIds, id],
          activeRunId: row.status === 'running' ? id : session.activeRunId,
          selectedRunId: session.selectedRunId || id,
          hydratedAt: Date.now(),
        };
      }

      return { sessions, runs };
    });
  },

  selectRun: (terminalId, runId) => {
    set((state) => {
      const session = ensureSession(state.sessions, terminalId);
      return {
        sessions: {
          ...state.sessions,
          [terminalId]: {
            ...session,
            selectedRunId: runId || session.activeRunId || session.runIds[session.runIds.length - 1],
          },
        },
      };
    });
  },

  clearTerminal: (terminalId) => {
    set((state) => {
      const session = state.sessions[terminalId];
      if (!session) return state;
      const runs = { ...state.runs };
      for (const runId of session.runIds) {
        delete runs[runId];
      }
      const sessions = { ...state.sessions };
      delete sessions[terminalId];
      return { runs, sessions };
    });
  },
}));
