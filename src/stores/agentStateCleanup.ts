interface DesktopAgentSnapshot {
  running?: boolean;
  currentTool?: string;
  thinking?: string | null;
}

export interface PlatformAgentRuntimeSnapshot {
  running?: boolean;
  currentTool?: string;
  thinking?: string | null;
  responseText?: string;
  toolHistory?: unknown[];
  stepProgress?: unknown;
  completedAt?: number;
}

export function shouldClearViewedAgentState(input: {
  activeSessionKey: string;
  liveSessionKeys: Set<string>;
  desktopAgent?: DesktopAgentSnapshot;
  hasTaskProgress?: boolean;
}): boolean {
  if (input.liveSessionKeys.has(input.activeSessionKey)) return false;
  return Boolean(
    input.hasTaskProgress ||
    input.desktopAgent?.running ||
    input.desktopAgent?.currentTool ||
    input.desktopAgent?.thinking,
  );
}

export function pruneStaleBackgroundRunningSessions(
  runningSessions: Set<string>,
  activeSessions: Record<string, { lastHeartbeatAt?: number; startedAt?: number } | undefined>,
  activeViewKey: string,
  idleClearMs: number,
  now = Date.now(),
): Set<string> {
  const next = new Set(runningSessions);
  for (const key of next) {
    if (key === activeViewKey) continue;
    const meta = activeSessions[key];
    const lastBeat = meta?.lastHeartbeatAt ?? meta?.startedAt ?? 0;
    if (lastBeat > 0 && now - lastBeat > idleClearMs) {
      next.delete(key);
    }
  }
  return next;
}

export function clearDesktopAgentRuntime<T extends PlatformAgentRuntimeSnapshot>(
  desktopAgent: T | undefined,
  now: number = Date.now(),
): T | undefined {
  if (!desktopAgent) return undefined;
  return {
    ...desktopAgent,
    running: false,
    currentTool: undefined,
    thinking: null,
    responseText: '',
    toolHistory: [],
    stepProgress: undefined,
    completedAt: now,
  };
}
