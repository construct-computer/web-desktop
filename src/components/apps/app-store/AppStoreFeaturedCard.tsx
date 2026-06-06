import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import { AppStoreCard } from './AppStoreCard';

/** @deprecated Use AppStoreCard — kept for backwards compatibility */
export function AppStoreFeaturedCard({ app, onClick }: { app: UnifiedApp; onClick: () => void }) {
  return <AppStoreCard app={app} onClick={onClick} />;
}
