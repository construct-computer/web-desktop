import { useMemo } from 'react';
import { useComputerStore } from '@/stores/agentStore';
import { useAgentTrackerStore, type TrackedOperation } from '@/stores/agentTrackerStore';

/**
 * Derive a short human-readable state label from agent activity.
 *
 * Shared between the MenuBar AgentActivityIndicator and the ClippyWidget.
 */
export function useAgentStateLabel(): { stateLabel: string; scrollText: string; isActive: boolean; isIdle: boolean } {
  const agentRunning = useComputerStore(s => s.agentRunning);
  const agentThinking = useComputerStore(s => s.agentThinking);
  const agentThinkingStream = useComputerStore(s => s.agentThinkingStream);
  const agentStatusLabel = useComputerStore(s => s.agentStatusLabel);
  const platformAgents = useComputerStore(s => s.platformAgents);
  const taskProgress = useComputerStore(s => s.taskProgress);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const operations = useAgentTrackerStore(s => s.operations);

  const isRunningOp = (op: TrackedOperation) =>
    op.status === 'running' || op.status === 'aggregating';
  const matchesViewSession = (op: TrackedOperation) =>
    !op.sessionKey || op.sessionKey === activeSessionKey;

  const hasActiveOpsInView = Object.values(operations).some(
    (op) => isRunningOp(op) && matchesViewSession(op),
  );
  const isActive = agentRunning || hasActiveOpsInView;

  return useMemo(() => {
    const runningInView = Object.values(operations).filter(
      (op) => isRunningOp(op) && matchesViewSession(op),
    );
    const runningOps = runningInView;

    // Get current tool from taskProgress or platform agent
    const currentTool = taskProgress?.currentTool
      || (agentRunning ? Object.values(platformAgents).find(p => p.running)?.currentTool : undefined);

    // --- State label (line 1) ---
    let stateLabel = 'Working…';

    if (agentStatusLabel === 'compacting') {
      stateLabel = 'Updating knowledge…';
    } else if (agentThinkingStream != null && !currentTool) {
      // Model is streaming tokens (thinking/generating)
      stateLabel = 'Working…';
    } else if (currentTool) {
      // Currently executing a tool — show a friendly label
      const toolLabels: Record<string, string> = {
        local_browser: 'Using local browser',
        browser: 'Using browser',
        exec: 'Running Terminal',
        file_read: 'Reading file',
        file_write: 'Writing file',
        file_edit: 'Editing file',
        file_list: 'Listing files',
        remote_browser: 'Remote browsing',
        web_search: 'Searching web',
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
      stateLabel = toolLabels[currentTool] || `Using ${currentTool}`;
    } else if (hasActiveOpsInView && runningOps.length > 0) {
      const op = runningOps[0];
      const running = op.subAgents.filter(s => s.status === 'running').length;
      const total = op.subAgents.length;
      stateLabel = total > 0 ? `Working (${running}/${total})` : 'Working…';
    } else if (agentRunning) {
      stateLabel = 'Working…';
    }

    // --- Scroll text (line 2) ---
    let scrollText = '';

    // Prefer thinking stream content
    if (agentThinkingStream != null && agentThinkingStream.length > 0) {
      // Take the last portion for recency
      const stream = agentThinkingStream.trim();
      scrollText = stream.length > 200 ? stream.slice(-200) : stream;
      // Clean up to a word boundary
      if (stream.length > 200) {
        const firstSpace = scrollText.indexOf(' ');
        if (firstSpace > 0 && firstSpace < 20) scrollText = scrollText.slice(firstSpace + 1);
      }
    } else if (agentThinking) {
      scrollText = agentThinking;
    } else {
      // Show operation goal or platform agent thinking
      if (runningOps.length > 0) {
        scrollText = runningOps[0].goal;
      } else if (agentRunning) {
        const runningPlatform = Object.entries(platformAgents).find(([, p]) => p.running);
        if (runningPlatform) {
          const [, state] = runningPlatform;
          scrollText = state.thinking || `Working on ${runningPlatform[0]}`;
        }
      }
    }

    const isIdle = !isActive && !scrollText;

    return {
      stateLabel: isIdle ? 'Ready' : stateLabel,
      scrollText,
      isActive,
      isIdle,
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
    hasActiveOpsInView,
    isActive,
  ]);
}
