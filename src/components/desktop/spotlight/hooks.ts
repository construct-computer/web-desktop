/**
 * Spotlight hooks — shared across spotlight sub-components.
 */

import { useState, useEffect } from 'react';
import { useComputerStore } from '@/stores/agentStore';

export function useElapsed(startedAt: number, active: boolean): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return '';
  const s = Math.round((Date.now() - startedAt) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export interface SlashCommand {
  name: string;
  description: string;
  action: () => void;
}

export function useSlashCommands(): SlashCommand[] {
  const clearChat = useComputerStore(s => s.clearChatHistory);
  const createSession = useComputerStore(s => s.createSession);

  return [
    { name: '/new', description: 'Start a new chat session', action: () => createSession(undefined, { forceNew: true }) },
    { name: '/clear', description: 'Clear chat history', action: () => clearChat() },
  ];
}
