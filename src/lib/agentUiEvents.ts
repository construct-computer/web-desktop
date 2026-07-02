import { useWindowStore } from '@/stores/windowStore';

export const AGENT_HISTORY_CLEARED_EVENT = 'construct:agent-history-cleared';
export const AGENT_CALENDAR_REFRESH_EVENT = 'construct:agent-calendar-refresh';
export const AGENT_EMAIL_REFRESH_EVENT = 'construct:agent-email-refresh';
export const AGENT_EMAIL_CONFIGURED_EVENT = 'agent-email-configured';
export const AGENT_FILES_NAVIGATE_EVENT = 'construct:agent-files-navigate';
export const MEMORY_CHANGED_EVENT = 'construct:memory-changed';


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


export function dispatchAgentCalendarRefresh(): void {
  window.dispatchEvent(new CustomEvent(AGENT_CALENDAR_REFRESH_EVENT));
}

export function dispatchAgentEmailRefresh(): void {
  window.dispatchEvent(new CustomEvent(AGENT_EMAIL_REFRESH_EVENT));
}

export function dispatchAgentEmailConfigured(): void {
  window.dispatchEvent(new CustomEvent(AGENT_EMAIL_CONFIGURED_EVENT));
}

/** Refresh the Email app when it is open; queue refresh if minimized. */
export function requestAgentEmailRefresh(): void {
  const wStore = useWindowStore.getState();
  const emailWin = wStore.windows.find((w) => w.type === 'email');
  if (!emailWin) return;

  if (emailWin.state === 'minimized') {
    wStore.updateWindow(emailWin.id, {
      metadata: { ...emailWin.metadata, pendingRefresh: true },
    });
    return;
  }

  dispatchAgentEmailRefresh();
}

export interface AgentFilesNavigateDetail {
  folderPath: string;
  filePath?: string;
  openPreview?: boolean;
  highlight?: boolean;
}

export function dispatchAgentFilesNavigate(detail: AgentFilesNavigateDetail): void {
  window.dispatchEvent(new CustomEvent<AgentFilesNavigateDetail>(AGENT_FILES_NAVIGATE_EVENT, { detail }));
}
