import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { confirmWorkSideEffect, getAutopilotStatus, type AutopilotWorkSideEffectSnapshot } from '@/services/api';

function isUnresolvedSideEffect(item: AutopilotWorkSideEffectSnapshot): boolean {
  return item.status === 'started' || item.status === 'uncertain';
}

export function SideEffectNotice({ sessionKey }: { sessionKey: string }) {
  const [items, setItems] = useState<AutopilotWorkSideEffectSnapshot[]>([]);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async () => {
    const res = await getAutopilotStatus();
    if (!res.success) return;
    const unresolved = (res.data.workSideEffects ?? []).filter(
      (item) => item.sessionKey === sessionKey && isUnresolvedSideEffect(item),
    );
    const latest = res.data.latestUnresolvedSideEffect;
    if (
      latest
      && latest.sessionKey === sessionKey
      && isUnresolvedSideEffect(latest)
      && !unresolved.some((item) => item.id === latest.id)
    ) {
      unresolved.unshift(latest);
    }
    setItems(unresolved);
  }, [sessionKey]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const item = items[0];
  if (!item) return null;

  const toolLabel = item.toolName.replace(/[_-]/g, ' ').trim() || 'action';

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await confirmWorkSideEffect(item.id, {
        sessionKey,
        summary: `Owner confirmed ${toolLabel} outcome.`,
      });
      if (res.success) await refresh();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="mx-3 sm:mx-6 mb-2 rounded-xl border border-blue-400/20 bg-blue-500/[0.08] px-3 py-2.5 sm:px-4">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-blue-100/95">
            Verify {toolLabel} before retrying
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-blue-100/70">
            Construct recorded an uncertain external action in this chat. Confirm once you have verified the outcome, or retry with a read/status tool.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void handleConfirm(); }}
              disabled={confirming}
              className="rounded-md bg-blue-500/20 px-2.5 py-1 text-[11px] font-medium text-blue-100 hover:bg-blue-500/30 disabled:opacity-60"
            >
              {confirming ? 'Confirming…' : 'Confirm outcome'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
