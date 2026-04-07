import { cn } from '@/lib/utils';
import type { WindowState } from '@/types';

interface TitleBarProps {
  title: string;
  icon?: string;
  isFocused: boolean;
  isMobile?: boolean;
  state: WindowState;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onDoubleClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function TitleBar({
  title,
  icon,
  isFocused,
  isMobile,
  state,
  onMinimize,
  onMaximize,
  onClose,
  onDoubleClick,
  onPointerDown,
  onContextMenu,
}: TitleBarProps) {
  return (
    <div
      className={cn(
        'flex items-center select-none shrink-0 touch-none',
        isMobile ? 'h-11 px-3' : 'h-8 px-2.5',
      )}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Window control dots - Mac style, on the left */}
      <div className={cn('flex items-center group', isMobile ? 'gap-2.5 mr-3' : 'gap-1.5 mr-3')}>
        {/* Close */}
        <button
          className={cn(
            'rounded-full transition-all',
            isMobile ? 'w-5 h-5' : 'w-3.5 h-3.5',
            isFocused
              ? 'bg-[var(--color-dot-close)] hover:brightness-90'
              : 'bg-black/10 dark:bg-white/20'
          )}
          onClick={onClose ? (e) => {
            e.stopPropagation();
            onClose();
          } : undefined}
          title="Close"
        />
        
        {/* Minimize — hide on mobile since windows are always maximized */}
        {!isMobile && (
          <button
            className={cn(
              'rounded-full transition-all',
              'w-3.5 h-3.5',
              isFocused
                ? 'bg-[var(--color-dot-minimize)] hover:brightness-90'
                : 'bg-black/10 dark:bg-white/20'
            )}
            onClick={onMinimize ? (e) => {
              e.stopPropagation();
              onMinimize();
            } : undefined}
            title="Minimize"
          />
        )}
        
        {/* Maximize — hide on mobile since windows are always maximized */}
        {!isMobile && (
          <button
            className={cn(
              'rounded-full transition-all',
              'w-3.5 h-3.5',
              isFocused
                ? 'bg-[var(--color-dot-maximize)] hover:brightness-90'
                : 'bg-black/10 dark:bg-white/20'
            )}
            onClick={onMaximize ? (e) => {
              e.stopPropagation();
              onMaximize();
            } : undefined}
            title={state === 'maximized' ? 'Restore' : 'Maximize'}
          />
        )}
      </div>
      
      {/* Icon */}
      {icon && (
        <img src={icon} alt="" className={isMobile ? 'w-5 h-5 mr-2' : 'w-4 h-4 mr-1.5'} />
      )}
      
      {/* Title - centered */}
      <span
        className={cn(
          'flex-1 font-medium truncate text-center select-none',
          isMobile ? 'text-base' : 'text-sm',
          isFocused
            ? 'text-black/90 dark:text-white'
            : 'text-black/40 dark:text-white/50'
        )}
      >
        {title}
      </span>
      
      {/* Spacer to balance the dots on the left */}
      <div className={isMobile ? 'w-[28px]' : 'w-[58px]'} />
    </div>
  );
}
