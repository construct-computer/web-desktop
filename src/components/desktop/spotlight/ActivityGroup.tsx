import { useState } from 'react';
import { Globe, Terminal, FileText, Monitor, Wrench, Zap, CalendarDays, Network, Cog, ChevronDown, ChevronRight } from 'lucide-react';
import type { ChatMessage } from '@/stores/agentStore';

export function ActivityIcon({ type, className }: { type?: ChatMessage['activityType']; className?: string }) {
  const cls = className || 'w-3 h-3';
  switch (type) {
    case 'browser': return <Globe className={cls} />;
    case 'tinyfish': return <Zap className={cls} />;
    case 'terminal': return <Terminal className={cls} />;
    case 'file': return <FileText className={cls} />;
    case 'desktop': return <Monitor className={cls} />;
    case 'calendar': return <CalendarDays className={cls} />;
    case 'delegation': return <Network className={cls} />;
    case 'background': return <Cog className={cls} />;
    default: return <Wrench className={cls} />;
  }
}

const ACTIVITY_COLORS: Record<string, string> = {
  browser: 'text-blue-400 bg-blue-400/10',
  tinyfish: 'text-amber-400 bg-amber-400/10',
  terminal: 'text-green-400 bg-green-400/10',
  file: 'text-purple-400 bg-purple-400/10',
  desktop: 'text-cyan-400 bg-cyan-400/10',
  calendar: 'text-orange-400 bg-orange-400/10',
  delegation: 'text-emerald-400 bg-emerald-400/10',
  background: 'text-gray-400 bg-gray-400/10',
  tool: 'text-[var(--color-text-muted)]/60 bg-white/5',
};

function ActivityLine({ msg }: { msg: ChatMessage }) {
  const colors = ACTIVITY_COLORS[msg.activityType || 'tool'] || ACTIVITY_COLORS.tool;
  const isTerminal = msg.activityType === 'terminal';

  return (
    <div className="flex items-center gap-2.5 px-5 py-[3px]">
      <div className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${colors}`}>
        <ActivityIcon type={msg.activityType} className="w-3 h-3" />
      </div>
      <span className={`text-[12px] text-[var(--color-text-muted)]/50 truncate ${isTerminal ? 'font-mono' : ''}`}>
        {msg.content}
      </span>
    </div>
  );
}

export function ActivityGroup({ activities }: { activities: ChatMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  if (activities.length === 0) return null;
  if (activities.length <= 2) {
    return <>{activities.map((msg, i) => <ActivityLine key={i} msg={msg} />)}</>;
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
              <ActivityIcon type={first.activityType} className="w-2.5 h-2.5" />
            </div>
            <span className="truncate">{first.content}</span>
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-white/5 text-[10px]">+{middle} more</span>
            <div className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center ${ACTIVITY_COLORS[last.activityType || 'tool'] || ACTIVITY_COLORS.tool}`}>
              <ActivityIcon type={last.activityType} className="w-2.5 h-2.5" />
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
            {activities.map((msg, i) => <ActivityLine key={i} msg={msg} />)}
          </div>
        </>
      )}
    </div>
  );
}
