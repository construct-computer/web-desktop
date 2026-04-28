import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, Globe, Terminal, FileSearch, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Tooltip } from '@/components/ui';
import { useComputerStore, type ChatMessage } from '@/stores/agentStore';
import { groupMessages, type MessageGroup } from './utils';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ActivityGroup } from './ActivityGroup';
import { ToolCallBanner } from './ToolCallBanner';
import { OperationCard } from './OperationCard';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function timeLabel(ts?: Date) {
  if (!ts) return '';
  const timeStr = ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return isToday(ts) ? timeStr : `${dateStr}, ${timeStr}`;
}

/** Hover-reveal metadata row shown below a message bubble (desktop). */
function MessageHoverSlot({ timestamp, onReply }: { timestamp?: Date; onReply: () => void }) {
  const label = timeLabel(timestamp);

  return (
    <div className="pointer-events-none flex min-h-6 items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover/reply:pointer-events-auto group-hover/reply:opacity-100">
      <button
        type="button"
        onClick={onReply}
        className="text-[11px] font-medium text-[var(--color-text-muted)]/70 hover:text-[var(--color-text-muted)] active:text-[var(--color-text)] py-0.5"
        aria-label="Reply to this message"
      >
        Reply
      </button>
      {label && (
        <span className="text-[9px] text-[var(--color-text-muted)]/30 whitespace-nowrap select-none">
          {label}
        </span>
      )}
    </div>
  );
}

/** Always-visible metadata row shown below a message bubble (touch). */
function MessageTouchReply({ timestamp, onReply }: { timestamp?: Date; onReply: () => void }) {
  const label = timeLabel(timestamp);
  return (
    <div className="flex min-h-5 items-center gap-1.5 min-w-0">
      <button
        type="button"
        onClick={onReply}
        className="text-[11px] font-medium text-[var(--color-text-muted)]/70 active:text-[var(--color-text)] py-0.5"
        aria-label="Reply to this message"
      >
        Reply
      </button>
      {label && (
        <span className="text-[9px] text-[var(--color-text-muted)]/30 whitespace-nowrap select-none">
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * MessageList — Scrollable message area with auto-scroll, message grouping,
 * and tool call banners between activity clusters and agent responses.
 */
export function MessageList({ paddingTopClass }: { paddingTopClass?: string } = {}) {
  const chatMessages = useComputerStore(s => s.chatMessages);
  const agentRunning = useComputerStore(s => s.agentRunning);
  const agentStatusLabel = useComputerStore(s => s.agentStatusLabel);
  const thinkingStream = useComputerStore(s => s.agentThinkingStream);
  const setReplyingTo = useComputerStore(s => s.setReplyingTo);
  const activeKey = useComputerStore(s => s.activeSessionKey);
  const overseerAlerts = useComputerStore(s => s.overseerAlerts);
  /** Watchdog / system alerts that apply to this chat (or are global when no sessionKey). */
  const alertsForThisChat = useMemo(
    () => overseerAlerts.filter(a => a.sessionKey === activeKey),
    [overseerAlerts, activeKey],
  );
  const isExternal = activeKey?.startsWith('telegram_') || activeKey?.startsWith('slack_') || activeKey?.startsWith('email_');

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isMobile = useIsMobile();

  const groups = useMemo(() => groupMessages(chatMessages, agentRunning), [chatMessages, agentRunning]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setShowScrollBtn(el.scrollTop + el.clientHeight < el.scrollHeight - 60);
  }, []);

  useEffect(() => { scrollToBottom(); }, [chatMessages, agentRunning, agentStatusLabel, thinkingStream, scrollToBottom]);
  useEffect(() => { const t = setTimeout(scrollToBottom, 200); return () => clearTimeout(t); }, [scrollToBottom]);

  // Build enhanced groups: operations always render (as ToolCallBanner if
  // activities follow, or as a standalone OperationCard otherwise). Activities
  // before an agent message render as ToolCallBanner (3+) or ActivityGroup.
  const renderGroups = useMemo(() => {
    type ActivitiesGroup = Extract<MessageGroup, { type: 'activities' }>;
    type OperationGroup = Extract<MessageGroup, { type: 'operation' }>;

    const result: Array<{ key: string; node: React.ReactNode }> = [];
    let pendingActivities: ActivitiesGroup | null = null;
    let pendingOperation: OperationGroup | null = null;

    const flushActivitiesAndOperation = (
      keyPrefix: string,
      opts: { isActive?: boolean } = {},
    ) => {
      const acts = pendingActivities?.msgs ?? [];
      const opId = pendingOperation?.msg.operationId;
      const hasActs = acts.length > 0;
      const hasOp = !!opId;

      if (hasActs) {
        if (acts.length >= 3 || hasOp) {
          result.push({
            key: `${keyPrefix}-tcb`,
            node: <ToolCallBanner
              activities={acts}
              operationId={opId}
              isActive={opts.isActive}
            />,
          });
        } else {
          result.push({
            key: `${keyPrefix}-ag`,
            node: <ActivityGroup activities={acts} />,
          });
        }
      } else if (hasOp) {
        const label = pendingOperation!.msg.content || 'Orchestration';
        result.push({
          key: `${keyPrefix}-op-${opId}`,
          node: <OperationCard operationId={opId!} label={label} />,
        });
      }

      pendingActivities = null;
      pendingOperation = null;
    };

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];

      if (group.type === 'activities') {
        pendingActivities = group;
        continue;
      }

      if (group.type === 'operation') {
        pendingOperation = group;
        continue;
      }

      const { msg } = group;
      flushActivitiesAndOperation(`flush-${gi}`);

      if (msg.role === 'user') {
        const canReply = !isExternal && msg.content?.trim();
        const cm = msg as ChatMessage;
        const replySlot = canReply
          ? isMobile
            ? <MessageTouchReply timestamp={msg.timestamp} onReply={() => setReplyingTo(cm)} />
            : <MessageHoverSlot timestamp={msg.timestamp} onReply={() => setReplyingTo(cm)} />
          : undefined;
        result.push({
          key: `msg-${group.index}`,
          node: (
            <div className="group/reply">
              <UserMessage msg={msg} replySlot={replySlot} />
            </div>
          ),
        });
      } else {
        const canReply = !isExternal && msg.content?.trim();
        const cm = msg as ChatMessage;
        const replySlot = canReply
          ? isMobile
            ? <MessageTouchReply timestamp={msg.timestamp} onReply={() => setReplyingTo(cm)} />
            : <MessageHoverSlot timestamp={msg.timestamp} onReply={() => setReplyingTo(cm)} />
          : undefined;

        result.push({
          key: `msg-${group.index}`,
          node: (
            <div className="group/reply">
              <AgentMessage msg={msg} replySlot={replySlot} />
            </div>
          ),
        });
      }
    }

    flushActivitiesAndOperation(`flush-end`, { isActive: agentRunning });

    return result;
  }, [groups, isExternal, setReplyingTo, agentRunning, isMobile]);

  const runningSessions = useComputerStore(s => s.runningSessions);
  const activeSessionMeta = useComputerStore(s => s.activeSessions[s.activeSessionKey]);
  const sessionRunning =
    agentRunning ||
    (activeKey ? runningSessions.has(activeKey) : false) ||
    Boolean(activeSessionMeta && activeSessionMeta.status !== 'idle');
  const hasContent = groups.length > 0 || sessionRunning;
  const sessionSwitching = useComputerStore(s => s.sessionSwitching);

  const sendChatMessage = useComputerStore(s => s.sendChatMessage);

  if (sessionSwitching) {
    return (
      <div className="flex-1 min-h-0 w-full min-w-0 flex flex-col gap-3 p-4 pt-6">
        <div className="h-4 bg-white/10 dark:bg-white/[0.08] rounded-md w-4/5 max-w-md mx-auto motion-safe:animate-pulse" />
        <div className="h-4 bg-white/10 dark:bg-white/[0.08] rounded-md w-2/3 max-w-sm mx-auto motion-safe:animate-pulse" />
        <div className="h-3 bg-white/[0.08] dark:bg-white/[0.05] rounded-md w-1/2 max-w-xs mx-auto motion-safe:animate-pulse" />
        <p className="text-center text-[12px] text-[var(--color-text-muted)]/50 mt-4">Switching chat…</p>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="flex-1 min-h-0 w-full min-w-0 flex flex-col items-stretch">
        <div className="flex-1 min-h-0 flex items-center justify-center px-4 sm:px-8">
          <div className="text-center w-full max-w-lg mx-auto">
            <p className="text-[18px] font-light text-[var(--color-text)]/60">What can I help you with?</p>
            <p className="text-[13px] text-[var(--color-text-muted)]/30 mt-2">Use @ to reference files, attach images, or just ask anything</p>
            {!isMobile && (
              <p className="text-[11px] text-[var(--color-text-muted)]/25 mt-1">Press <span className="text-[var(--color-text-muted)]/45">Ctrl+Space</span> to toggle the agent anytime</p>
            )}
            <div
              className={cn(
                'mt-5 gap-2 w-full',
                isMobile ? 'grid grid-cols-1 max-w-md mx-auto' : 'flex flex-wrap justify-center',
              )}
            >
              {[
                { icon: <Globe className="w-3.5 h-3.5 shrink-0" />, label: 'Research a topic', prompt: 'Help me research a topic. First ask me for the topic/industry, audience, deadline, and desired output format if I have not provided them; do not guess missing details.' },
                { icon: <FileSearch className="w-3.5 h-3.5 shrink-0" />, label: 'Draft an email', prompt: 'Help me draft a professional email. First ask for the recipient, goal, tone, and key points if they are missing; do not invent meeting details.' },
                { icon: <Terminal className="w-3.5 h-3.5 shrink-0" />, label: 'Summarize my files', prompt: 'Look through my workspace files and summarize only what you can verify from accessible files. Note unknowns separately and list any action items you find.' },
              ].map(({ icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => sendChatMessage(prompt)}
                  className={cn(
                    'flex items-center justify-center sm:justify-start gap-2 rounded-xl text-[12px] text-[var(--color-text-muted)]/60 active:text-[var(--color-text)] sm:hover:text-[var(--color-text)] bg-white/[0.04] sm:hover:bg-white/[0.08] border border-white/[0.06] sm:hover:border-white/[0.12] transition-all',
                    isMobile && 'w-full min-h-11 py-2.5 px-3.5',
                    !isMobile && 'px-3.5 py-2',
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto scroll-smooth scrollbar-none pb-3',
          paddingTopClass || 'pt-14',
        )}
        style={{ overscrollBehavior: 'contain' }}
      >
      {alertsForThisChat.length > 0 && (
        <div className="px-4 pt-2 pb-3 flex flex-col gap-1.5">
          {alertsForThisChat.slice().reverse().map(alert => {
            const icon = alert.severity === 'error'
              ? <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              : alert.severity === 'warn'
                ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                : <AlertCircle className="w-3.5 h-3.5 text-[var(--color-text-muted)]/50 shrink-0" />;
            const bg = alert.severity === 'error'
              ? 'bg-red-500/5 border-red-500/15'
              : alert.severity === 'warn'
                ? 'bg-amber-500/5 border-amber-500/15'
                : 'bg-white/[0.03] border-white/[0.08]';
            const when = new Date(alert.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            return (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-2 px-3 py-2 rounded-lg border text-[12px] text-[var(--color-text-muted)]',
                  bg,
                )}
              >
                <div className="pt-0.5">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]/50 mb-0.5">
                    <span>Status</span>
                    {alert.sessionKey && <span>· {alert.sessionKey}</span>}
                    <span className="ml-auto">{when}</span>
                  </div>
                  <p className="leading-snug whitespace-pre-wrap break-words">{alert.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {renderGroups.map(({ key, node }) => (
        <div key={key}>{node}</div>
      ))}
      <ThinkingIndicator />
      </div>

      {showScrollBtn && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2">
          <Tooltip content="Scroll to bottom" side="top">
            <button
              type="button"
              onClick={scrollToBottom}
              className="pointer-events-auto w-7 h-7 rounded-full surface-card-raised border border-[var(--color-border)]/20 flex items-center justify-center shadow-lg hover:shadow-xl transition-all"
              aria-label="Scroll to latest messages"
            >
              <ArrowDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
