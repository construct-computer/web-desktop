/**
 * Select — themed dropdown that replaces native <select>.
 *
 * Native <select> dropdowns can't be styled (the open menu is OS-controlled),
 * so we render a button trigger and a portaled menu we can fully theme.
 *
 * Features: optgroups, optional search, keyboard nav, auto-position above when
 * menu would overflow viewport, click-outside / Escape to close.
 */

import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';
import { Z_INDEX } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label?: string;
  options: SelectOption[];
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  /** Tailwind classes for the trigger button. */
  className?: string;
  /** Menu alignment relative to trigger. Default 'left'. */
  align?: 'left' | 'right';
  /** Max menu height in px. Default 280. */
  maxHeight?: number;
  /** Render trigger inline (no full width). Default false (full width). */
  inline?: boolean;
  /** Format the trigger label. Falls back to selected option label. */
  formatTrigger?: (option: SelectOption | undefined) => React.ReactNode;
}

export function Select({
  value,
  onChange,
  options,
  groups,
  placeholder = 'Select...',
  searchable = false,
  disabled = false,
  className,
  align = 'left',
  maxHeight = 280,
  inline = false,
  formatTrigger,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number; placement: 'below' | 'above' }>(
    { top: 0, left: 0, width: 0, placement: 'below' },
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Flatten groups → ordered list of options for keyboard navigation.
  const flatGroups: SelectGroup[] = useMemo(() => {
    if (groups) return groups;
    return [{ options: options ?? [] }];
  }, [groups, options]);

  // Filtered groups based on search query.
  const filteredGroups = useMemo(() => {
    if (!query.trim()) return flatGroups;
    const q = query.trim().toLowerCase();
    return flatGroups
      .map((g) => ({
        ...g,
        options: g.options.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [flatGroups, query]);

  // Flat option array (for keyboard nav).
  const flatOptions: SelectOption[] = useMemo(
    () => filteredGroups.flatMap((g) => g.options),
    [filteredGroups],
  );

  // Find currently selected option (across all groups).
  const selectedOption = useMemo(() => {
    for (const g of flatGroups) {
      const found = g.options.find((o) => o.value === value);
      if (found) return found;
    }
    return undefined;
  }, [flatGroups, value]);

  // Position the menu when it opens.
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const desiredHeight = maxHeight + 60; // include search bar / padding allowance
    const placeBelow = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove;

    const minWidth = Math.max(rect.width, 220);
    const left = align === 'right' ? rect.right - minWidth : rect.left;

    setMenuRect({
      top: placeBelow ? rect.bottom + 4 : rect.top - 4,
      left: Math.max(8, Math.min(left, window.innerWidth - minWidth - 8)),
      width: minWidth,
      placement: placeBelow ? 'below' : 'above',
    });
  }, [align, maxHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  // Reposition on scroll / resize while open.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, flatOptions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = flatOptions[highlightIdx];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setOpen(false);
          setQuery('');
        }
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, flatOptions, highlightIdx, onChange]);

  // Reset highlight when query changes.
  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  // Focus search when menu opens.
  useEffect(() => {
    if (open && searchable) {
      // setTimeout so the input has mounted in the portal
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, searchable]);

  // Auto-scroll highlighted item into view.
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current?.querySelector<HTMLElement>(`[data-select-idx="${highlightIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((o) => !o);
    setQuery('');
    // Highlight the currently-selected option when opening
    const idx = flatOptions.findIndex((o) => o.value === value);
    setHighlightIdx(idx >= 0 ? idx : 0);
  };

  const triggerLabel = formatTrigger
    ? formatTrigger(selectedOption)
    : selectedOption?.label ?? placeholder;

  // Build flat index for highlight tracking across groups.
  let flatIdxCounter = 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[12px]',
          'surface-control',
          'border border-black/[0.08] dark:border-white/[0.08]',
          'text-[var(--color-text)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/40',
          'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          inline ? '' : 'w-full',
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate', !selectedOption && 'text-[var(--color-text-muted)]')}>
          {triggerLabel}
        </span>
        <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-60" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: 'fixed',
            top: menuRect.placement === 'below' ? menuRect.top : undefined,
            bottom: menuRect.placement === 'above' ? window.innerHeight - menuRect.top : undefined,
            left: menuRect.left,
            width: menuRect.width,
            zIndex: Z_INDEX.menu,
          }}
          className={cn(
            'rounded-lg overflow-hidden',
            'glass-popover',
            'border border-white/[0.08]',
            'shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
          )}
        >
          {searchable && (
            <div className="relative border-b border-white/[0.08]">
              <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-2 text-[12px] bg-transparent text-white placeholder:text-white/30 focus:outline-none"
              />
            </div>
          )}

          <div className="overflow-y-auto py-1" style={{ maxHeight }}>
            {flatOptions.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-white/40">No options</div>
            ) : (
              filteredGroups.map((group, gi) => (
                <div key={gi}>
                  {group.label && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      {group.label}
                    </div>
                  )}
                  {group.options.map((opt) => {
                    const idx = flatIdxCounter++;
                    const isSelected = opt.value === value;
                    const isHighlighted = idx === highlightIdx;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-select-idx={idx}
                        role="option"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        onMouseEnter={() => setHighlightIdx(idx)}
                        onClick={() => {
                          if (opt.disabled) return;
                          onChange(opt.value);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors',
                          isHighlighted ? 'bg-white/[0.08]' : 'bg-transparent',
                          opt.disabled && 'opacity-40 cursor-not-allowed',
                          'text-white',
                        )}
                      >
                        <span className="w-3 flex-shrink-0">
                          {isSelected && <Check className="w-3 h-3 text-[var(--color-accent)]" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{opt.label}</span>
                          {opt.description && (
                            <span className="block text-[10px] text-white/40 truncate">{opt.description}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
