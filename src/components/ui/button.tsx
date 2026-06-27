import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const base = 'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer rounded-[var(--radius-button)]';

const variants = {
  default: 'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] shadow-sm hover:bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)] active:shadow-inner active:bg-[var(--color-surface)]',
  primary: 'bg-[var(--color-accent)] text-white border border-[var(--color-accent-hover)] shadow-sm hover:bg-[var(--color-accent-hover)] hover:shadow active:shadow-inner',
  ghost: 'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface)]/60 border border-transparent',
  destructive: 'bg-[var(--color-error)] text-white border border-[var(--color-error)] shadow-sm hover:opacity-90',
  link: 'bg-transparent text-[var(--color-accent)] underline-offset-4 hover:underline border-none',
} as const;

const sizes = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
  icon: 'h-8 w-8',
  'icon-sm': 'h-6 w-6',
} as const;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(base, variants[variant ?? 'default'], sizes[size ?? 'md'], className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
