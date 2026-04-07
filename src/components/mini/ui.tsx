/**
 * Shared UI primitives for the Telegram Mini App.
 * Matches desktop design system aesthetics in mobile-native layouts.
 */

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react';
import { X, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';

// ── Theme helper ──

export function tp() {
  return window.Telegram?.WebApp?.themeParams;
}

export function accent() {
  return tp()?.button_color || '#60A5FA';
}

export function bg() {
  return tp()?.bg_color || '#09090b';
}

export function bg2() {
  return tp()?.secondary_bg_color || 'rgba(255,255,255,0.04)';
}

export function textColor() {
  return tp()?.text_color || '#fafafa';
}

export function haptic(type: 'light' | 'medium' | 'success' | 'error' | 'warning' = 'light') {
  try {
    if (type === 'success' || type === 'error' || type === 'warning') {
      (window.Telegram?.WebApp?.HapticFeedback as any)?.notificationOccurred?.(type);
    } else {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
    }
  } catch {}
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('construct:token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api(path: string, opts?: RequestInit) {
  return fetch(`/api${path}`, { ...opts, headers: { ...authHeaders(), ...opts?.headers } });
}

export async function apiJSON<T = any>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await api(path, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Toast System ──

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const variantStyles: Record<ToastVariant, { bg: string; icon: typeof Info }> = {
    success: { bg: 'rgba(34,197,94,0.9)', icon: CheckCircle2 },
    error: { bg: 'rgba(239,68,68,0.9)', icon: AlertCircle },
    info: { bg: 'rgba(59,130,246,0.9)', icon: Info },
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-0 left-0 right-0 z-[100] flex flex-col items-center gap-1.5 pt-2 px-4 pointer-events-none">
        {toasts.map(t => {
          const style = variantStyles[t.variant];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-[13px] font-medium shadow-lg pointer-events-auto"
              style={{ backgroundColor: style.bg, backdropFilter: 'blur(12px)', animation: 'mini-toast-in 200ms ease-out' }}
            >
              <Icon size={14} />
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ── Back Handler Context ──
// Allows screens with sub-navigation to register a custom back handler
// that overrides the default MiniApp popScreen. Telegram's native BackButton
// is the sole back button — no in-app back arrows needed.

type BackHandlerFn = (() => void) | null;

const BackHandlerContext = createContext<{
  setBackHandler: (handler: BackHandlerFn) => void;
}>({ setBackHandler: () => {} });

export const BackHandlerProvider = BackHandlerContext.Provider;

export function useBackHandlerContext() {
  return useContext(BackHandlerContext);
}

/**
 * Register a custom back handler for screens with internal sub-navigation.
 * When set, Telegram's BackButton will call this instead of popping the screen stack.
 * Pass null to clear (restore default pop behavior).
 */
export function useBackHandler(handler: BackHandlerFn) {
  const { setBackHandler } = useBackHandlerContext();
  useEffect(() => {
    setBackHandler(handler);
    return () => setBackHandler(null);
  }, [handler, setBackHandler]);
}

// ── Screen Header ──

export function MiniHeader({ title, onBack, actions }: {
  title: string;
  /** @deprecated Use useBackHandler() instead — Telegram's native BackButton handles navigation */
  onBack?: () => void;
  actions?: ReactNode;
}) {
  // Register onBack with the Telegram BackButton system (no in-app arrow shown)
  useBackHandler(onBack || null);

  return (
    <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="text-[16px] font-semibold flex-1 truncate" style={{ color: textColor() }}>{title}</h2>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}

// ── Confirm Dialog ──

export function ConfirmDialog({ title, message, confirmLabel, destructive, onConfirm, onCancel }: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="w-full max-w-sm rounded-t-2xl p-5 pb-8"
        style={{ backgroundColor: bg(), animation: 'mini-sheet-up 200ms ease-out' }}
      >
        <h3 className="text-[16px] font-semibold mb-1" style={{ color: textColor() }}>{title}</h3>
        {message && <p className="text-[13px] opacity-50 mb-4">{message}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[14px] font-medium"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-[14px] font-medium"
            style={{
              backgroundColor: destructive ? '#ef4444' : accent(),
              color: '#fff',
            }}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton Loader ──

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg ${className || 'h-4 w-full'}`}
      style={{ backgroundColor: 'rgba(255,255,255,0.06)', animation: 'mini-shimmer 1.5s ease-in-out infinite' }}
    />
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="px-4 py-3 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty State ──

export function EmptyState({ icon: Icon, message }: { icon: typeof Info; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 opacity-30">
      <Icon size={36} className="mb-3" />
      <p className="text-[13px]">{message}</p>
    </div>
  );
}

// ── Badge ──

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
      style={{ backgroundColor: color ? `${color}20` : 'rgba(255,255,255,0.08)', color: color || 'rgba(255,255,255,0.5)' }}
    >
      {children}
    </span>
  );
}

// ── Action Button (icon button in headers) ──

export function IconBtn({ onClick, children, disabled, className }: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-lg active:bg-white/5 disabled:opacity-20 ${className || ''}`}
    >
      {children}
    </button>
  );
}

// ── Card ──

export function Card({ children, className, onClick }: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`rounded-xl p-3 text-left w-full ${onClick ? 'active:bg-white/[0.06]' : ''} ${className || ''}`}
      style={{
        backgroundColor: bg2(),
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }}
    >
      {children}
    </Tag>
  );
}

// ── Section Header ──

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider opacity-30 block mb-2">
      {children}
    </span>
  );
}

// ── Loading Spinner ──

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin opacity-30" />;
}

// ── Input Field ──

export function Field({ label, value, onChange, disabled, placeholder, type }: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium uppercase tracking-wider opacity-40 mb-1 block">{label}</label>
      <input
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        disabled={disabled}
        placeholder={placeholder}
        type={type}
        className="w-full text-[14px] px-3.5 py-2.5 rounded-xl outline-none disabled:opacity-40"
        style={{ backgroundColor: bg2(), color: textColor() }}
      />
    </div>
  );
}

// ── Toggle Switch ──

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-[22px] rounded-full transition-colors"
        style={{ backgroundColor: checked ? accent() : 'rgba(255,255,255,0.12)' }}
      >
        <span
          className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform"
          style={{ left: checked ? '20px' : '2px' }}
        />
      </button>
      {label && <span className="text-[13px] opacity-60">{label}</span>}
    </label>
  );
}

// ── Platform Badge ──

const PLATFORM_STYLES: Record<string, { color: string; label: string }> = {
  slack: { color: '#4A154B', label: 'Slack' },
  telegram: { color: '#2AABEE', label: 'Telegram' },
  email: { color: '#EA4335', label: 'Email' },
};

export function PlatformBadge({ platform }: { platform: string }) {
  const style = PLATFORM_STYLES[platform] || { color: '#666', label: platform };
  return <Badge color={style.color}>{style.label}</Badge>;
}

// ── Relative Time ──

export function formatRelativeTime(ts: string | number): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── CSS animations (inject once) ──

const styleId = 'mini-app-animations';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes mini-toast-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes mini-sheet-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes mini-shimmer {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 0.8; }
    }
    @keyframes mini-slide-left {
      from { transform: translateX(100%); opacity: 0.8; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes mini-slide-right {
      from { transform: translateX(-30%); opacity: 0.8; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes mini-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
