import { create } from 'zustand';

export type DocumentPreviewStatus = 'running' | 'completed' | 'failed';

export interface DocumentPreviewStep {
  id: string;
  message: string;
  detail?: unknown;
  progress?: number;
  timestamp: number;
}

export interface DocumentPreviewFrame {
  id: string;
  previewPath?: string;
  contentType?: string;
  size?: number;
  pageIndex?: number;
  slideIndex?: number;
  sheetName?: string;
  label?: string;
  width?: number;
  height?: number;
  revision?: string | number;
  kind?: string;
  timestamp: number;
}

export interface DocumentPreviewSession {
  id: string;
  toolCallId?: string;
  sessionKey?: string;
  subagentId?: string;
  terminalId?: string;
  format?: string;
  goal?: string;
  title?: string;
  outputPath?: string;
  artifactPath?: string;
  artifactContentType?: string;
  artifactSize?: number;
  status: DocumentPreviewStatus;
  steps: DocumentPreviewStep[];
  frames: DocumentPreviewFrame[];
  currentFrameId?: string;
  terminalOutput: Array<{ id: string; data: string; stream?: 'stdout' | 'stderr'; timestamp: number }>;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

type EventData = Record<string, unknown>;

interface DocumentPreviewStore {
  sessions: Record<string, DocumentPreviewSession>;
  sessionOrder: string[];
  toolCallIndex: Record<string, string>;
  startSession: (data: EventData) => string;
  addStep: (data: EventData) => void;
  addFrame: (data: EventData) => void;
  updateArtifact: (data: EventData) => void;
  completeSession: (data: EventData) => void;
  failSession: (data: EventData) => void;
  appendTerminalOutput: (data: EventData) => void;
}

function now() {
  return Date.now();
}

function idFrom(data: EventData): string {
  return String(data.documentSessionId || data.sessionId || data.toolCallId || 'document');
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function upsertSession(
  sessions: Record<string, DocumentPreviewSession>,
  data: EventData,
): DocumentPreviewSession {
  const id = idFrom(data);
  const existing = sessions[id];
  if (existing) return existing;
  const ts = now();
  return {
    id,
    toolCallId: text(data.toolCallId),
    sessionKey: text(data.sessionKey),
    subagentId: text(data.subagentId),
    terminalId: text(data.terminalId),
    status: 'running',
    steps: [],
    frames: [],
    terminalOutput: [],
    startedAt: ts,
    updatedAt: ts,
  };
}

export const useDocumentPreviewStore = create<DocumentPreviewStore>((set, get) => ({
  sessions: {},
  sessionOrder: [],
  toolCallIndex: {},

  startSession: (data) => {
    const id = idFrom(data);
    set((state) => {
      const existing = state.sessions[id];
      const startedAt = existing?.startedAt ?? now();
      const toolCallId = text(data.toolCallId) || existing?.toolCallId;
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...(existing || {
              id,
              steps: [],
              frames: [],
              terminalOutput: [],
              startedAt,
            }),
            toolCallId,
            sessionKey: text(data.sessionKey) || existing?.sessionKey,
            subagentId: text(data.subagentId) || existing?.subagentId,
            terminalId: text(data.terminalId) || existing?.terminalId,
            format: text(data.format) || existing?.format,
            goal: text(data.goal) || existing?.goal,
            title: text(data.title) || existing?.title,
            outputPath: text(data.outputPath) || existing?.outputPath,
            status: 'running',
            updatedAt: now(),
          },
        },
        sessionOrder: state.sessionOrder.includes(id) ? state.sessionOrder : [...state.sessionOrder, id],
        toolCallIndex: toolCallId ? { ...state.toolCallIndex, [toolCallId]: id } : state.toolCallIndex,
      };
    });
    return id;
  },

  addStep: (data) => {
    const id = idFrom(data);
    set((state) => {
      const session = upsertSession(state.sessions, data);
      const step: DocumentPreviewStep = {
        id: `${id}:step:${session.steps.length + 1}`,
        message: text(data.message) || 'Working on document',
        detail: data.detail,
        progress: num(data.progress),
        timestamp: now(),
      };
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, steps: [...session.steps, step], updatedAt: step.timestamp },
        },
        sessionOrder: state.sessionOrder.includes(id) ? state.sessionOrder : [...state.sessionOrder, id],
      };
    });
  },

  addFrame: (data) => {
    const id = idFrom(data);
    set((state) => {
      const session = upsertSession(state.sessions, data);
      const timestamp = now();
      const frame: DocumentPreviewFrame = {
        id: `${id}:frame:${session.frames.length + 1}`,
        previewPath: text(data.previewPath),
        contentType: text(data.contentType),
        size: num(data.size),
        pageIndex: num(data.pageIndex),
        slideIndex: num(data.slideIndex),
        sheetName: text(data.sheetName),
        label: text(data.label),
        width: num(data.width),
        height: num(data.height),
        revision: typeof data.revision === 'string' || typeof data.revision === 'number' ? data.revision : undefined,
        kind: text(data.kind),
        timestamp,
      };
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            frames: [...session.frames, frame],
            currentFrameId: frame.id,
            updatedAt: timestamp,
          },
        },
        sessionOrder: state.sessionOrder.includes(id) ? state.sessionOrder : [...state.sessionOrder, id],
      };
    });
  },

  updateArtifact: (data) => {
    const id = idFrom(data);
    set((state) => {
      const session = upsertSession(state.sessions, data);
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            artifactPath: text(data.path) || text(data.outputPath) || session.artifactPath,
            artifactContentType: text(data.contentType) || session.artifactContentType,
            artifactSize: num(data.size) || session.artifactSize,
            status: data.final ? 'completed' : session.status,
            updatedAt: now(),
          },
        },
        sessionOrder: state.sessionOrder.includes(id) ? state.sessionOrder : [...state.sessionOrder, id],
      };
    });
  },

  completeSession: (data) => {
    const id = idFrom(data);
    set((state) => {
      const session = upsertSession(state.sessions, data);
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            outputPath: text(data.outputPath) || session.outputPath,
            artifactPath: text(data.outputPath) || session.artifactPath,
            status: 'completed',
            updatedAt: now(),
          },
        },
        sessionOrder: state.sessionOrder.includes(id) ? state.sessionOrder : [...state.sessionOrder, id],
      };
    });
  },

  failSession: (data) => {
    const id = idFrom(data);
    set((state) => {
      const session = upsertSession(state.sessions, data);
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            status: 'failed',
            error: text(data.error) || 'Document generation failed',
            updatedAt: now(),
          },
        },
        sessionOrder: state.sessionOrder.includes(id) ? state.sessionOrder : [...state.sessionOrder, id],
      };
    });
  },

  appendTerminalOutput: (data) => {
    const toolCallId = text(data.toolCallId);
    const sessionId = toolCallId ? get().toolCallIndex[toolCallId] : undefined;
    if (!sessionId) return;
    const chunk = text(data.data);
    if (!chunk) return;
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      const entry = {
        id: `${sessionId}:terminal:${session.terminalOutput.length + 1}`,
        data: chunk,
        stream: data.stream === 'stderr' ? 'stderr' as const : 'stdout' as const,
        timestamp: now(),
      };
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            terminalOutput: [...session.terminalOutput.slice(-199), entry],
            updatedAt: entry.timestamp,
          },
        },
      };
    });
  },
}));
