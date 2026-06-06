import { useState } from 'react';
import { Lock, Package } from 'lucide-react';
import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import {
  buildCardMetaLine,
  sourceBadgeLabel,
  statusInfo,
  STATUS_PILL_CLASS,
} from './appStoreMeta';

function AppStoreIcon({ icon, size = 'md' }: { icon?: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const box = size === 'sm' ? 'w-10 h-10 rounded-[10px]' : 'w-11 h-11 rounded-[11px]';
  const img = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const pkg = size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]';

  return (
    <div className={`${box} surface-control border border-black/[0.06] dark:border-white/[0.06] flex items-center justify-center shrink-0 overflow-hidden`}>
      {icon && !failed ? (
        <img src={icon} alt="" className={`${img} object-contain`} onError={() => setFailed(true)} />
      ) : (
        <Package className={`${pkg} text-[var(--color-text-muted)]`} />
      )}
    </div>
  );
}

export function AppStoreCard({
  app,
  onClick,
}: {
  app: UnifiedApp;
  onClick: () => void;
}) {
  const { label: statusLabel, tone } = statusInfo(app);
  const metaLine = buildCardMetaLine(app);
  const showStatus = tone !== 'available';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col w-full h-full p-2.5 rounded-[11px] surface-card border border-black/[0.06] dark:border-white/[0.06] hover:border-[var(--color-accent)]/25 hover:bg-[var(--color-accent-muted)]/25 transition-colors text-left min-w-0"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AppStoreIcon icon={app.icon} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[12px] font-semibold truncate text-[var(--color-text)]">{app.name}</span>
            {app.status !== 'available' && tone === 'connected' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Connected" />
            )}
            {tone === 'upgrade' && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
          </div>
          <span className="inline-block mt-0.5 text-[10px] font-medium px-1.5 py-px rounded-md surface-control text-[var(--color-text-muted)]">
            {sourceBadgeLabel(app)}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mt-1.5 leading-snug min-h-[2.5em]">
        {app.description || 'No description'}
      </p>

      <div className="mt-auto pt-1.5 flex items-center gap-1.5 flex-wrap min-w-0">
        {metaLine && (
          <span className="text-[10px] text-[var(--color-text-muted)] truncate">{metaLine}</span>
        )}
        {showStatus && (
          <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full flex items-center gap-0.5 shrink-0 ${STATUS_PILL_CLASS[tone]}`}>
            {tone === 'upgrade' && <Lock className="w-2.5 h-2.5" />}
            {statusLabel}
          </span>
        )}
        {app.tags?.includes('from-url') && (
          <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-px rounded-full shrink-0">
            Custom
          </span>
        )}
      </div>
    </button>
  );
}
