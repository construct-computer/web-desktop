/**
 * ChatScreen — fullscreen agent chat for the mobile shell.
 *
 * Reuses the Spotlight's MessageList and SpotlightInput directly.
 * These components are self-contained and depend only on useComputerStore.
 */

import { useComputerStore } from '@/stores/agentStore';
import { MessageList } from '../desktop/spotlight/MessageList';
import { SpotlightInput } from '../desktop/spotlight/SpotlightInput';
import { textColor } from '../mini/ui';
import { Sparkles } from 'lucide-react';

export function ChatScreen() {
  const agentConnected = useComputerStore(s => s.agentConnected);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-black/60 backdrop-blur-xl">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        }}
      >
        <Sparkles size={16} className="opacity-50" />
        <h2 className="text-[16px] font-semibold flex-1" style={{ color: textColor() }}>
          Agent
        </h2>
        {agentConnected ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium opacity-50">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Online
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-medium opacity-50">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            Offline
          </span>
        )}
      </div>

      {/* Messages */}
      <MessageList paddingTopClass="pt-4" />

      {/* Input */}
      <SpotlightInput />
    </div>
  );
}
