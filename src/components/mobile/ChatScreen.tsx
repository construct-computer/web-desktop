/**
 * ChatScreen — fullscreen agent chat for the mobile desktop background.
 *
 * Reuses the Spotlight's MessageList and SpotlightInput directly.
 * These components are self-contained and depend only on useComputerStore.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';
import { MessageList } from '../desktop/spotlight/MessageList';
import { SpotlightInput } from '../desktop/spotlight/SpotlightInput';
import { ChatSessionSheet } from './ChatSessionSheet';
import { getSessionDisplayMeta } from '@/lib/sessionDisplay';
import { textColor } from '../mini/ui';

export function ChatScreen() {
  const agentConnected = useComputerStore(s => s.agentConnected);
  const chatSessions = useComputerStore(s => s.chatSessions);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const loadSessions = useComputerStore(s => s.loadSessions);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeSession = chatSessions.find(s => s.key === activeSessionKey);
  const sessionMeta = getSessionDisplayMeta(activeSessionKey);

  useEffect(() => {
    void loadSessions(true, { preserveActiveKey: activeSessionKey });
  }, [loadSessions, activeSessionKey]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden surface-app">
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        }}
      >
        <Sparkles size={16} className="opacity-50 shrink-0" />
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left active:opacity-80"
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold truncate" style={{ color: textColor() }}>
              {activeSession?.title || 'Construct'}
            </h2>
            {sessionMeta.kind !== 'desktop' && (
              <span className="text-[11px] opacity-50">{sessionMeta.label}</span>
            )}
          </div>
          <ChevronDown size={16} className="opacity-50 shrink-0" />
        </button>
        {agentConnected ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium opacity-50 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Online
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-medium opacity-50 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            Offline
          </span>
        )}
      </div>

      <MessageList paddingTopClass="pt-4" />
      <SpotlightInput />
      <ChatSessionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
