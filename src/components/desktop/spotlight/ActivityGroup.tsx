import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ActivityIconBadge } from './ActivityIconBadge';
import { ChatEventRow } from './ChatEventRow';
import { mergeBrowserRepeats } from './browserActivityUtils';
import type { ChatMessage } from '@/stores/agentStore';

function withRepeatCount(msg: ChatMessage, repeat: number): ChatMessage {
  if (repeat <= 1) return msg;
  return { ...msg, noticeRepeatCount: repeat };
}

export function ActivityGroup({ activities }: { activities: ChatMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  const merged = mergeBrowserRepeats(activities);
  if (merged.length === 0) return null;
  if (merged.length <= 2) {
    return (
      <>
        {merged.map(({ act, repeat }, i) => (
          <ChatEventRow key={i} msg={withRepeatCount(act, repeat)} />
        ))}
      </>
    );
  }

  const first = merged[0].act;
  const last = merged[merged.length - 1].act;
  const middle = merged.length - 2;

  return (
    <div className="px-5 py-0.5">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)]/60 transition-colors w-full"
        >
          <ChevronRight className="w-3 h-3 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <ActivityIconBadge
              type={first.activityType}
              tool={first.tool}
              label={first.content}
              iconPlatform={first.iconPlatform}
              iconUrl={first.iconUrl}
              size="sm"
            />
            <span className="truncate">{first.content}</span>
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-white/5 text-[10px]">+{middle} more</span>
            <ActivityIconBadge
              type={last.activityType}
              tool={last.tool}
              label={last.content}
              iconPlatform={last.iconPlatform}
              iconUrl={last.iconUrl}
              size="sm"
            />
            <span className="truncate">{last.content}</span>
          </div>
        </button>
      ) : (
        <>
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)]/60 transition-colors mb-1"
          >
            <ChevronDown className="w-3 h-3" />
            <span>{merged.length} actions</span>
          </button>
          <div className="ml-1.5 border-l border-[var(--color-border)]/15 pl-2">
            {merged.map(({ act, repeat }, i) => (
              <ChatEventRow key={i} msg={withRepeatCount(act, repeat)} compact />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
