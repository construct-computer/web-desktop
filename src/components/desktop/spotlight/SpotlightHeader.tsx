/**
 * SpotlightHeader — Session info bar at the top of the chat area.
 * Shows session title, platform badge, and read-only indicator.
 */

import { Send, Hash, Mail, Lock } from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';

function getSessionPlatform(key: string) {
  if (key.startsWith('telegram_')) return { platform: 'Telegram', icon: Send, color: '#2AABEE' };
  if (key.startsWith('slack_')) return { platform: 'Slack', icon: Hash, color: '#4A154B' };
  if (key.startsWith('email_')) return { platform: 'Email', icon: Mail, color: '#EA4335' };
  return null;
}

export function SpotlightHeader() {
  const activeKey = useComputerStore(s => s.activeSessionKey);
  const sessions = useComputerStore(s => s.chatSessions);
  const session = sessions.find(s => s.key === activeKey);

  if (!session) return null;

  const plat = getSessionPlatform(session.key);
  const isExternal = !!plat;

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/[0.06] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] font-medium text-[var(--color-text)]/70 truncate">
          {session.title || 'New Chat'}
        </span>
        {plat && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider text-white/80"
            style={{ background: plat.color }}
          >
            <plat.icon className="w-2.5 h-2.5" />
            {plat.platform}
          </span>
        )}
      </div>
      {isExternal && (
        <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]/40">
          <Lock className="w-3 h-3" />
          Read-only
        </div>
      )}
    </div>
  );
}
