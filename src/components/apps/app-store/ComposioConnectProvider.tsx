import { createContext, useContext, type ReactNode } from 'react';
import type { ComposioAuthPrefetch } from '@/hooks/useComposioAuth';
import { useComposioConnectFlow } from '@/hooks/useComposioConnectFlow';
import { ComposioConnectHeader } from './ComposioConnectHeader';
import { ComposioCredentialModal } from './ComposioCredentialModal';

type ComposioConnectSlots = {
  header: ReactNode;
  modal: ReactNode;
};

const ComposioConnectContext = createContext<ComposioConnectSlots | null>(null);

export function useComposioConnectHeaderSlot(): ReactNode {
  return useContext(ComposioConnectContext)?.header ?? null;
}

export function ComposioConnectHeaderSlot() {
  const header = useComposioConnectHeaderSlot();
  return <>{header}</>;
}

export function ComposioConnectModalSlot() {
  const modal = useContext(ComposioConnectContext)?.modal ?? null;
  return <>{modal}</>;
}

function ComposioConnectProviderInner({
  slug,
  name,
  prefetch,
  onConnected,
  children,
}: {
  slug: string;
  name: string;
  prefetch?: ComposioAuthPrefetch;
  onConnected?: () => void;
  children: ReactNode;
}) {
  const flow = useComposioConnectFlow(slug, prefetch, onConnected);

  const value: ComposioConnectSlots = {
    header: (
      <ComposioConnectHeader auth={flow.auth} onOpenCredential={flow.openCredential} />
    ),
    modal: (
      <ComposioCredentialModal
        open={flow.credentialScheme !== null}
        scheme={flow.credentialScheme ?? 'API_KEY'}
        name={name}
        isMobile={flow.isMobile}
        auth={flow.auth}
        onClose={flow.closeCredential}
        onSubmit={() => void flow.submitCredential()}
      />
    ),
  };

  return (
    <ComposioConnectContext.Provider value={value}>
      {children}
    </ComposioConnectContext.Provider>
  );
}

export function ComposioConnectProvider({
  enabled,
  slug,
  name,
  prefetch,
  onConnected,
  children,
}: {
  enabled: boolean;
  slug: string;
  name: string;
  prefetch?: ComposioAuthPrefetch;
  onConnected?: () => void;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <ComposioConnectProviderInner
      slug={slug}
      name={name}
      prefetch={prefetch}
      onConnected={onConnected}
    >
      {children}
    </ComposioConnectProviderInner>
  );
}
