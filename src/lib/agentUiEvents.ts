export const AGENT_HISTORY_CLEARED_EVENT = 'construct:agent-history-cleared';

export interface AgentHistoryClearedDetail {
  sessionKey: string;
}

export function dispatchAgentHistoryCleared(detail: AgentHistoryClearedDetail): void {
  window.dispatchEvent(new CustomEvent<AgentHistoryClearedDetail>(AGENT_HISTORY_CLEARED_EVENT, { detail }));
}
