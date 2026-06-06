import type { BrowseCategoryNavItem } from '@/hooks/composioCategories';
import { getCategoryIcon } from './categoryIcons';

export function AppStoreCategorySidebar({
  category,
  categories,
  onSelect,
}: {
  category: string;
  categories: BrowseCategoryNavItem[];
  onSelect: (cat: string) => void;
}) {
  return (
    <nav className="app-store-sidebar border-r border-black/[0.06] dark:border-white/[0.06] surface-sidebar">
      <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] shrink-0">
        Categories
      </p>
      <div className="app-store-sidebar-scroll px-2 pb-2 space-y-0.5">
        {categories.map((c) => {
          const active = category === c.id;
          const Icon = getCategoryIcon(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors ${
                active
                  ? 'bg-[var(--color-accent)] text-white font-medium'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-accent-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0 opacity-90" />
              <span className="truncate capitalize">{c.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function AppStoreCategoryPills({
  category,
  categories,
  onSelect,
}: {
  category: string;
  categories: BrowseCategoryNavItem[];
  onSelect: (cat: string) => void;
}) {
  return (
    <div
      className="app-store-pills flex gap-1.5 pb-2 overflow-x-auto shrink-0 scrollbar-x-none"
      style={{
        maskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, black 0, black calc(100% - 24px), transparent 100%)',
      }}
    >
      {categories.map((c) => {
        const Icon = getCategoryIcon(c.id);
        const active = category === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors border ${
              active
                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                : 'bg-transparent text-[var(--color-text-muted)] border-black/[0.08] dark:border-white/[0.1] hover:text-[var(--color-text)] hover:border-black/[0.12] dark:hover:border-white/[0.16]'
            }`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="capitalize">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
