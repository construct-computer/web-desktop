export function AppStoreSection({
  title,
  count,
  visibleCount,
  totalCount,
  isExpanded,
  onShowAll,
  children,
}: {
  title: string;
  count?: number;
  visibleCount?: number;
  totalCount?: number;
  isExpanded?: boolean;
  onShowAll?: () => void;
  children: React.ReactNode;
}) {
  const capped = totalCount != null && visibleCount != null && totalCount > visibleCount;
  const showExpand = capped && !isExpanded && onShowAll;
  const headerCount = capped
    ? (isExpanded ? `${totalCount} apps` : `${visibleCount} of ${totalCount}`)
    : count != null && count > 0
      ? `${count} app${count === 1 ? '' : 's'}`
      : null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 mb-2 px-0.5 border-b border-black/[0.06] dark:border-white/[0.06] pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] min-w-0 truncate">
          {title}
        </h2>
        {headerCount !== null && (
          <span className="text-[10px] font-medium text-[var(--color-text-muted)] opacity-70 flex-shrink-0 tabular-nums">
            {headerCount}
          </span>
        )}
      </div>
      {children}
      {showExpand && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-2 w-full py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-md transition-colors"
        >
          Show all {totalCount} apps
        </button>
      )}
    </section>
  );
}
