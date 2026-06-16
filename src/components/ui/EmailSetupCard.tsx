import { Mail } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import type { EmailSetupPayload } from './emailSetupMarker';

export function EmailSetupCard({ payload }: { payload: EmailSetupPayload }) {
  const openWindow = useWindowStore((s) => s.openWindow);
  const reason = payload.reason?.trim() || 'Set up your Construct email inbox to send and receive mail.';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 max-w-md">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--color-accent)]/15 p-2 text-[var(--color-accent)]">
          <Mail className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-text)]">Set up agent email</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]/80">{reason}</p>
          <button
            type="button"
            className="mt-3 inline-flex items-center rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            onClick={() => openWindow('email')}
          >
            Open Email setup
          </button>
        </div>
      </div>
    </div>
  );
}
