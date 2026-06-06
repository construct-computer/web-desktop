import type { UnifiedApp } from '@/hooks/useAppDiscovery';
import { AppStoreCard } from './AppStoreCard';

/** @deprecated Use AppStoreCard — kept for imports that expect AppStoreTile */
export function AppStoreTile({
  app,
  onClick,
  variant: _variant = 'default',
}: {
  app: UnifiedApp;
  onClick: () => void;
  variant?: 'default' | 'compact';
}) {
  return <AppStoreCard app={app} onClick={onClick} />;
}
