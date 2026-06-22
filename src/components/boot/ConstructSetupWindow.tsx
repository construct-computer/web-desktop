import { useEffect, useState, type ReactNode } from 'react';
import constructLogo from '@/assets/logo.png';
import { TitleBar } from '@/components/window/TitleBar';
import { kickOpenAnimation } from '@/lib/panelAnimation';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';

interface ConstructSetupWindowProps {
  title: string;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  exiting?: boolean;
}

export function ConstructSetupWindow({
  title,
  icon = constructLogo,
  children,
  footer,
  className,
  exiting = false,
}: ConstructSetupWindowProps) {
  const isMobile = useIsMobile();
  const [animating, setAnimating] = useState(false);
  const prefersReducedMotion =
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    return kickOpenAnimation(setAnimating, prefersReducedMotion);
  }, [prefersReducedMotion]);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border border-black/10 dark:border-white/15',
        'shadow-2xl shadow-black/30 dark:shadow-black/50',
        'glass-window rounded-xl',
        isMobile ? 'w-full h-full max-h-[100dvh] rounded-none border-0' : 'w-full max-w-[720px] max-h-[85vh]',
        !animating && !prefersReducedMotion && 'opacity-0 scale-[0.96]',
        animating && !exiting && !prefersReducedMotion && 'opacity-100 scale-100 transition-[opacity,transform,height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        animating && !exiting && prefersReducedMotion && 'opacity-100 scale-100',
        exiting && 'opacity-0 scale-[0.92] transition-all duration-300 ease-in pointer-events-none',
        className,
      )}
    >
      <TitleBar
        title={title}
        icon={icon}
        isFocused
        isMobile={isMobile}
        state="normal"
      />
      <div className="flex flex-1 min-h-0 flex-col md:flex-row transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
        {children}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-black/[0.06] dark:border-white/[0.06] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[var(--surface-sidebar-bg)]">
          {footer}
        </div>
      )}
    </div>
  );
}
