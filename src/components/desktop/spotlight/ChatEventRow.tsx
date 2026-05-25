import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileCode } from 'lucide-react';
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
    const title = msg.noticeTitle || msg.content.split('\n')[0] || 'Construct issue';
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

function memoryEnvironmentLabel(value?: string): string | null {
  if (!value) return null;
  if (value === 'prod') return 'production';
  if (value === 'staging' || value === 'local') return value;
  return value;
}

function memoryEventLabel(event: 'ADD' | 'UPDATE' | 'RECALL'): string {
  if (event === 'RECALL') return 'recalled';
  return event === 'ADD' ? 'created' : 'updated';
}

export function ChatEventRow({ msg, compact = false }: { msg: ChatMessage; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = useMemo(() => eventMeta(msg), [msg]);
  const isTerminal = msg.activityType === 'terminal';
  const memoryActivity = msg.memoryActivity;
  const hasMemoryDetails = Boolean(memoryActivity?.items.length);
  const hasDetails = Boolean(hasMemoryDetails || meta.detail || meta.raw);
  const colors = activityToneClass(msg.activityType, meta.tone);

  const handleCopy = useCallback(() => {
    const memoryText = memoryActivity?.items
      .map((item) => `${memoryEventLabel(item.event)}: ${item.memory}`)
      .join('\n');
    navigator.clipboard.writeText(memoryText || meta.raw || meta.detail || msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [memoryActivity, meta.raw, meta.detail, msg.content]);

  if (msg.codePreview) {
    return <CodePreviewCard msg={msg} compact={compact} />;
  }

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
              {memoryActivity ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[var(--color-text-muted)]/45">
                    <span>{memoryActivity.action === 'recalled' ? 'Retrieved from' : 'Stored in'}</span>
                    <span className="font-medium text-[var(--color-text-muted)]/65">{memoryActivity.provider}</span>
                    {memoryEnvironmentLabel(memoryActivity.environment) && (
                      <span>({memoryEnvironmentLabel(memoryActivity.environment)})</span>
                    )}
                    {memoryActivity.scope && (
                      <span className="rounded bg-white/5 px-1 py-px text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]/45">
                        {memoryActivity.scope}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {memoryActivity.items.map((item) => (
                      <div key={item.id} className="rounded-md border border-white/5 bg-white/[0.025] px-2 py-1">
                        <div className="mb-0.5 text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]/35">
                          {memoryEventLabel(item.event)}
                          {typeof item.score === 'number' && (
                            <span className="ml-1 normal-case tracking-normal text-[var(--color-text-muted)]/30">
                              {Math.round(item.score * 100)}%
                            </span>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap break-words text-[var(--color-text-muted)]/65">
                          {item.memory}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {meta.detail && <div className="whitespace-pre-wrap">{meta.detail}</div>}
                  {meta.raw && <pre className="mt-1 whitespace-pre-wrap break-all font-mono">{meta.raw}</pre>}
                </>
              )}
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

function CodePreviewCard({ msg, compact = false }: { msg: ChatMessage; compact?: boolean }) {
  const preview = msg.codePreview!;
  const [activePath, setActivePath] = useState(preview.files[0]?.path || '');
  const [expanded, setExpanded] = useState(preview.status !== 'done');
  const [copied, setCopied] = useState(false);
  const activeFile = preview.files.find(file => file.path === activePath) || preview.files[0];
  const statusLabel = preview.status === 'done'
    ? 'Ready'
    : preview.status === 'writing'
      ? 'Writing files'
      : 'Generating code';

  const handleCopy = useCallback(() => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeFile]);

  return (
    <div className={compact ? 'flex items-start gap-2.5 py-[2px]' : 'px-3 sm:px-6 py-2'}>
      <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 w-full">
        <div className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center bg-blue-500/15 text-blue-200/80">
          <FileCode className="w-3 h-3" />
        </div>
        <div className="min-w-0 flex-1 max-w-3xl rounded-lg border border-white/8 bg-black/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-[var(--color-text)]/80 truncate">
                {preview.title}
              </span>
              <span className="block text-[10px] text-[var(--color-text-muted)]/55 truncate">
                {statusLabel}{preview.appId ? ` · ${preview.appId}` : ''} · {preview.files.length} file{preview.files.length === 1 ? '' : 's'}
              </span>
            </span>
            <span className="shrink-0 text-[var(--color-text-muted)]/45">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
          </button>
          {expanded && activeFile && (
            <div className="border-t border-white/8">
              <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 border-b border-white/8">
                {preview.files.map(file => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setActivePath(file.path)}
                    className={`shrink-0 rounded px-2 py-1 text-[10px] font-mono ${
                      file.path === activeFile.path
                        ? 'bg-white/10 text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)]/60 hover:bg-white/5 hover:text-[var(--color-text-muted)]'
                    }`}
                  >
                    {file.path}
                    {!file.complete && <span className="ml-1 text-blue-200/70">writing</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]/45">
                <span>{activeFile.language || 'text'}{activeFile.truncated ? ' · preview truncated' : ''}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 hover:text-[var(--color-text-muted)]/75"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-72 overflow-auto bg-black/20 px-3 py-2 text-[11px] leading-5 text-[var(--color-text)]/78">
                <code>{activeFile.content}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
