import { cn } from '@/lib/utils';

export function AppStoreBone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-md bg-black/[0.05] dark:bg-white/[0.06] motion-safe:animate-pulse',
        className,
      )}
    />
  );
}

export function AppStoreCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col w-full h-full p-2.5 rounded-[11px] surface-card border border-black/[0.06] dark:border-white/[0.06] min-w-0',
        className,
      )}
      aria-hidden
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AppStoreBone className="w-11 h-11 rounded-[11px] shrink-0" />
        <div className="min-w-0 flex-1 pt-0.5 space-y-1.5">
          <AppStoreBone className="h-3.5 w-[72%]" />
          <AppStoreBone className="h-4 w-16 rounded-md" />
        </div>
      </div>
      <AppStoreBone className="h-3 w-full mt-2" />
      <AppStoreBone className="h-3 w-[88%] mt-1" />
      <AppStoreBone className="h-3 w-[40%] mt-auto pt-2" />
    </div>
  );
}

export function AppStoreGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="app-store-tile-grid" aria-busy aria-label="Loading apps">
      {Array.from({ length: count }, (_, i) => (
        <AppStoreCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function AppStoreListRowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 w-full px-2.5 py-2 rounded-[10px] surface-card border border-black/[0.06] dark:border-white/[0.06] min-w-0"
      aria-hidden
    >
      <AppStoreBone className="w-8 h-8 rounded-[8px] shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <AppStoreBone className="h-3.5 w-[45%]" />
        <AppStoreBone className="h-3 w-[80%]" />
        <AppStoreBone className="h-2.5 w-[30%]" />
      </div>
    </div>
  );
}

export function AppStoreListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1.5" aria-busy aria-label="Loading search results">
      {Array.from({ length: count }, (_, i) => (
        <AppStoreListRowSkeleton key={i} />
      ))}
    </div>
  );
}

function AppStoreSectionSkeleton({
  titleWidth = 'w-32',
  count = 6,
}: {
  titleWidth?: string;
  count?: number;
}) {
  return (
    <section aria-hidden>
      <div className="flex items-baseline justify-between gap-2 mb-2 px-0.5 border-b border-black/[0.06] dark:border-white/[0.06] pb-2">
        <AppStoreBone className={cn('h-3', titleWidth)} />
        <AppStoreBone className="h-3 w-12" />
      </div>
      <AppStoreGridSkeleton count={count} />
    </section>
  );
}

export function AppStoreBrowseSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading integrations">
      <AppStoreSectionSkeleton titleWidth="w-36" count={3} />
      <AppStoreSectionSkeleton titleWidth="w-28" count={4} />
      <AppStoreSectionSkeleton titleWidth="w-32" count={6} />
      <AppStoreSectionSkeleton titleWidth="w-24" count={6} />
    </div>
  );
}

export function AppStoreInfoCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-[10px] border border-black/[0.06] dark:border-white/[0.06] surface-card p-3 space-y-3" aria-hidden>
      <div className="space-y-1">
        <AppStoreBone className="h-3.5 w-28" />
        <AppStoreBone className="h-3 w-40" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <AppStoreBone className="w-3 h-3 rounded-sm shrink-0" />
            <AppStoreBone className="h-3 w-16 shrink-0" />
            <AppStoreBone className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppStoreIntegrationDetailSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <AppStoreInfoCardSkeleton rows={4} />
      <div className="rounded-[10px] border border-black/[0.06] dark:border-white/[0.06] surface-card p-3 space-y-2">
        <AppStoreBone className="h-3.5 w-32" />
        <AppStoreBone className="h-3 w-48" />
        <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.06] divide-y divide-black/[0.06] dark:divide-white/[0.06] overflow-hidden mt-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="px-3 py-2.5 space-y-1">
              <AppStoreBone className="h-3 w-[55%]" />
              <AppStoreBone className="h-2.5 w-[85%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppStoreActionsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden>
      <AppStoreBone className="h-3 w-24 mb-2" />
      <AppStoreBone className="h-8 w-full rounded-[8px] mb-2" />
      <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.06] divide-y divide-black/[0.06] dark:divide-white/[0.06] overflow-hidden">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="px-3 py-2.5 space-y-1">
            <AppStoreBone className="h-3 w-[50%]" />
            <AppStoreBone className="h-2.5 w-[75%]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppStoreHeroSkeleton() {
  return (
    <div className="pb-5 -mt-2 space-y-3" aria-hidden>
      <div className="space-y-2 mt-4">
        <AppStoreBone className="h-3.5 w-full" />
        <AppStoreBone className="h-3.5 w-[92%]" />
        <AppStoreBone className="h-3.5 w-[75%]" />
      </div>
      <div className="flex flex-wrap gap-2">
        <AppStoreBone className="h-3 w-24" />
        <AppStoreBone className="h-3 w-16" />
        <AppStoreBone className="h-3 w-20" />
      </div>
    </div>
  );
}

export function AppStoreDetailBodySkeleton({
  isComposio,
  actionsCount = 8,
}: {
  isComposio?: boolean;
  actionsCount?: number;
}) {
  return (
    <div className="app-store-detail-body w-full max-w-none" aria-busy aria-label="Loading app details">
      <div className="app-store-detail-primary space-y-4">
        {isComposio ? (
          <AppStoreIntegrationDetailSkeleton />
        ) : (
          <AppStoreInfoCardSkeleton rows={4} />
        )}
      </div>
      <div className="app-store-detail-secondary">
        <AppStoreActionsSkeleton count={actionsCount} />
      </div>
    </div>
  );
}
