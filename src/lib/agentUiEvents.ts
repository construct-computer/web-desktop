export const AGENT_HISTORY_CLEARED_EVENT = 'construct:agent-history-cleared';
export const MEMORY_CHANGED_EVENT = 'construct:memory-changed';
export const WORK_ORDER_UPDATED_EVENT = 'construct:work-order-updated';

export interface WorkOrderUpdatedDetail {
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

export interface AgentHistoryClearedDetail {
  sessionKey: string;
}

export function dispatchAgentHistoryCleared(detail: AgentHistoryClearedDetail): void {
  window.dispatchEvent(new CustomEvent<AgentHistoryClearedDetail>(AGENT_HISTORY_CLEARED_EVENT, { detail }));
}

export interface MemoryChangedDetail {
  items: Array<{
    id: string;
    event: 'ADD' | 'UPDATE';
    memory: string;
  }>;
}

export function dispatchMemoryChanged(detail: MemoryChangedDetail): void {
  window.dispatchEvent(new CustomEvent<MemoryChangedDetail>(MEMORY_CHANGED_EVENT, { detail }));
}

export function dispatchWorkOrderUpdated(detail: WorkOrderUpdatedDetail): void {
  window.dispatchEvent(new CustomEvent<WorkOrderUpdatedDetail>(WORK_ORDER_UPDATED_EVENT, { detail }));
}
