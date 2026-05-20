import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ActivityIcon } from './ActivityIcon';
import { ACTIVITY_COLORS } from './activityStyles';
import { ChatEventRow } from './ChatEventRow';
import type { ChatMessage } from '@/stores/agentStore';

export function ActivityGroup({ activities }: { activities: ChatMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  if (activities.length === 0) return null;
  if (activities.length <= 2) {
    return <>{activities.map((msg, i) => <ChatEventRow key={i} msg={msg} />)}</>;
  }

  const first = activities[0];
  const last = activities[activities.length - 1];
  const middle = activities.length - 2;

  return (
    <div className="px-5 py-0.5">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)]/60 transition-colors w-full"
        >
          <ChevronRight className="w-3 h-3 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center ${ACTIVITY_COLORS[first.activityType || 'tool'] || ACTIVITY_COLORS.tool}`}>
              <ActivityIcon type={first.activityType} tool={first.tool} label={first.content} className="w-2.5 h-2.5" />
            </div>
            <span className="truncate">{first.content}</span>
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-white/5 text-[10px]">+{middle} more</span>
            <div className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center ${ACTIVITY_COLORS[last.activityType || 'tool'] || ACTIVITY_COLORS.tool}`}>
              <ActivityIcon type={last.activityType} tool={last.tool} label={last.content} className="w-2.5 h-2.5" />
            </div>
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
            <span>{activities.length} actions</span>
          </button>
          <div className="ml-1.5 border-l border-[var(--color-border)]/15 pl-2">
            {activities.map((msg, i) => <ChatEventRow key={i} msg={msg} compact />)}
          </div>
        </>
      )}
    </div>
  );
}
