import { Check } from 'lucide-react';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useComposioAuth, type ComposioAuthPrefetch } from '@/hooks/useComposioAuth';
import { getExpandSide } from '@/lib/onboardingIntegrations';
import { cn } from '@/lib/utils';
import { IntegrationExpandedPanel } from './IntegrationExpandedPanel';

const COLLAPSED_ICON_SIZE = 44;

interface IntegrationIconTileProps {
  slug: string;
  label: string;
  tagline: string;
  connected: boolean;
  index: number;
  columnsPerRow: number;
  expanded?: boolean;
  isCovered?: boolean;
  isOverlayActive?: boolean;
  prefetch?: ComposioAuthPrefetch;
  logoUrl?: string;
  authPending?: boolean;
  onToggle?: () => void;
  onHoverChange?: (slug: string | null) => void;
  onConnected?: () => void;
}

export function IntegrationIconTile(props: IntegrationIconTileProps) {
  if (props.authPending) {
    return <IntegrationIconTileView {...props} />;
  }
  return <IntegrationIconTileAuthed {...props} />;
}

function IntegrationIconTileAuthed(props: IntegrationIconTileProps) {
  const auth = useComposioAuth(props.slug, props.onConnected, props.prefetch);
  const hasPrefetch = Boolean(props.prefetch?.authSchemes?.length);

  if (auth.loading && !hasPrefetch) {
    return (
      <div
        className="aspect-square rounded-xl border border-white/10 bg-white/4 animate-pulse"
        aria-hidden
      />
    );
  }

  return (
    <IntegrationIconTileView
      {...props}
      anyBusy={auth.anyBusy}
      error={auth.error}
      onConnect={(e) => {
        e.stopPropagation();
        const scheme = auth.managedOAuth[0];
        if (scheme) void auth.startOAuth(scheme);
      }}
    />
  );
}

interface IntegrationIconTileViewProps extends IntegrationIconTileProps {
  anyBusy?: boolean;
  error?: string | null;
  onConnect?: (e: { stopPropagation: () => void }) => void;
}

function IntegrationIconTileView({
  slug,
  label,
  tagline,
  connected,
  index,
  columnsPerRow,
  expanded = false,
  isCovered = false,
  isOverlayActive = false,
  logoUrl,
  authPending = false,
  anyBusy = false,
  error = null,
  onToggle,
  onHoverChange,
  onConnect,
}: IntegrationIconTileViewProps) {
  const expandSide = getExpandSide(index, columnsPerRow);
  const prefersReducedMotion =
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isCovered) {
    return <div className="relative aspect-square min-w-0 pointer-events-none" aria-hidden />;
  }

  const handleTileClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
      onToggle?.();
    }
  };

  const transitionClass = prefersReducedMotion
    ? ''
    : 'transition-[width,box-shadow,border-color,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]';

  const isOpen = expanded;
  const expandWidth = 'w-[calc(200%+0.75rem)]';
  const expandAnchor = expandSide === 'right' ? 'left-0' : 'right-0';

  const openSurfaceStyles = cn(
    expandWidth,
    expandAnchor,
    'z-20 h-full',
    'rounded-xl border-[var(--color-accent)]/45 bg-[var(--color-surface)]',
    'shadow-[0_10px_36px_rgba(0,0,0,0.35)] ring-1 ring-white/5',
  );

  const showExpanded = cn(
    isOpen && 'flex',
    !isOpen && '[@media(hover:hover)]:group-hover/card:flex',
  );

  const hideCollapsed = cn(
    isOpen && 'hidden',
    !isOpen && '[@media(hover:hover)]:group-hover/card:hidden',
  );

  const cardClasses = cn(
    'group/card absolute top-0 min-w-0 overflow-hidden',
    'rounded-xl border border-white/10 bg-white/4',
    'cursor-default select-none',
    transitionClass,
    'w-full h-full',
    isOpen && openSurfaceStyles,
    !isOpen && '[@media(hover:hover)]:hover:w-[calc(200%+0.75rem)] [@media(hover:hover)]:hover:z-20',
    !isOpen && expandSide === 'right' && '[@media(hover:hover)]:hover:left-0',
    !isOpen && expandSide === 'left' && '[@media(hover:hover)]:hover:right-0',
    !isOpen && '[@media(hover:hover)]:hover:border-[var(--color-accent)]/45 [@media(hover:hover)]:hover:bg-[var(--color-surface)] [@media(hover:hover)]:hover:shadow-[0_10px_36px_rgba(0,0,0,0.35)] [@media(hover:hover)]:hover:ring-1 [@media(hover:hover)]:hover:ring-white/5',
  );

  return (
    <div className={cn('relative aspect-square min-w-0', isOverlayActive && 'z-20')}>
      <div
        role="button"
        tabIndex={0}
        data-open={isOpen ? 'true' : 'false'}
        onClick={handleTileClick}
        onMouseEnter={() => onHoverChange?.(slug)}
        onMouseLeave={() => onHoverChange?.(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleTileClick();
          }
        }}
        className={cardClasses}
      >
        {connected && !isOpen && (
          <span className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}

        <div className={cn('flex h-full w-full items-center justify-center', hideCollapsed)}>
          <PlatformIcon
            platform={slug}
            size={COLLAPSED_ICON_SIZE}
            logoUrl={logoUrl}
            name={label}
            className="shrink-0"
          />
        </div>

        <div className={cn('hidden h-full min-h-0 w-full', showExpanded)}>
          <IntegrationExpandedPanel
            slug={slug}
            label={label}
            tagline={tagline}
            logoUrl={logoUrl}
            connected={connected}
            authPending={authPending}
            anyBusy={anyBusy}
            error={error}
            prefersReducedMotion={prefersReducedMotion}
            onConnect={onConnect ?? (() => {})}
          />
        </div>
      </div>
    </div>
  );
}
