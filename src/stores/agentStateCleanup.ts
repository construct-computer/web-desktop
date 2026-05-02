interface DesktopAgentSnapshot {
  running?: boolean;
  currentTool?: string;
  thinking?: string | null;
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
