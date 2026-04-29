import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, Send, Hash, Mail, Search, Crown } from 'lucide-react';
import { useComputerStore, type ActiveSessionStatus } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useWindowStore } from '@/stores/windowStore';
import { openSettingsToSection } from '@/lib/settingsNav';
import { EXTERNAL_PLATFORM_META, inferExternalPlatform } from '@/lib/externalPlatforms';
import { formatRelativeTime } from './utils';

function getSessionPlatform(key: string): { platform: string; icon: typeof Send; color: string } | null {
  const platform = inferExternalPlatform(key);
  if (platform === 'telegram') return { platform: 'Telegram', icon: Send, color: EXTERNAL_PLATFORM_META.telegram.color };
  if (platform === 'slack') return { platform: 'Slack', icon: Hash, color: EXTERNAL_PLATFORM_META.slack.color };
  if (platform === 'email') return { platform: 'Email', icon: Mail, color: EXTERNAL_PLATFORM_META.email.color };
  return null;
}

/**
 * Small coloured dot rendered in the sidebar to indicate live per-session
 * activity. Green = thinking/executing, red = stuck (no heartbeat for
 * STUCK_THRESHOLD_MS), absent when the session is idle.
 */
function SessionStatusDot({ status }: { status: ActiveSessionStatus | undefined }) {
  if (!status) return null;
  const colour =
    status.status === 'stuck'
      ? 'bg-red-400'
      : status.status === 'thinking'
        ? 'bg-emerald-400'
        : 'bg-white/30';
  const pulse = status.status === 'thinking' ? 'animate-pulse' : '';
  const title =
    status.status === 'stuck'
      ? 'Session may be stuck (no recent progress heartbeat)'
      : status.rawStatus
        ? `Running: ${status.rawStatus}${status.lastToolName ? ` (${status.lastToolName})` : ''}`
        : 'Running';
  return (
    <span
      title={title}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${colour} ${pulse}`}
    />
  );
}

function SessionItem({
  session,
  isActive,
  hasUnread,
  sessionStatus,
  onSwitch,
  onRename,
  onDelete,
}: {
  session: { key: string; title: string; lastActivity: number };
  isActive: boolean;
  hasUnread: boolean;
  sessionStatus?: ActiveSessionStatus;
  onSwitch: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title);
  const editRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) onRename(trimmed);
    setEditing(false);
  }, [editValue, session.title, onRename]);

  return (
    <div className="relative group">
      <button
        onClick={() => { if (!editing) onSwitch(); }}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
          isActive
            ? 'bg-white/10 text-[var(--color-text)]'
            : 'text-[var(--color-text-muted)]/70 hover:bg-white/5 hover:text-[var(--color-text-muted)]'
        }`}
      >
        {/* Platform or default icon */}
        <div className="relative shrink-0">
          {(() => {
            const plat = getSessionPlatform(session.key);
            if (plat) {
              const Icon = plat.icon;
              return <Icon className="w-3.5 h-3.5" style={{ color: plat.color, opacity: 0.8 }} />;
            }
            return <MessageSquare className="w-3.5 h-3.5 opacity-40" />;
          })()}
          {hasUnread && !isActive && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--color-accent)] ring-1 ring-[#111113]" />
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {editing ? (
            <input
              ref={editRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') { setEditing(false); setEditValue(session.title); }
              }}
              onBlur={handleRename}
              className="w-full bg-transparent text-[13px] outline-none border-b border-[var(--color-accent)]/30 text-[var(--color-text)]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span className={`text-[13px] truncate ${hasUnread && !isActive ? 'font-semibold' : ''}`}>
                {session.title || 'New Chat'}
              </span>
              <SessionStatusDot status={sessionStatus} />
            </>
          )}
        </div>
        {!editing && (
          <span className="text-[10px] text-[var(--color-text-muted)]/30 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity">
            {formatRelativeTime(session.lastActivity)}
          </span>
        )}
        {!editing && (
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="touch-target shrink-0 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/10 transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {/* Context menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-2 top-full mt-1 z-50 min-w-[140px] rounded-lg overflow-hidden glass-popover border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        >
          <button
            onClick={() => {
              setMenuOpen(false);
              setEditValue(session.title);
              setEditing(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/70 hover:bg-white/10 transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Rename
          </button>
          <button
            onClick={() => { setMenuOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-400/80 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function SpotlightSidebar() {
  const sessions = useComputerStore(s => s.chatSessions);
  const activeKey = useComputerStore(s => s.activeSessionKey);
  const createSession = useComputerStore(s => s.createSession);
  const switchSession = useComputerStore(s => s.switchSession);
  const deleteSession = useComputerStore(s => s.deleteSession);
  const renameSession = useComputerStore(s => s.renameSession);
  const loadSessions = useComputerStore(s => s.loadSessions);
  const chatMessages = useComputerStore(s => s.chatMessages);
  const activeSessions = useComputerStore(s => s.activeSessions);

  const [searchQuery, setSearchQuery] = useState('');
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});
  const initializedRef = useRef(false);
  const userPlan = useAuthStore(s => s.user?.plan);
  const closeSpotlight = useWindowStore(s => s.closeSpotlight);
  const showUpgradeCta = !userPlan || userPlan === 'free';

  const handleUpgradeClick = useCallback(() => {
    closeSpotlight();
    openSettingsToSection('subscription');
  }, [closeSpotlight]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // On first load, mark all existing sessions as read so they don't show unread dots
  useEffect(() => {
    if (!initializedRef.current && sessions.length > 0) {
      initializedRef.current = true;
      const map: Record<string, number> = {};
      for (const s of sessions) {
        map[s.key] = s.lastActivity;
      }
      queueMicrotask(() => setLastReadMap(map));
    }
  }, [sessions]);

  // Track when user switches sessions — mark current as read
  useEffect(() => {
    if (activeKey) {
      queueMicrotask(() => {
        setLastReadMap(prev => ({ ...prev, [activeKey]: Date.now() }));
      });
    }
  }, [activeKey, chatMessages.length]);

  const sorted = [...sessions].sort((a, b) => b.lastActivity - a.lastActivity);

  const filtered = searchQuery.trim()
    ? sorted.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.key.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sorted;

  return (
    <div className="w-full min-w-[240px] shrink-0 flex flex-col h-full min-h-0 surface-sidebar border-r border-white/[0.08]">
      {/* New Chat — sidebar close lives in the Spotlight header */}
      <div className="px-3 pt-4 pb-2">
        <button
          type="button"
          onClick={() => createSession(undefined, { forceNew: true })}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text)] surface-control hover:bg-white/[0.1] transition-colors border border-white/[0.06]"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      {sorted.length > 3 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-muted)]/30" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 rounded-md text-[12px] surface-control border border-white/[0.06] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/20 outline-none focus:border-white/[0.12] transition-colors"
            />
          </div>
        </div>
      )}

      {/* Session list + bottom upgrade (list scrolls; upgrade stays pinned) */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none px-2 pb-2">
          {filtered.length > 0 && (
            <div className="px-1 pt-2 pb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]/30">
                Recents
              </span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {filtered.map(session => (
              <SessionItem
                key={session.key}
                session={session}
                isActive={session.key === activeKey}
                hasUnread={session.lastActivity > (lastReadMap[session.key] || 0) && session.key !== activeKey}
                sessionStatus={activeSessions[session.key]}
                onSwitch={() => switchSession(session.key)}
                onRename={(title) => renameSession(session.key, title)}
                onDelete={() => deleteSession(session.key)}
              />
            ))}
          </div>
          {filtered.length === 0 && searchQuery ? (
            <div className="px-3 py-8 text-center text-[12px] text-[var(--color-text-muted)]/30">
              No matches for "{searchQuery}"
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-[var(--color-text-muted)]/30">
              No conversations yet
            </div>
          ) : null}
        </div>
        {showUpgradeCta && (
          <div className="shrink-0 px-3 pt-3 pb-4 flex flex-col items-center gap-2 border-t border-white/[0.06]">
            <p className="text-[10px] leading-snug text-center text-[var(--color-text-muted)]/75 px-0.5">
              Starter and Pro add higher limits, more apps, and full email — open Settings to compare plans.
            </p>
            <button
              type="button"
              onClick={handleUpgradeClick}
              title="Upgrade plan — opens Subscription in Settings"
              className="relative w-full cursor-pointer overflow-hidden rounded-lg border border-amber-500/30 surface-control py-2 px-2.5 text-amber-600 transition-all duration-150 hover:border-amber-500/40 hover:bg-white/[0.10] active:scale-[0.98] dark:border-amber-400/25 dark:text-amber-400 dark:hover:border-amber-400/35 dark:hover:bg-white/[0.09]"
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-400/15 dark:bg-amber-500/20"
                aria-hidden
              />
              <span className="relative flex flex-col items-center gap-0.5">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Crown className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                  Upgrade your plan
                </span>
                <span className="text-[10px] font-medium leading-tight text-amber-700/85 dark:text-amber-300/90">
                  View pricing and checkout in Settings
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
