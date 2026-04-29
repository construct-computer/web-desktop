import { type CSSProperties, type ReactNode, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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

interface TooltipPosition {
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateTooltipPosition = useCallback(() => {
    if (followCursor) return;
    if (typeof window === 'undefined') return;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - tooltipRect.height - margin);
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const centeredTop = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;

    let left = centeredLeft;
    let top = triggerRect.top - tooltipRect.height - gap;

    if (side === 'bottom') {
      top = triggerRect.bottom + gap;
    } else if (side === 'left') {
      left = triggerRect.left - tooltipRect.width - gap;
      top = centeredTop;
    } else if (side === 'right') {
      left = triggerRect.right + gap;
      top = centeredTop;
    }

    setTooltipPosition({
      left: clamp(left, margin, maxLeft),
      top: clamp(top, margin, maxTop),
    });
  }, [followCursor, side]);

  const showTooltip = (e?: React.MouseEvent) => {
    if (e && followCursor) {
      setPos({ x: e.clientX, y: e.clientY });
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setTooltipPosition(null);
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

  useLayoutEffect(() => {
    if (!visible || followCursor) return;
    if (typeof window === 'undefined') return;
    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);
    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [visible, followCursor, content, updateTooltipPosition]);

  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;

  const tooltipStyle: CSSProperties = followCursor
    ? {
        left: viewportWidth > 0 ? clamp(pos.x + 10, 8, viewportWidth - 8) : pos.x + 10,
        top: viewportHeight > 0 ? clamp(pos.y + 10, 8, viewportHeight - 8) : pos.y + 10,
      }
    : tooltipPosition
      ? {
          left: tooltipPosition.left,
          top: tooltipPosition.top,
          visibility: 'visible',
        }
      : {
          left: 0,
          top: 0,
          visibility: 'hidden',
        };

  const baseClasses = cn(
    `px-2.5 py-1.5 text-xs rounded-lg
     glass-tooltip
     text-white
     border border-white/10
     shadow-2xl pointer-events-none`,
    !followCursor && "whitespace-nowrap max-w-[calc(100vw-16px)]",
    followCursor && "max-w-[260px] whitespace-normal text-balance leading-relaxed",
    className
  );

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onMouseMove={handleMouseMove}
      onFocus={() => showTooltip()}
      onBlur={hideTooltip}
    >
      {children}
      {visible && !followCursor && createPortal(
        <div
          ref={tooltipRef}
          className={cn("fixed", baseClasses)}
          style={{ ...tooltipStyle, zIndex: Z_INDEX.tooltip }}
        >
          {content}
        </div>,
        document.body
      )}
      {visible && followCursor && createPortal(
        <div
          className={cn("fixed", baseClasses)}
          style={{ ...tooltipStyle, zIndex: Z_INDEX.tooltip }}
        >
          {content}
        </div>,
        document.body
      )}
    </div>
  );
}
