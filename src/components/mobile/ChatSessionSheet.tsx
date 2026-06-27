import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useComputerStore } from '@/stores/agentStore';
import { getSessionDisplayMeta } from '@/lib/sessionDisplay';
import { formatRelativeTime } from '@/components/desktop/spotlight/utils';
import { textColor } from '@/components/mini/ui';

interface ChatSessionSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ChatSessionSheet({ open, onClose }: ChatSessionSheetProps) {
  const chatSessions = useComputerStore(s => s.chatSessions);
  const activeSessionKey = useComputerStore(s => s.activeSessionKey);
  const switchSession = useComputerStore(s => s.switchSession);
  const createSession = useComputerStore(s => s.createSession);
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});

  const sorted = useMemo(
    () => [...chatSessions].sort((a, b) => b.lastActivity - a.lastActivity),
    [chatSessions],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close session list"
        onClick={onClose}
      />
      <div
        className="relative max-h-[70dvh] rounded-t-2xl border border-white/10 surface-sidebar flex flex-col"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-[15px] font-semibold" style={{ color: textColor() }}>
            Chats
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg active:bg-white/10"
            aria-label="Close"
          >
            <ChevronDown size={18} className="opacity-60" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            void createSession(undefined, { forceNew: true });
            onClose();
          }}
          className="mx-3 mt-3 mb-1 flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-[13px] font-medium active:bg-white/5"
          style={{ color: textColor() }}
        >
          <Plus size={16} />
          New Chat
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {sorted.map((session) => {
            const meta = getSessionDisplayMeta(session.key, session);
            const Icon = meta.icon;
            const isActive = session.key === activeSessionKey;
            const hasUnread = session.lastActivity > (lastReadMap[session.key] || 0) && !isActive;
            return (
              <button
                key={session.key}
                type="button"
                onClick={() => {
                  void switchSession(session.key);
                  setLastReadMap(prev => ({ ...prev, [session.key]: Date.now() }));
                  onClose();
                }}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left active:bg-white/5 ${
                  isActive ? 'bg-white/10' : ''
                }`}
              >
                {meta.iconUrl ? (
                  <img src={meta.iconUrl} alt="" className="w-4 h-4 shrink-0 rounded-sm opacity-90" />
                ) : (
                  <Icon
                    className="w-4 h-4 shrink-0"
                    style={meta.kind === 'desktop' ? { opacity: 0.45 } : { color: meta.color, opacity: 0.9 }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[14px] truncate ${hasUnread ? 'font-semibold' : 'font-medium'}`}
                    style={{ color: textColor() }}
                  >
                    {session.title || 'New Chat'}
                  </div>
                  {meta.kind !== 'desktop' && (
                    <div className="text-[11px] opacity-50 truncate">{meta.label}</div>
                  )}
                </div>
                <span className="text-[10px] opacity-35 shrink-0">
                  {formatRelativeTime(session.lastActivity)}
                </span>
              </button>
            );
          })}
          {sorted.length === 0 && (
            <div className="px-3 py-8 text-center text-[13px] opacity-40">
              No conversations yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
