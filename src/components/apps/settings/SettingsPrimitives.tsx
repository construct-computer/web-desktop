import type { ReactNode } from 'react';
import { InfoHint } from '@/components/ui';

export function Toggle({ checked, onChange, disabled = false }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-emerald-500' : 'bg-black/15 dark:bg-white/20'
      } disabled:cursor-default disabled:opacity-60`}
    >
      <span
        className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        } mt-[2px]`}
      />
    </button>
  );
}

export function SectionPanel({ title, subtitle, action, children }: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-section">
      <div className={`settings-section-header ${action ? 'has-action' : ''}`}>
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold mb-1 tracking-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
        {action && <div className="settings-section-action">{action}</div>}
      </div>
      {!subtitle && !action && <div className="mb-1" />}
      {children}
    </div>
  );
}

export function SettingsSubsection({ title, description, children, className = '' }: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-[11px] text-[var(--color-text-muted)] mb-3 px-1 leading-snug">{description}</p>
      )}
      {children}
    </div>
  );
}

export function SettingsCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`settings-card surface-card border border-black/[0.06] dark:border-white/[0.06] ${className}`}>
      {children}
    </div>
  );
}

export function SettingsRow({ label, description, info, children, noBorder }: {
  label: string;
  description?: string;
  info?: ReactNode;
  children: ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div className={`settings-row ${
      !noBorder ? 'border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0' : ''
    }`}>
      <div className="settings-row-main">
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          {label}
          {info && <InfoHint side="top">{info}</InfoHint>}
        </span>
        {description && <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function DeviceSidebarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 18h5M10.5 14v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="15" y="10" width="5" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 16.2h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
