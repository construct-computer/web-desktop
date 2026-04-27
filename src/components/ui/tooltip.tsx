import { type ReactNode, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Z_INDEX } from '@/lib/constants';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  followCursor?: boolean;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 500,
  className,
  followCursor = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showTooltip = (e?: React.MouseEvent) => {
    if (e && followCursor) {
      setPos({ x: e.clientX, y: e.clientY });
    }
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setVisible(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (followCursor) {
      setPos({ x: e.clientX, y: e.clientY });
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const tooltipStyles: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1',
  };

  const baseClasses = cn(
    `px-2.5 py-1.5 text-xs rounded-lg
     glass-tooltip
     text-white
     border border-white/10
     shadow-2xl pointer-events-none`,
    !followCursor && "whitespace-nowrap",
    followCursor && "max-w-[260px] whitespace-normal text-balance leading-relaxed",
    className
  );

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onMouseMove={handleMouseMove}
      onFocus={() => showTooltip()}
      onBlur={hideTooltip}
    >
      {children}
      {visible && !followCursor && (
        <div
          className={cn("absolute", tooltipStyles[side], baseClasses)}
          style={{ zIndex: Z_INDEX.tooltip }}
        >
          {content}
        </div>
      )}
      {visible && followCursor && createPortal(
        <div
          className={cn("fixed z-[99999]", baseClasses)}
          style={{
            left: pos.x + 10,
            top: pos.y + 10,
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </div>
  );
}
