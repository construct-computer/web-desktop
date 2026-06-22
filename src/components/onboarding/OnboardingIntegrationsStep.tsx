import { useEffect, useMemo, useRef, useState } from 'react';
import { composioIconUrl } from '@/lib/composioToolkitCache';
import { readRecommendationsFromSession } from '@/lib/onboardingCatalogCache';
import {
  recommendIntegrationsSync,
  refreshOnboardingRecommendations,
} from '@/lib/onboardingRecommendations';
import {
  areSlugsResolved,
  buildIntegrationDisplayTiles,
  getCoveredNeighborIndex,
  ONBOARDING_INTEGRATION_COLUMNS,
  type OnboardingIntegrationDisplay,
} from '@/lib/onboardingIntegrations';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useAppStore } from '@/stores/appStore';
import { IntegrationIconTile } from './IntegrationIconTile';
import { OnboardingStepHeader } from './OnboardingStepHeader';

const GRID_CLASS = 'mx-auto max-w-lg grid grid-cols-3 gap-3';

export function OnboardingIntegrationsStep() {
  const profile = useOnboardingStore((s) => s.profile);
  const progress = useOnboardingStore((s) => s.progress);
  const saveProgress = useOnboardingStore((s) => s.saveProgress);
  const trackEvent = useOnboardingStore((s) => s.trackEvent);
  const connectedToolkits = useAppStore((s) => s.connectedToolkits);
  const fetchApps = useAppStore((s) => s.fetchApps);
  const columnsPerRow = ONBOARDING_INTEGRATION_COLUMNS;

  const { candidates, rankedPool } = useMemo(
    () => recommendIntegrationsSync(profile),
    [profile],
  );

  const candidateSlugs = useMemo(
    () => candidates.map((c) => c.slug),
    [candidates],
  );

  const logoBySlug = useMemo(() => {
    const cached = readRecommendationsFromSession(profile);
    return new Map((cached?.candidates ?? []).map((c) => [c.slug, c.logo]));
  }, [profile]);

  const [authRevision, setAuthRevision] = useState(0);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allResolved = areSlugsResolved(rankedPool.length > 0 ? rankedPool : candidateSlugs);

  const displayTiles: OnboardingIntegrationDisplay[] = useMemo(() => {
    void authRevision;
    const base = buildIntegrationDisplayTiles(candidates).map((tile) => ({
      ...tile,
      logoUrl: tile.logoUrl ?? logoBySlug.get(tile.slug) ?? composioIconUrl(tile.slug),
    }));

    if (!allResolved) return base;

    return base.map((tile) => {
      const cached = buildIntegrationDisplayTiles([{
        slug: tile.slug,
        label: tile.label,
        tagline: tile.tagline,
      }])[0];
      if (cached && !cached.authPending && cached.authPrefetch) {
        return { ...tile, authPrefetch: cached.authPrefetch, authPending: false, logoUrl: cached.logoUrl ?? tile.logoUrl };
      }
      return tile;
    });
  }, [allResolved, authRevision, candidates, logoBySlug]);

  useEffect(() => {
    let cancelled = false;
    void refreshOnboardingRecommendations(profile).then(() => {
      if (!cancelled) setAuthRevision((v) => v + 1);
    });
    return () => { cancelled = true; };
  }, [profile]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!gridRef.current?.contains(e.target as Node)) {
        setExpandedSlug(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const connectedSlugs = new Set(
    connectedToolkits.map((t) => t.toolkit.toLowerCase()),
  );

  const overlaySlug = expandedSlug ?? hoveredSlug;
  const coveredIndex = useMemo(() => {
    if (!overlaySlug) return -1;
    const activeIndex = displayTiles.findIndex((e) => e.slug === overlaySlug);
    return getCoveredNeighborIndex(activeIndex, columnsPerRow, displayTiles.length);
  }, [displayTiles, overlaySlug, columnsPerRow]);

  const handleConnected = (slug: string) => {
    const existing = progress.integrationsConnected ?? [];
    if (!existing.includes(slug)) {
      void saveProgress({ integrationsConnected: [...existing, slug] });
      trackEvent('onboarding_integration_connected', { integration: slug });
    }
    void fetchApps();
  };

  return (
    <>
      <OnboardingStepHeader
        title="Connect your apps"
        description="Suggested for you based on your answers — add more anytime from Apps."
      />

      {displayTiles.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No OAuth apps available to connect right now. You can add integrations later from Apps.
        </p>
      ) : (
        <div
          ref={gridRef}
          className={GRID_CLASS}
          style={{ '--tile-gap': '0.75rem' } as React.CSSProperties}
        >
          {displayTiles.map((entry, index) => (
            <IntegrationIconTile
              key={entry.slug}
              slug={entry.slug}
              label={entry.label}
              tagline={entry.tagline}
              prefetch={entry.authPrefetch}
              logoUrl={entry.logoUrl ?? composioIconUrl(entry.slug)}
              authPending={entry.authPending}
              index={index}
              columnsPerRow={columnsPerRow}
              connected={connectedSlugs.has(entry.slug)}
              expanded={expandedSlug === entry.slug}
              isCovered={index === coveredIndex}
              isOverlayActive={overlaySlug === entry.slug}
              onHoverChange={setHoveredSlug}
              onToggle={() => setExpandedSlug((prev) => (prev === entry.slug ? null : entry.slug))}
              onConnected={() => handleConnected(entry.slug)}
            />
          ))}
        </div>
      )}
    </>
  );
}
