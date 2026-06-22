import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const PANEL_MS = 320;
const PANEL_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

interface OnboardingStepPanelProps {
  stepKey: string;
  direction?: 1 | -1;
  children: ReactNode;
  className?: string;
}

export function OnboardingStepPanel({
  stepKey,
  direction = 1,
  children,
  className,
}: OnboardingStepPanelProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const prefersReducedMotion =
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (el) setHeight(el.scrollHeight);
  }, [stepKey]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const syncHeight = () => {
      setHeight(el.scrollHeight);
    };

    syncHeight();
    const raf = requestAnimationFrame(syncHeight);

    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stepKey]);

  const enterClass = direction >= 0
    ? 'motion-safe:slide-in-from-right-3'
    : 'motion-safe:slide-in-from-left-3';

  return (
    <div
      className={cn('overflow-hidden', className)}
      style={{
        height: height ?? undefined,
        transition: prefersReducedMotion ? undefined : `height ${PANEL_MS}ms ${PANEL_EASE}`,
      }}
    >
      <div
        key={stepKey}
        ref={innerRef}
        className={cn(
          !prefersReducedMotion && 'animate-in fade-in duration-300',
          !prefersReducedMotion && enterClass,
        )}
        style={prefersReducedMotion ? undefined : { animationDuration: `${PANEL_MS}ms` }}
      >
        {children}
      </div>
    </div>
  );
}
