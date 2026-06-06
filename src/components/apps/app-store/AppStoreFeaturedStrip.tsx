import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import { AppStoreGrid } from './AppStoreGrid';
import { AppStoreSection } from './AppStoreSection';

export function AppStoreFeaturedStrip({
  apps,
  onClick,
}: {
  apps: UnifiedApp[];
  onClick: (app: UnifiedApp) => void;
}) {
  if (apps.length === 0) return null;

  return (
    <AppStoreSection title="Made for Construct" count={apps.length}>
      <AppStoreGrid apps={apps} onClick={onClick} />
    </AppStoreSection>
  );
}
