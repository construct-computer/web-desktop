import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileCode } from 'lucide-react';
import { ActivityIconBadge } from './ActivityIconBadge';
import { resolveActivityIconHints } from '@/lib/toolActivityIcon';
import type { ActivityTone } from './activityStyles';
import type { ChatMessage } from '@/stores/agentStore';
import { isBrowserWebTool } from '@/stores/browserTabStore';
import { BrowserActivityRow } from './BrowserActivityRow';
import { WebToolActivityRow } from './WebToolActivityRow';
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

  if (msg.activityStatus === 'failed') {
    return {
      title: msg.content,
      tone: 'error',
      tool: msg.tool,
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

type MemoryActivity = NonNullable<ChatMessage['memoryActivity']>;

export function memoryActivityTitle(activity: MemoryActivity): string {
  if (activity.status === 'pending') return 'Memory saving';
  if (activity.action === 'recalled') {
    return activity.items.length > 1 ? `Memory recalled · ${activity.items.length} items` : 'Memory recalled';
  }

  const hasUpdate = activity.items.some((item) => item.event === 'UPDATE');
  const action = hasUpdate ? 'updated' : 'created';
  return activity.items.length > 1 ? `Memory ${action} · ${activity.items.length} items` : `Memory ${action}`;
}

export function memoryActivitySummary(activity: MemoryActivity): string | null {
  if (activity.items.length !== 1) return null;
  return activity.items[0]?.memory || null;
}

type PolicyActivity = NonNullable<ChatMessage['policyActivity']>;

export function policyActivityTitle(activity: PolicyActivity): string {
  if (activity.items.length > 1) return `Learned defaults · ${activity.items.length}`;
  return 'Learned default';
}

export function policyActivitySummary(activity: PolicyActivity): string | null {
  if (activity.items.length !== 1) return null;
  return activity.items[0]?.title || null;
}

export function ChatEventRow({ msg, compact = false }: { msg: ChatMessage; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = useMemo(() => eventMeta(msg), [msg]);
  const isTerminal = msg.activityType === 'terminal';
  const memoryActivity = msg.memoryActivity;
  const policyActivity = msg.policyActivity;
  const hasDetails = Boolean(meta.detail || meta.raw);

  const handleCopy = useCallback(() => {
    const memoryText = memoryActivity?.items
      .map((item) => item.memory)
      .join('\n');
    navigator.clipboard.writeText(memoryText || meta.raw || meta.detail || msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [memoryActivity, meta.raw, meta.detail, msg.content]);

  if (msg.codePreview) {
    return <CodePreviewCard msg={msg} compact={compact} />;
  }

  if (msg.tool && isBrowserWebTool(msg.tool)) {
    return (
      <div className={compact ? 'px-1 py-[2px]' : 'px-3 sm:px-6 py-[3px]'}>
        <WebToolActivityRow
          message={msg}
          failed={msg.activityStatus === 'failed' || msg.isError}
        />
      </div>
    );
  }

  if (msg.activityType === 'web' && msg.browserAction) {
    return (
      <div className={compact ? 'px-1 py-[2px]' : 'px-3 sm:px-6 py-[3px]'}>
        <BrowserActivityRow message={msg} />
      </div>
    );
  }

  if (policyActivity) {
    const title = policyActivityTitle(policyActivity);
    const summary = policyActivitySummary(policyActivity);
    const canExpand = policyActivity.items.length > 0;
    const policyIconHints = resolveActivityIconHints('autopilot');

    return (
      <div className={compact ? 'flex items-center gap-2.5 py-[2px]' : 'px-3 sm:px-6 py-[3px]'}>
        <div className={compact ? 'flex items-center gap-2.5 min-w-0 w-full' : 'flex items-center gap-2.5 sm:gap-3 min-w-0 w-full'}>
          <ActivityIconBadge
            tool="autopilot"
            iconPlatform={policyIconHints.iconPlatform}
            iconUrl={policyIconHints.iconUrl}
            size={compact ? 'sm' : 'md'}
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!canExpand}
              onClick={() => canExpand && setExpanded(!expanded)}
              className="group flex max-w-full items-center gap-1.5 text-left disabled:cursor-default"
            >
              <span className="shrink-0 text-[12px] font-medium text-[var(--color-text-muted)]/55">{title}</span>
              {summary && (
                <>
                  <span className="shrink-0 text-[12px] text-[var(--color-text-muted)]/22">·</span>
                  <span className="min-w-0 truncate text-[12px] text-[var(--color-text-muted)]/40 group-hover:text-[var(--color-text-muted)]/55">
                    {summary}
                  </span>
                </>
              )}
              {canExpand && (
                <span className="shrink-0 text-[var(--color-text-muted)]/25 group-hover:text-[var(--color-text-muted)]/45">
                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </span>
              )}
            </button>
            {expanded && (
              <div className="mt-1 space-y-1 pl-0.5">
                {policyActivity.items.map((item) => (
                  <p key={item.id} className="text-[11px] leading-relaxed text-[var(--color-text-muted)]/55">
                    <span className="text-[var(--color-text-muted)]/70">{item.title}</span>
                    {item.description ? ` — ${item.description}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (memoryActivity) {
    const title = memoryActivityTitle(memoryActivity);
    const summary = memoryActivitySummary(memoryActivity);
    const canExpand = memoryActivity.items.length > 0;
    const memoryIconHints = resolveActivityIconHints('memory');

    return (
      <div className={compact ? 'flex items-center gap-2.5 py-[2px]' : 'px-3 sm:px-6 py-[3px]'}>
        <div className={compact ? 'flex items-center gap-2.5 min-w-0 w-full' : 'flex items-center gap-2.5 sm:gap-3 min-w-0 w-full'}>
          <ActivityIconBadge
            tool="memory"
            iconPlatform={memoryIconHints.iconPlatform}
            iconUrl={memoryIconHints.iconUrl}
            size={compact ? 'sm' : 'md'}
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!canExpand}
              onClick={() => canExpand && setExpanded(!expanded)}
              className="group flex max-w-full items-center gap-1.5 text-left disabled:cursor-default"
            >
              <span className="shrink-0 text-[12px] font-medium text-[var(--color-text-muted)]/55">{title}</span>
              {summary && (
                <>
                  <span className="shrink-0 text-[12px] text-[var(--color-text-muted)]/22">·</span>
                  <span className="min-w-0 truncate text-[12px] text-[var(--color-text-muted)]/40 group-hover:text-[var(--color-text-muted)]/55">
                    {summary}
                  </span>
                </>
              )}
              {canExpand && (
                <span className="shrink-0 text-[var(--color-text-muted)]/25 group-hover:text-[var(--color-text-muted)]/45">
                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </span>
              )}
            </button>

            {expanded && canExpand && (
              <div className="mt-0.5 max-w-2xl border-l border-white/5 pl-2 text-[10px] leading-4 text-[var(--color-text-muted)]/55">
                <div className="space-y-0.5">
                  {memoryActivity.items.map((item) => (
                    <div key={item.id} className="whitespace-pre-wrap break-words text-[var(--color-text-muted)]/62">
                      {item.memory}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]/35 hover:text-[var(--color-text-muted)]/62"
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

  return (
    <div className={compact ? 'flex items-center gap-2.5 py-[2px]' : 'px-3 sm:px-6 py-[3px]'}>
      <div className={compact ? 'flex items-center gap-2.5 min-w-0' : 'flex items-center gap-2.5 sm:gap-3 min-w-0'}>
        <ActivityIconBadge
          type={msg.activityType}
          tone={meta.tone}
          tool={msg.tool ?? meta.tool}
          label={meta.title}
          iconPlatform={msg.iconPlatform}
          iconUrl={msg.iconUrl}
          failed={meta.tone === 'error' || meta.tone === 'warn'}
          size={compact ? 'sm' : 'md'}
        />
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

function CodePreviewCard({ msg, compact = false }: { msg: ChatMessage; compact?: boolean }) {
  const preview = msg.codePreview!;
  const [activePath, setActivePath] = useState(preview.files[0]?.path || '');
  const [expanded, setExpanded] = useState(preview.status !== 'done');
  const [copied, setCopied] = useState(false);
  const activeFile = preview.files.find(file => file.path === activePath) || preview.files[0];
  const isConstructSpecPreview = preview.action === 'create_declarative'
    || preview.action === 'update_declarative'
    || preview.action === 'patch_component';
  const statusLabel = preview.status === 'done'
    ? 'Ready'
    : preview.status === 'writing'
      ? (isConstructSpecPreview ? 'Writing spec' : 'Writing files')
      : (isConstructSpecPreview ? 'Generating spec' : 'Generating code');

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
