import type { PlatformAgentState } from '@/stores/agentStore';
import type { TrackedOperation } from '@/stores/agentTrackerStore';

/**
 * Counts hosts (running platform / orchestrator rows) and parallel workers
 * (pending or running sub-agents in active operations) for consistent UI
 * in the agent graph drawer tab badge and the tracker sidebar.
 */
export function getSwarmMetrics(
  platformAgents: Record<string, PlatformAgentState>,
  agentRunning: boolean,
  operations: Record<string, TrackedOperation>,
): { hosts: number; workers: number; total: number } {
  let hosts = 0;
  for (const pa of Object.values(platformAgents)) {
    if (!pa || pa.platform === 'chat') continue;
    const isRunning =
      pa.platform === 'desktop' ? (pa.running || agentRunning) : pa.running;
    if (isRunning) hosts++;
  }
  if (agentRunning && hosts === 0) {
    hosts = 1;
  }

  let workers = 0;
  for (const op of Object.values(operations)) {
    if (op.status !== 'running' && op.status !== 'aggregating') continue;
    for (const s of op.subAgents) {
      if (s.status === 'running' || s.status === 'pending') workers++;
    }
  }

  return { hosts, workers, total: hosts + workers };
}
