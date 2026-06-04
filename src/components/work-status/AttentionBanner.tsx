import { AlertTriangle, XCircle } from 'lucide-react';
import { formatDuration, getAttentionKind, type AttentionKind } from '@/lib/workStatusFormat';

type Props = {
  status: string;
  blockerReason?: string | null;
  stalled?: boolean;
  idleMs?: number;
  failureMessage?: string | null;
};

function bannerCopy(kind: AttentionKind, props: Props): string {
  if (kind === 'blocked') return props.blockerReason || 'Needs your input';
  if (kind === 'failed') {
    return props.failureMessage || 'This task ended without completing.';
  }
  const idle = props.idleMs != null ? ` (idle ${formatDuration(props.idleMs)})` : '';
  return `No progress recently${idle}. The agent may be stuck or waiting on a slow tool.`;
}

export function AttentionBanner(props: Props) {
  const kind = getAttentionKind(props);
  if (!kind) return null;

  const isError = kind === 'failed';
  const boxClass = isError
    ? 'text-red-700 dark:text-red-200 bg-red-500/10 border-red-500/20'
    : 'text-amber-800 dark:text-amber-100 bg-amber-500/12 border-amber-500/20';
  const Icon = isError ? XCircle : AlertTriangle;
  const title = kind === 'blocked' ? 'Problem' : kind === 'failed' ? 'Failed' : 'Stalled';

  return (
    <div className={`flex gap-2 text-[10px] rounded-md px-2 py-1.5 border ${boxClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="font-medium uppercase tracking-wide text-[9px] opacity-80">{title}</span>
        <p className="mt-0.5 leading-snug break-words">{bannerCopy(kind, props)}</p>
      </div>
    </div>
  );
}
