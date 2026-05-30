import { Blocks, XCircle } from 'lucide-react';
import type { ComponentMention } from '@/stores/agentStore';

function mentionTitle(mention: ComponentMention) {
  return `${mention.appId} / ${mention.path || mention.componentId}`;
}

function mentionLabel(mention: ComponentMention) {
  return mention.label || mention.componentId;
}

export function ComponentMentionToken({
  mention,
  onRemove,
  variant = 'input',
}: {
  mention: ComponentMention;
  onRemove?: () => void;
  variant?: 'input' | 'message';
}) {
  const isMessage = variant === 'message';
  return (
    <span
      title={mentionTitle(mention)}
      className={[
        'inline-flex max-w-[220px] shrink-0 items-center gap-1.5 align-baseline',
        'rounded-md border px-1.5 text-[11px] leading-5',
        isMessage
          ? 'mb-1 mr-1 border-white/10 bg-white/15 py-0 text-white/90'
          : 'h-7 border-sky-400/20 bg-sky-400/10 py-0.5 text-sky-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
      ].join(' ')}
      data-component-mention={`${mention.appId}:${mention.componentId}`}
    >
      <Blocks className={isMessage ? 'h-2.5 w-2.5 shrink-0' : 'h-3.5 w-3.5 shrink-0 text-sky-200/80'} />
      <span className="min-w-0 truncate">{mentionLabel(mention)}</span>
      <span className={isMessage ? 'text-white/45' : 'text-[10px] text-sky-100/45'}>
        {mention.componentType}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
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
