import { useMemo } from 'react';
import { useComputerStore, type ActiveSessionStatus } from '@/stores/agentStore';
import { useAgentTrackerStore, type TrackedOperation } from '@/stores/agentTrackerStore';

const TOOL_LABELS: Record<string, string> = {
  local_browser: 'Using local browser',
  browser: 'Using browser',
  exec: 'Running Terminal',
  file_read: 'Reading file',
  file_write: 'Writing file',
  file_edit: 'Editing file',
  file_list: 'Listing files',
  remote_browser: 'Remote browsing',
  web_search: 'Searching web',
  web_fetch: 'Fetching page',
  web_scrape: 'Remote browsing',
  email: 'Handling email',
  slack: 'Using Slack',
  telegram: 'Using Telegram',
  google_calendar: 'Checking calendar',
  google_drive: 'Accessing Drive',
  delegate_task: 'Delegating task',
  spawn_agent: 'Starting helper',
  wait_for_agents: 'Waiting on helpers',
  notify: 'Sending notification',
  render_markdown: 'Rendering markdown',
  terminal: 'Running command',
  sandbox_write_file: 'Writing to workspace',
  sandbox_read_file: 'Reading from workspace',
  save_to_workspace: 'Saving to workspace',
  load_from_workspace: 'Loading from workspace',
  view_image: 'Viewing image',
  document_guide: 'Loading doc guide',
  read_file: 'Reading file',
  write_file: 'Writing file',
  list_directory: 'Listing files',
  search_files: 'Searching files',
  delete_file: 'Deleting file',
  desktop: 'Using desktop',
  window_manager: 'Managing windows',
  documents: 'Processing document',
  composio: 'Using integration',
  app: 'Updating app',
  local_app_guide: 'Loading app guide',
  consult_experts: 'Consulting experts',
  request_help: 'Requesting help',
  request_permission: 'Requesting approval',
  background_task: 'Queuing task',
  todo_list: 'Updating todos',
};

function isRunningOp(op: TrackedOperation): boolean {
  return op.status === 'running' || op.status === 'aggregating';
}

function pickPrimaryRunningSessionKey(
  runningSessions: Set<string>,
  activeSessions: Record<string, ActiveSessionStatus>,
  activeSessionKey: string,
): string | undefined {
  if (runningSessions.has(activeSessionKey)) return activeSessionKey;
  for (const key of runningSessions) {
    const status = activeSessions[key]?.status;
    if (status === 'thinking' || status === 'stuck') return key;
  }
  return runningSessions.values().next().value;
}

/**
 * Derive a short human-readable state label from agent activity.
 *
 * Shared between the MenuBar AgentActivityIndicator and the ClippyWidget.
 * Reflects activity across all running sessions, not only the active chat view.
 */
export function useAgentStateLabel(): {
  stateLabel: string;
  scrollText: string;
  isActive: boolean;
  isIdle: boolean;
  primaryRunningSessionKey?: string;
  runningSessionCount: number;
} {
  const agentRunning = useComputerStore(s => s.agentRunning);
  const agentThinking = useComputerStore(s => s.agentThinking);
  const agentThinkingStream = useComputerStore(s => s.agentThinkingStream);
  const agentStatusLabel = useComputerStore(s => s.agentStatusLabel);
  const platformAgents = useComputerStore(s => s.platformAgents);
  const taskProgress = useComputerStore(s => s.taskProgress);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const runningSessions = useComputerStore(s => s.runningSessions);
  const activeSessions = useComputerStore(s => s.activeSessions);
  const operations = useAgentTrackerStore(s => s.operations);

  const hasAnyRunningOps = Object.values(operations).some(isRunningOp);
  const hasAnyPlatformRunning = Object.values(platformAgents).some((p) => p.running);
  const runningSessionCount = runningSessions.size;
  const isActive = runningSessionCount > 0 || hasAnyPlatformRunning || hasAnyRunningOps;

  const primaryRunningSessionKey = useMemo(
    () => pickPrimaryRunningSessionKey(runningSessions, activeSessions, activeSessionKey),
    [runningSessions, activeSessions, activeSessionKey],
  );

  return useMemo(() => {
    const runningOps = Object.values(operations).filter(isRunningOp);
    const primarySession = primaryRunningSessionKey;
    const primaryStatus = primarySession ? activeSessions[primarySession] : undefined;
    const isPrimaryActiveView = primarySession === activeSessionKey;

    const currentTool = (isPrimaryActiveView ? taskProgress?.currentTool : undefined)
      || primaryStatus?.lastToolName
      || (hasAnyPlatformRunning ? Object.values(platformAgents).find(p => p.running)?.currentTool : undefined);

    let stateLabel = 'Working…';

    if (isPrimaryActiveView && agentStatusLabel === 'compacting') {
      stateLabel = 'Updating knowledge…';
    } else if (isPrimaryActiveView && agentThinkingStream != null && !currentTool) {
      stateLabel = 'Thinking…';
    } else if (currentTool) {
      stateLabel = TOOL_LABELS[currentTool] || `Using ${currentTool}`;
    } else if (runningOps.length > 0) {
      const op = runningOps[0];
      const running = op.subAgents.filter(s => s.status === 'running').length;
      const total = op.subAgents.length;
      stateLabel = total > 0 ? `Working (${running}/${total})` : 'Working…';
    } else if (runningSessionCount > 1) {
      stateLabel = `Working (${runningSessionCount} sessions)`;
    } else if (isActive) {
      stateLabel = 'Working…';
    }

    let scrollText = '';

    if (isPrimaryActiveView && agentThinkingStream != null && agentThinkingStream.length > 0) {
      const stream = agentThinkingStream.trim();
      scrollText = stream.length > 200 ? stream.slice(-200) : stream;
      if (stream.length > 200) {
        const firstSpace = scrollText.indexOf(' ');
        if (firstSpace > 0 && firstSpace < 20) scrollText = scrollText.slice(firstSpace + 1);
      }
    } else if (isPrimaryActiveView && agentThinking) {
      scrollText = agentThinking;
    } else if (primaryStatus?.progressReason) {
      scrollText = primaryStatus.progressReason;
    } else if (runningOps.length > 0) {
      scrollText = runningOps[0].goal;
    } else if (hasAnyPlatformRunning) {
      const runningPlatform = Object.entries(platformAgents).find(([, p]) => p.running);
      if (runningPlatform) {
        const [, state] = runningPlatform;
        scrollText = state.thinking || `Working on ${runningPlatform[0]}`;
      }
    }

    const isIdle = !isActive && !scrollText;

    return {
      stateLabel: isIdle ? 'Ready' : stateLabel,
      scrollText,
      isActive,
      isIdle,
      primaryRunningSessionKey: primarySession,
      runningSessionCount,
    };
  }, [
    agentThinkingStream,
    agentThinking,
    agentStatusLabel,
    taskProgress,
    platformAgents,
    operations,
    activeSessionKey,
    agentRunning,
    isActive,
    primaryRunningSessionKey,
    runningSessionCount,
    activeSessions,
    hasAnyPlatformRunning,
  ]);
}
