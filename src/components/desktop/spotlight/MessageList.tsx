import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, Globe, Terminal, FileSearch, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Tooltip } from '@/components/ui';
import { useComputerStore } from '@/stores/agentStore';
import { groupMessages, type MessageGroup } from './utils';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ActivityGroup } from './ActivityGroup';
import { ToolCallBanner } from './ToolCallBanner';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';

/** Hover-reveal slot with timestamp and reply button. */
function MessageHoverSlot({ timestamp, onReply }: { timestamp?: Date; onReply: () => void }) {
  const timeStr = timestamp
    ? timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const dateStr = timestamp
    ? timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : '';
  const label = timestamp
    ? (isToday(timestamp) ? timeStr : `${dateStr}, ${timeStr}`)
    : '';

  return (
    <div className="flex items-center gap-1.5 opacity-0 group-hover/reply:opacity-100 transition-opacity duration-150 shrink-0">
      {label && (
        <span className="text-[10px] text-[var(--color-text-muted)]/40 whitespace-nowrap select-none">
          {label}
        </span>
      )}
      <button
        onClick={onReply}
        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-transparent hover:border-white/[0.08] backdrop-blur-sm transition-all duration-150 active:scale-90 opacity-50 hover:!opacity-100"
        title="Reply"
      >
        <Reply className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
      </button>
    </div>
  );
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

/**
 * MessageList — Scrollable message area with auto-scroll, message grouping,
 * and tool call banners between activity clusters and agent responses.
 */
export function MessageList() {
  const chatMessages = useComputerStore(s => s.chatMessages);
  const agentRunning = useComputerStore(s => s.agentRunning);
  const thinkingStream = useComputerStore(s => s.agentThinkingStream);
  const setReplyingTo = useComputerStore(s => s.setReplyingTo);
  const activeKey = useComputerStore(s => s.activeSessionKey);
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

  useEffect(() => { scrollToBottom(); }, [chatMessages, agentRunning, thinkingStream, scrollToBottom]);
  useEffect(() => { const t = setTimeout(scrollToBottom, 200); return () => clearTimeout(t); }, [scrollToBottom]);

  // Build enhanced groups: merge consecutive activities before an agent message into a ToolCallBanner
  const renderGroups = useMemo(() => {
    const result: Array<{ key: string; node: React.ReactNode }> = [];
    let pendingActivities: MessageGroup | null = null;
    let pendingOperation: MessageGroup | null = null;

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];

      if (group.type === 'activities') {
        pendingActivities = group;
        continue;
      }

      if (group.type === 'operation') {
        // Don't flush activities or render separately — merge into next ToolCallBanner
        pendingOperation = group;
        continue;
      }

      // It's a message group
      const { msg } = group;

      // If there are pending activities before an agent message, render as ToolCallBanner (3+) or ActivityGroup (fewer)
      if (pendingActivities && msg.role === 'agent' && !msg.isError && !msg.isStopped) {
        if (pendingActivities.msgs.length >= 3) {
          result.push({
            key: `tcb-${gi}`,
            node: <ToolCallBanner
              activities={pendingActivities.msgs}
              operationId={pendingOperation?.msg.operationId}
            />,
          });
        } else {
          result.push({
            key: `ag-${gi}`,
            node: <ActivityGroup activities={pendingActivities.msgs} />,
          });
        }
        pendingActivities = null;
        pendingOperation = null;
      } else if (pendingActivities) {
        // Activities before a user message — render as regular ActivityGroup
        result.push({
          key: `ag-${gi}`,
          node: <ActivityGroup activities={pendingActivities.msgs} />,
        });
        pendingActivities = null;
      }

      if (msg.role === 'user') {
        const replySlot = !isExternal && msg.content?.trim()
          ? <MessageHoverSlot timestamp={msg.timestamp} onReply={() => setReplyingTo(msg as any)} />
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
        const replySlot = !isExternal && msg.content?.trim()
          ? <MessageHoverSlot timestamp={msg.timestamp} onReply={() => setReplyingTo(msg as any)} />
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

    // Flush remaining activities (agent still working)
    if (pendingActivities) {
      result.push({
        key: pendingActivities.msgs.length >= 3 ? `tcb-end` : `ag-end`,
        node: pendingActivities.msgs.length >= 3
          ? <ToolCallBanner
              activities={pendingActivities.msgs}
              operationId={pendingOperation?.msg.operationId}
              isActive={agentRunning}
            />
          : <ActivityGroup activities={pendingActivities.msgs} />,
      });
    }

    return result;
  }, [groups, isExternal, setReplyingTo, agentRunning]);

  const hasContent = groups.length > 0 || agentRunning;
  const sessionSwitching = useComputerStore(s => s.sessionSwitching);

  const sendChatMessage = useComputerStore(s => s.sendChatMessage);

  if (sessionSwitching) {
    return <div className="flex-1" />;
  }

  if (!hasContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-8 py-12">
          <p className="text-[18px] font-light text-[var(--color-text)]/60">What can I help you with?</p>
          <p className="text-[13px] text-[var(--color-text-muted)]/30 mt-2">Use @ to reference files, attach images, or just ask anything</p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {[
              { icon: <Globe className="w-3.5 h-3.5" />, label: 'Research a topic', prompt: 'Research the latest trends in my industry and write a brief report with key takeaways I can share with my team.' },
              { icon: <FileSearch className="w-3.5 h-3.5" />, label: 'Draft an email', prompt: 'Help me draft a professional follow-up email to a client after a meeting, thanking them and summarizing the next steps we discussed.' },
              { icon: <Terminal className="w-3.5 h-3.5" />, label: 'Summarize my files', prompt: 'Look through my workspace files and give me a quick overview of what projects and documents I have, with any action items you spot.' },
            ].map(({ icon, label, prompt }) => (
              <button
                key={label}
                onClick={() => sendChatMessage(prompt)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] text-[var(--color-text-muted)]/60 hover:text-[var(--color-text)] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] transition-all"
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "h-full overflow-y-auto scroll-smooth scrollbar-none pb-3",
          isMobile ? "pt-8" : "pt-4"
        )}
        style={{ overscrollBehavior: 'contain' }}
      >
        {renderGroups.map(({ key, node }) => (
          <div key={key}>{node}</div>
        ))}
        <ThinkingIndicator />
      </div>

      {/* Top scroll-fade mask so messages don't collide with the rounded corner / floating toggle */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white/60 dark:from-[#111113]/80 to-transparent z-[5]" />

      {showScrollBtn && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
          <Tooltip content="Scroll to bottom" side="top">
            <button
              onClick={scrollToBottom}
              className="w-7 h-7 rounded-full bg-[var(--color-surface-raised)]/80 backdrop-blur border border-[var(--color-border)]/20 flex items-center justify-center shadow-lg hover:shadow-xl transition-all"
            >
              <ArrowDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
