import { useState } from 'react';
import { Package } from 'lucide-react';
import { AnimatedListItem } from '@/components/ui';
import { useAnimatedList } from '@/hooks/useAnimatedList';
import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import { AppStoreCard } from './AppStoreCard';
import { buildCardMetaLine, statusInfo, STATUS_PILL_CLASS } from './appStoreMeta';

function ListRowIcon({ icon }: { icon?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-8 h-8 rounded-[8px] surface-control border border-black/[0.06] dark:border-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
      {icon && !failed ? (
        <img
          src={icon}
          alt=""
          className="w-6 h-6 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className="w-4 h-4 text-[var(--color-text-muted)]" />
      )}
    </div>
  );
}

export function AppStoreListRow({ app, onClick }: { app: UnifiedApp; onClick: () => void }) {
  const { label: statusLabel, tone } = statusInfo(app);
  const metaLine = buildCardMetaLine(app);
  const showStatus = tone !== 'available';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-2.5 py-2 rounded-[10px] surface-card border border-black/[0.06] dark:border-white/[0.06] hover:border-[var(--color-accent)]/25 hover:bg-[var(--color-accent-muted)]/20 transition-colors text-left min-w-0"
    >
      <ListRowIcon icon={app.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-semibold truncate text-[var(--color-text)]">{app.name}</span>
          {showStatus && (
            <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full shrink-0 ${STATUS_PILL_CLASS[tone]}`}>
              {statusLabel}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-1 mt-0.5">
          {app.description || 'No description'}
        </p>
        {metaLine && (
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{metaLine}</p>
        )}
      </div>
    </button>
  );
}

export function AppStoreGrid({
  apps,
  onClick,
}: {
  apps: UnifiedApp[];
  onClick: (app: UnifiedApp) => void;
}) {
  const entries = useAnimatedList(apps, (app) => app.id);

  return (
    <div className="app-store-tile-grid">
      {entries.map(({ key, item, phase }) => (
        <AnimatedListItem key={key} phase={phase} className="h-full">
          <AppStoreCard app={item} onClick={() => onClick(item)} />
        </AnimatedListItem>
      ))}
    </div>
  );
}

export function AppStoreList({
  apps,
  onClick,
}: {
  apps: UnifiedApp[];
  onClick: (app: UnifiedApp) => void;
}) {
  const entries = useAnimatedList(apps, (app) => app.id);

  return (
    <div className="space-y-1.5">
      {entries.map(({ key, item, phase }) => (
        <AnimatedListItem key={key} phase={phase}>
          <AppStoreListRow app={item} onClick={() => onClick(item)} />
        </AnimatedListItem>
      ))}
    </div>
  );
}
