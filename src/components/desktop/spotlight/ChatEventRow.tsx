import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { ActivityIcon } from './ActivityIcon';
import { activityToneClass, type ActivityTone } from './activityStyles';
import type { ChatMessage } from '@/stores/agentStore';

function cleanErrorTitle(content: string): { title: string; detail?: string; raw?: string; badges?: string[] } {
  const simple = content.match(/^Error:\s*(.+)$/s);
  const value = simple?.[1] || content;
  const badges: string[] = [];

  if (simple?.[1]?.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(simple[1]);
      const err = parsed.error || parsed;
      const message = err.message || err.raw || value;
      if (err.code) badges.push(String(err.code));
      if (err.metadata?.provider_name) badges.push(String(err.metadata.provider_name));
      return { title: String(message), raw: simple[1], badges };
    } catch {
      return { title: value };
    }
  }

  return { title: value };
}

function eventMeta(msg: ChatMessage): {
  title: string;
  detail?: string;
  tone: ActivityTone;
  tool?: string;
  repeatCount?: number;
  raw?: string;
} {
  if (msg.noticeKind === 'incident') {
    const severity = msg.noticeSeverity || (msg.isError ? 'error' : 'warn');
    const title = msg.noticeTitle || msg.content.split('\n')[0] || 'Agent issue';
    return {
      title,
      detail: msg.noticeDetail,
      tone: severity === 'error' ? 'error' : severity === 'warn' ? 'warn' : 'info',
      tool: msg.noticeToolName,
      repeatCount: msg.noticeRepeatCount,
    };
  }

  if (msg.isError) {
    const parsed = cleanErrorTitle(msg.content);
    return {
      title: parsed.title,
      tone: 'error',
      tool: msg.tool,
      raw: parsed.raw,
    };
  }

  if (msg.noticeKind === 'watchdog' || msg.noticeKind === 'system_recovery') {
    return {
      title: msg.content,
      tone: 'info',
      tool: msg.noticeKind === 'system_recovery' ? 'system_recovery' : 'watchdog',
    };
  }

  return {
    title: msg.content,
    tone: 'default',
    tool: msg.tool,
  };
}

export function ChatEventRow({ msg, compact = false }: { msg: ChatMessage; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = useMemo(() => eventMeta(msg), [msg]);
  const isTerminal = msg.activityType === 'terminal';
  const hasDetails = Boolean(meta.detail || meta.raw);
  const colors = activityToneClass(msg.activityType, meta.tone);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(meta.raw || meta.detail || msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [meta.raw, meta.detail, msg.content]);

  return (
    <div className={compact ? 'flex items-center gap-2.5 py-[2px]' : 'px-3 sm:px-6 py-[3px]'}>
      <div className={compact ? 'flex items-center gap-2.5 min-w-0' : 'flex items-center gap-2.5 sm:gap-3 min-w-0'}>
        <div className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} shrink-0 rounded-full flex items-center justify-center ${colors}`}>
          <ActivityIcon type={msg.activityType} tone={meta.tone} tool={meta.tool} label={meta.title} className="w-3 h-3" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[12px] truncate ${isTerminal ? 'font-mono' : ''} ${meta.tone === 'error' ? 'text-red-300/75' : meta.tone === 'warn' ? 'text-amber-200/70' : 'text-[var(--color-text-muted)]/55'}`}>
              {meta.title}
            </span>
            {meta.repeatCount && meta.repeatCount > 1 && (
              <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]/30">
                x{meta.repeatCount}
              </span>
            )}
            {hasDetails && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-[var(--color-text-muted)]/35 hover:text-[var(--color-text-muted)]/60"
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Details
              </button>
            )}
          </div>
          {expanded && hasDetails && (
            <div className="mt-1.5 rounded-lg bg-black/10 px-2 py-1.5 text-[10px] leading-4 text-[var(--color-text-muted)]/50">
              {meta.detail && <div className="whitespace-pre-wrap">{meta.detail}</div>}
              {meta.raw && <pre className="mt-1 whitespace-pre-wrap break-all font-mono">{meta.raw}</pre>}
              <button
                type="button"
                onClick={handleCopy}
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]/45 hover:text-[var(--color-text-muted)]/70"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
