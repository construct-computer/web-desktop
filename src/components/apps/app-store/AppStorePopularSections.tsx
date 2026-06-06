import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import { AppStoreGrid } from './AppStoreGrid';
import { AppStoreSection } from './AppStoreSection';

export type PopularGroupSection = {
  id: string;
  label: string;
  apps: UnifiedApp[];
};

export function AppStorePopularSections({
  groups,
  onClick,
}: {
  groups: PopularGroupSection[];
  onClick: (app: UnifiedApp) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <AppStoreSection key={group.id} title={group.label} count={group.apps.length}>
          <AppStoreGrid apps={group.apps} onClick={onClick} />
        </AppStoreSection>
      ))}
    </>
  );
}
