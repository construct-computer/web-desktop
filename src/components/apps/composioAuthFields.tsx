import { useState, type Ref } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { AuthField } from './composioAuthUtils';

export function CredentialField({
  field, value, onChange, inputRef,
}: {
  field: AuthField;
  value: string;
  onChange: (v: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [reveal, setReveal] = useState(false);
  const isSecret = /key|secret|token|password|api/i.test(field.name);

  return (
    <div>
      <Label className="text-xs font-medium">
        {field.displayName}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <div className="relative mt-1.5">
        <Input
          ref={inputRef}
          type={isSecret && !reveal ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={cn(isSecret ? 'pr-14 font-mono text-sm' : 'text-sm')}
          placeholder={`Enter ${field.displayName.toLowerCase()}`}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-1 rounded-[4px] text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            tabIndex={-1}
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {field.description && (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)] leading-snug">{field.description}</p>
      )}
    </div>
  );
}

export function ComposioAuthErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 text-[11px] text-red-500 bg-red-500/[0.08] border border-red-500/20 rounded-[8px] px-2.5 py-1.5">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-red-500/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
