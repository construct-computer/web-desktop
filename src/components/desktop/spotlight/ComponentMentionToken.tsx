import { Blocks, XCircle } from 'lucide-react';
import type { ComponentMention } from '@/stores/agentStore';

function mentionTitle(mention: ComponentMention) {
  const app = mention.appName || mention.appId;
  return `${app} / ${mention.path || mention.componentId}`;
}

function mentionLabel(mention: ComponentMention) {
  return mention.label || mention.componentId;
}

function mentionApp(mention: ComponentMention) {
  return mention.appName || mention.appId;
}

export function ComponentMentionToken({
  mention,
  onOpen,
  onRemove,
  variant = 'input',
}: {
  mention: ComponentMention;
  onOpen?: () => void;
  onRemove?: () => void;
  variant?: 'input' | 'message';
}) {
  const isMessage = variant === 'message';
  const clickable = Boolean(onOpen);
  return (
    <span
      title={mentionTitle(mention)}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={clickable ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen?.();
      } : undefined}
      className={[
        'inline-flex max-w-[280px] shrink-0 items-center gap-1.5 align-baseline',
        'rounded-md border px-1.5 text-[11px] leading-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        clickable && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20',
        isMessage
          ? 'mb-1 mr-1 border-white/10 bg-white/15 py-0 text-white/90'
          : 'h-7 border-white/10 bg-white/[0.08] py-0.5 text-[var(--color-text)]',
      ].filter(Boolean).join(' ')}
      data-component-mention={`${mention.appId}:${mention.componentId}`}
    >
      <Blocks className={isMessage ? 'h-2.5 w-2.5 shrink-0' : 'h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]'} />
      <span className="min-w-0 truncate">
        <span className={isMessage ? 'text-white/55' : 'text-[var(--color-text-muted)]'}>{mentionApp(mention)} / </span>
        {mentionLabel(mention)}
      </span>
      <span className={isMessage ? 'text-white/45' : 'rounded-sm bg-black/20 px-1 font-mono text-[10px] text-[var(--color-text-muted)]/75'}>
        {mention.componentType}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className={[
            'ml-0.5 rounded-sm p-0.5 transition-colors',
            isMessage ? 'hover:bg-white/10 hover:text-red-100' : 'hover:bg-white/10 hover:text-red-300',
          ].join(' ')}
          aria-label={`Remove ${mentionLabel(mention)} mention`}
        >
          <XCircle className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
