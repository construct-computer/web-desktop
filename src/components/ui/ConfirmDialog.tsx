import { useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayUnmount } from '@/hooks/useDelayUnmount';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Wider panel + slightly larger message text (billing confirmations). */
  wide?: boolean;
  recurringOptions?: {
    onDeleteOccurrence: () => void;
    onDeleteSeries: () => void;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

/** macOS-style confirm dialog scoped to the parent window (absolute overlay). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  wide = false,
  recurringOptions,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { shouldRender, isClosing } = useDelayUnmount(open, 250);

  if (!shouldRender) return null;

  return (
    <div
      ref={overlayRef}
      className={cn(
        'absolute inset-0 z-[60] flex items-center justify-center contained-scrim rounded-b-xl',
        isClosing && 'closing',
      )}
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel();
      }}
    >
      <div
        className={cn(
          'soft-popover border border-black/10 dark:border-white/15 rounded-xl',
          'shadow-[0_8px_24px_rgba(0,0,0,0.16)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.36)]',
          wide ? 'w-[320px]' : 'w-[280px]',
          'overflow-hidden',
          isClosing && 'closing',
        )}
      >
        <div className="px-5 pt-5 pb-4 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-sm font-semibold mb-1">{title}</h3>
          <p className={cn(
            'text-[var(--color-text-muted)] leading-relaxed',
            wide ? 'text-[13px]' : 'text-xs',
          )}>{message}</p>
        </div>
        {recurringOptions ? (
          <div className="flex flex-col border-t border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={recurringOptions.onDeleteOccurrence}
              className="py-2.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors border-b border-black/10 dark:border-white/10"
            >
              Delete only this event
            </button>
            <button
              type="button"
              onClick={recurringOptions.onDeleteSeries}
              className="py-2.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 transition-colors border-b border-black/10 dark:border-white/10"
            >
              Delete all events
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {cancelLabel}
            </button>
          </div>
        ) : (
          <div className="flex border-t border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 text-xs font-medium text-[var(--color-text-secondary)]
                         hover:bg-black/5 dark:hover:bg-white/5 transition-colors
                         border-r border-black/10 dark:border-white/10"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={cn(
                'flex-1 py-2.5 text-xs font-semibold transition-colors',
                destructive
                  ? 'text-red-500 hover:bg-red-500/10'
                  : 'text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]',
              )}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
